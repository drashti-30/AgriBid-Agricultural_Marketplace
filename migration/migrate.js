const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DATA_DIR = path.join(__dirname, "..", "data");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "agribid",
  waitForConnections: true,
  connectionLimit: 5,
  decimalNumbers: true
});

function readJson(filename) {
  const filePath = path.join(DATA_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();

  const statusMap = {
    active: "active",
    scheduled: "scheduled",
    closed: "closed",
    cancelled: "cancelled"
  };

  return statusMap[value] || "scheduled";
}

function toMySqlDateTime(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function createLegacyEmail(role, idOrName) {
  const raw = String(idOrName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `legacy-${role}-${raw || "user"}@agribid.local`;
}

function createLegacyPasswordHash() {
  // Phase 4 did not have real server-side passwords.
  // Phase 11 will replace these placeholder values with real password hashes.
  return "LEGACY_ACCOUNT_NO_PASSWORD";
}

async function getOrCreateUser(connection, userData) {
  const [existing] = await connection.execute(
    "SELECT user_id FROM users WHERE email = ? LIMIT 1",
    [userData.email]
  );

  if (existing.length) {
    await connection.execute(
      `UPDATE users
       SET name = ?, phone = ?, role = ?, account_status = ?
       WHERE user_id = ?`,
      [
        userData.name,
        userData.phone || null,
        userData.role,
        userData.accountStatus || "active",
        existing[0].user_id
      ]
    );

    return existing[0].user_id;
  }

  const [result] = await connection.execute(
    `INSERT INTO users
      (name, email, password_hash, phone, role, account_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userData.name,
      userData.email,
      createLegacyPasswordHash(),
      userData.phone || null,
      userData.role,
      userData.accountStatus || "active"
    ]
  );

  return result.insertId;
}

async function migrateCrops(connection, crops) {
  const cropIdMap = new Map();

  for (const crop of crops) {
    const [existing] = await connection.execute(
      "SELECT crop_id FROM crops WHERE name = ? LIMIT 1",
      [crop.name]
    );

    let cropId;

    if (existing.length) {
      cropId = existing[0].crop_id;

      await connection.execute(
        `UPDATE crops
         SET category = ?
         WHERE crop_id = ?`,
        [crop.category || null, cropId]
      );
    } else {
      const [result] = await connection.execute(
        `INSERT INTO crops (name, category, description)
         VALUES (?, ?, ?)`,
        [crop.name, crop.category || null, null]
      );

      cropId = result.insertId;
    }

    cropIdMap.set(Number(crop.id), Number(cropId));
  }

  console.log(`Crops migrated: ${cropIdMap.size}`);
  return cropIdMap;
}

async function migrateFarmers(connection, farmers) {
  const farmerIdMap = new Map();

  for (const farmer of farmers) {
    const email = createLegacyEmail("farmer", farmer.id);

    const userId = await getOrCreateUser(connection, {
      name: farmer.name,
      email,
      phone: farmer.phone,
      role: "farmer",
      accountStatus: "active"
    });

    await connection.execute(
      `INSERT INTO farmers
        (farmer_id, user_id, farm_name, farm_location, address)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        farm_location = VALUES(farm_location)`,
      [
        Number(farmer.id),
        userId,
        farmer.name,
        farmer.location || null,
        farmer.location || null
      ]
    );

    const farmerId = Number(farmer.id);
    farmerIdMap.set(Number(farmer.id), farmerId);

    // Migrate the old boolean verification state into the new
    // shared verification table. False means "not verified yet",
    // so it becomes pending rather than rejected.
    const [existingVerification] = await connection.execute(
      `SELECT verification_id
       FROM verifications
       WHERE user_id = ?
       ORDER BY verification_id DESC
       LIMIT 1`,
      [userId]
    );

    if (existingVerification.length) {
      await connection.execute(
        `UPDATE verifications
         SET status = ?,
             reviewed_at = ?,
             rejection_reason = NULL
         WHERE verification_id = ?`,
        [
          farmer.verified ? "approved" : "pending",
          farmer.verified ? new Date() : null,
          existingVerification[0].verification_id
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO verifications
          (user_id, document_type, status, submitted_at, reviewed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          "legacy-profile-verification",
          farmer.verified ? "approved" : "pending",
          new Date(),
          farmer.verified ? new Date() : null
        ]
      );
    }
  }

  console.log(`Farmers migrated: ${farmerIdMap.size}`);
  return farmerIdMap;
}

async function migrateBuyers(connection, bids) {
  const buyerIdMap = new Map();
  const uniqueBuyerNames = [
    ...new Set(
      bids
        .map(bid => String(bid.buyerName || "").trim())
        .filter(Boolean)
    )
  ];

  for (const buyerName of uniqueBuyerNames) {
    const email = createLegacyEmail("buyer", buyerName);

    const userId = await getOrCreateUser(connection, {
      name: buyerName,
      email,
      role: "buyer",
      accountStatus: "active"
    });

    const [existing] = await connection.execute(
      "SELECT buyer_id FROM buyers WHERE user_id = ? LIMIT 1",
      [userId]
    );

    let buyerId;

    if (existing.length) {
      buyerId = existing[0].buyer_id;
      await connection.execute(
        `UPDATE buyers
         SET business_name = ?
         WHERE buyer_id = ?`,
        [buyerName, buyerId]
      );
    } else {
      const [result] = await connection.execute(
        `INSERT INTO buyers (user_id, business_name)
         VALUES (?, ?)`,
        [userId, buyerName]
      );
      buyerId = result.insertId;
    }

    buyerIdMap.set(buyerName, Number(buyerId));
  }

  console.log(`Legacy buyers created: ${buyerIdMap.size}`);
  return buyerIdMap;
}

async function migrateAuctions(connection, auctions, cropIdMap, farmerIdMap) {
  for (const auction of auctions) {
    const cropId = cropIdMap.get(Number(auction.cropId));
    const farmerId = farmerIdMap.get(Number(auction.farmerId));

    if (!cropId) {
      throw new Error(
        `Auction ${auction.id}: cropId ${auction.cropId} was not mapped.`
      );
    }

    if (!farmerId) {
      throw new Error(
        `Auction ${auction.id}: farmerId ${auction.farmerId} was not mapped.`
      );
    }

    await connection.execute(
      `INSERT INTO auctions
        (auction_id, farmer_id, crop_id, title, description,
         quantity, unit, quality, starting_price, current_bid,
         minimum_increment, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        farmer_id = VALUES(farmer_id),
        crop_id = VALUES(crop_id),
        title = VALUES(title),
        description = VALUES(description),
        quantity = VALUES(quantity),
        unit = VALUES(unit),
        quality = VALUES(quality),
        starting_price = VALUES(starting_price),
        current_bid = VALUES(current_bid),
        minimum_increment = VALUES(minimum_increment),
        start_time = VALUES(start_time),
        end_time = VALUES(end_time),
        status = VALUES(status)`,
      [
        Number(auction.id),
        farmerId,
        cropId,
        auction.title,
        null,
        Number(auction.quantity),
        auction.unit,
        null,
        Number(auction.basePrice),
        Number(auction.currentBid),
        Number(auction.minimumIncrement),
        toMySqlDateTime(auction.startTime),
        toMySqlDateTime(auction.endTime),
        normalizeStatus(auction.status)
      ]
    );
  }

  console.log(`Auctions migrated: ${auctions.length}`);
}

async function migrateBids(connection, bids, buyerIdMap) {
  for (const bid of bids) {
    const buyerName = String(bid.buyerName || "").trim();
    const buyerId = buyerIdMap.get(buyerName);

    if (!buyerId) {
      throw new Error(
        `Bid ${bid.id}: buyer "${buyerName}" was not mapped.`
      );
    }

    await connection.execute(
      `INSERT INTO bids
        (bid_id, auction_id, buyer_id, amount, bid_time, status)
       VALUES (?, ?, ?, ?, ?, 'valid')
       ON DUPLICATE KEY UPDATE
        auction_id = VALUES(auction_id),
        buyer_id = VALUES(buyer_id),
        amount = VALUES(amount),
        bid_time = VALUES(bid_time),
        status = VALUES(status)`,
      [
        Number(bid.id),
        Number(bid.auctionId),
        buyerId,
        Number(bid.amount),
        toMySqlDateTime(bid.time)
      ]
    );
  }

  console.log(`Bids migrated: ${bids.length}`);
}

async function main() {
  const connection = await pool.getConnection();

  try {
    console.log("Starting AgriBid Phase 7 migration...\n");

    const crops = readJson("crops.json");
    const farmers = readJson("farmers.json");
    const auctions = readJson("auctions.json");
    const bids = readJson("bids.json");

    console.log(`Source records:`);
    console.log(`  Crops: ${crops.length}`);
    console.log(`  Farmers: ${farmers.length}`);
    console.log(`  Auctions: ${auctions.length}`);
    console.log(`  Bids: ${bids.length}\n`);

    await connection.beginTransaction();

    const cropIdMap = await migrateCrops(connection, crops);
    const farmerIdMap = await migrateFarmers(connection, farmers);
    const buyerIdMap = await migrateBuyers(connection, bids);

    await migrateAuctions(
      connection,
      auctions,
      cropIdMap,
      farmerIdMap
    );

    await migrateBids(connection, bids, buyerIdMap);

    await connection.commit();

    console.log("\nMigration completed successfully.");
    console.log("Transaction committed.\n");
  } catch (error) {
    await connection.rollback();
    console.error("\nMigration failed.");
    console.error("Transaction rolled back.");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
