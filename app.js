const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const db = require("./db");
const { hashPassword, comparePassword, generateToken, sanitizeUser } = require("./utils/auth");
const authenticate = require("./middleware/auth");
const { authorize } = require("./middleware/roles");

const PUBLIC_DIRECTORY = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}

function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", chunk => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                reject(new Error("Request body is too large."));
                req.destroy();
            }
        });
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(new Error("Invalid JSON request body."));
            }
        });
        req.on("error", reject);
    });
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function toMySQLDateTime(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace("T", " ");
}

function normalizeStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "active") return "active";
    if (value === "scheduled") return "scheduled";
    if (value === "closed") return "closed";
    if (value === "cancelled") return "cancelled";
    return null;
}

function displayStatus(status) {
    const statusMap = {
        active: "Active",
        scheduled: "Scheduled",
        closed: "Closed",
        cancelled: "Cancelled"
    };
    return statusMap[status] || status;
}

function validateAuctionInput(body) {
    const cropId = toNumber(body.cropId);
    const farmerId = toNumber(body.farmerId);
    const quantity = toNumber(body.quantity);
    const basePrice = toNumber(body.basePrice);
    const currentBid = body.currentBid === undefined || body.currentBid === ""
        ? basePrice
        : toNumber(body.currentBid);
    const minimumIncrement = toNumber(body.minimumIncrement);
    const startTime = toMySQLDateTime(body.startTime);
    const endTime = toMySQLDateTime(body.endTime);

    if (!cropId || !farmerId) return { error: "cropId and farmerId are required." };
    if (!body.title || !String(body.title).trim()) return { error: "Auction title is required." };
    if (quantity === null || quantity <= 0) return { error: "Quantity must be greater than 0." };
    if (basePrice === null || basePrice < 0) return { error: "Base price must be 0 or greater." };

    if (currentBid === null || currentBid < basePrice) {
        return { error: "Current bid must be greater than or equal to the base price." };
    }

    if (minimumIncrement === null || minimumIncrement <= 0) {
        return { error: "Minimum increment must be greater than 0." };
    }

    if (!startTime || !endTime) return { error: "Valid startTime and endTime are required." };
    if (new Date(body.startTime) >= new Date(body.endTime)) {
        return { error: "startTime must be before endTime." };
    }

    return {
        value: {
            cropId,
            farmerId,
            title: String(body.title).trim(),
            description: body.description || null,
            quantity,
            unit: String(body.unit || "kg").trim(),
            quality: body.quality || null,
            basePrice,
            currentBid,
            minimumIncrement,
            status: normalizeStatus(body.status) || "scheduled",
            startTime,
            endTime,
            latitude: body.latitude === "" || body.latitude === undefined ? null : toNumber(body.latitude),
            longitude: body.longitude === "" || body.longitude === undefined ? null : toNumber(body.longitude),
            location: body.location || null
        }
    };
}

function serveStaticFile(res, pathname) {
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.resolve(PUBLIC_DIRECTORY, `.${requestedPath}`);

    if (!filePath.startsWith(PUBLIC_DIRECTORY + path.sep)) {
        sendJSON(res, 403, { message: "Forbidden." });
        return true;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;

    const extension = path.extname(filePath).toLowerCase();
    const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
    };

    res.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
    res.end(fs.readFileSync(filePath));
    return true;
}

async function resolveCropId(body, fallbackCropId = null) {
    const suppliedCropId = body.cropId ?? fallbackCropId;
    if (suppliedCropId !== null && suppliedCropId !== undefined && suppliedCropId !== "") {
        return toNumber(suppliedCropId);
    }

    const cropName = String(body.cropName || "").trim();
    if (!cropName) return null;

    const [rows] = await db.execute(`
        SELECT crop_id
        FROM crops
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1
    `, [cropName]);

    return rows.length ? Number(rows[0].crop_id) : null;
}

const server = http.createServer(async (req, res) => {
    const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = requestURL.pathname;

    try {
        if (pathname === "/api/db-health" && req.method === "GET") {
            const [rows] = await db.execute(`
                SELECT DATABASE() AS databaseName, VERSION() AS mysqlVersion
            `);

            sendJSON(res, 200, {
                status: "connected",
                database: rows[0].databaseName,
                mysqlVersion: rows[0].mysqlVersion
            });
            return;
        }

        if (pathname === "/api/health" && req.method === "GET") {
            sendJSON(res, 200, { status: "ok", service: "AgriBid API" });
            return;
        }

        // PHASE 11 — REAL AUTHENTICATION
        if (pathname === "/api/auth/register" && req.method === "POST") {
            const body = await getRequestBody(req);

            const name = String(body.name || "").trim();
            const email = String(body.email || "").trim().toLowerCase();
            const password = String(body.password || "");
            const phone = String(body.phone || "").trim();
            const address = String(body.address || "").trim();
            const role = String(body.role || "").trim().toLowerCase();

            if (name.length < 2 || name.length > 100) {
                sendJSON(res, 400, { message: "Name must be between 2 and 100 characters." });
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
                sendJSON(res, 400, { message: "Please provide a valid email address." });
                return;
            }

            if (password.length < 6 || password.length > 72) {
                sendJSON(res, 400, { message: "Password must be between 6 and 72 characters." });
                return;
            }

            if (phone && !/^[0-9+()\-\s]{10,15}$/.test(phone)) {
                sendJSON(res, 400, { message: "Please provide a valid phone number." });
                return;
            }

            if (address.length < 5 || address.length > 500) {
                sendJSON(res, 400, { message: "Address must be between 5 and 500 characters." });
                return;
            }

            if (!['farmer', 'buyer'].includes(role)) {
                sendJSON(res, 400, { message: "Role must be Farmer or Buyer." });
                return;
            }

            let connection;

            try {
                connection = await db.getConnection();
                await connection.beginTransaction();

                const [existingUsers] = await connection.execute(
                    "SELECT user_id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
                    [email]
                );

                if (existingUsers.length) {
                    await connection.rollback();
                    sendJSON(res, 409, { message: "An account with this email already exists." });
                    return;
                }

                const passwordHash = await hashPassword(password);

                const [userResult] = await connection.execute(`
                    INSERT INTO users
                        (name, email, password_hash, phone, role, account_status)
                    VALUES (?, ?, ?, ?, ?, 'active')
                `, [name, email, passwordHash, phone || null, role]);

                const userId = userResult.insertId;

                if (role === "farmer") {
                    await connection.execute(`
                        INSERT INTO farmers
                            (user_id, farm_name, farm_location, address)
                        VALUES (?, ?, ?, ?)
                    `, [userId, `${name}'s Farm`, address, address]);
                } else {
                    await connection.execute(`
                        INSERT INTO buyers
                            (user_id, business_name, address)
                        VALUES (?, ?, ?)
                    `, [userId, name, address]);
                }

                await connection.commit();

                const user = {
                    user_id: userId,
                    name,
                    email,
                    phone: phone || null,
                    role,
                    account_status: "active"
                };

                sendJSON(res, 201, {
                    message: "Registration successful.",
                    user: sanitizeUser(user)
                });
            } catch (error) {
                if (connection) {
                    try { await connection.rollback(); } catch (_) {}
                }

                console.error("Registration failed:", error);
                sendJSON(res, 500, { message: "Unable to register account." });
            } finally {
                if (connection) connection.release();
            }

            return;
        }

        if (pathname === "/api/auth/login" && req.method === "POST") {
            const body = await getRequestBody(req);
            const email = String(body.email || "").trim().toLowerCase();
            const password = String(body.password || "");

            if (!email || !password) {
                sendJSON(res, 400, { message: "Email and password are required." });
                return;
            }

            const [rows] = await db.execute(`
                SELECT user_id, name, email, password_hash, phone, role, account_status
                FROM users
                WHERE LOWER(email) = LOWER(?)
                LIMIT 1
            `, [email]);

            if (!rows.length) {
                sendJSON(res, 401, { message: "Invalid email or password." });
                return;
            }

            const user = rows[0];

            if (user.account_status !== "active") {
                sendJSON(res, 403, { message: "This account is not active." });
                return;
            }

            // Migrated Phase 7 users intentionally have no usable password.
            if (user.password_hash === "LEGACY_ACCOUNT_NO_PASSWORD") {
                sendJSON(res, 403, {
                    message: "This legacy account does not have a password yet. Please use a newly registered account or complete password setup."
                });
                return;
            }

            const passwordMatches = await comparePassword(password, user.password_hash);

            if (!passwordMatches) {
                sendJSON(res, 401, { message: "Invalid email or password." });
                return;
            }

            const token = generateToken(user);

            sendJSON(res, 200, {
                message: "Login successful.",
                token,
                user: sanitizeUser(user)
            });
            return;
        }

        if (pathname === "/api/auth/me" && req.method === "GET") {
            const user = await authenticate(req, res);
            if (!user) return;

            sendJSON(res, 200, { user });
            return;
        }

        if (pathname === "/api/crops" && req.method === "GET") {
            const [rows] = await db.execute(`
                SELECT crop_id AS id, name, category, description
                FROM crops
                ORDER BY crop_id
            `);

            sendJSON(res, 200, rows);
            return;
        }

        if (pathname === "/api/farmers" && req.method === "GET") {
            const [rows] = await db.execute(`
                SELECT
                    f.farmer_id AS id,
                    f.user_id AS userId,
                    u.name,
                    f.farm_location AS location,
                    u.phone,
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM verifications v
                            WHERE v.user_id = u.user_id
                              AND v.status = 'approved'
                        ) THEN true
                        ELSE false
                    END AS verified
                FROM farmers f
                INNER JOIN users u ON f.user_id = u.user_id
                ORDER BY f.farmer_id
            `);

            sendJSON(res, 200, rows);
            return;
        }

        if (pathname === "/api/auctions" && req.method === "GET") {
            const [rows] = await db.execute(`
                SELECT
                    a.auction_id AS id,
                    a.crop_id AS cropId,
                    a.farmer_id AS farmerId,
                    a.title,
                    a.description,
                    a.quantity,
                    a.unit,
                    a.quality,
                    a.starting_price AS basePrice,
                    a.current_bid AS currentBid,
                    a.minimum_increment AS minimumIncrement,
                    CASE a.status
                        WHEN 'active' THEN 'Active'
                        WHEN 'scheduled' THEN 'Scheduled'
                        WHEN 'closed' THEN 'Closed'
                        WHEN 'cancelled' THEN 'Cancelled'
                        ELSE a.status
                    END AS status,
                    a.start_time AS startTime,
                    a.end_time AS endTime,
                    a.latitude,
                    a.longitude,
                    a.location,
                    c.name AS cropName,
                    c.category AS category,
                    u.name AS farmerName
                FROM auctions a
                INNER JOIN crops c ON a.crop_id = c.crop_id
                INNER JOIN farmers f ON a.farmer_id = f.farmer_id
                INNER JOIN users u ON f.user_id = u.user_id
                ORDER BY a.auction_id DESC
            `);

            sendJSON(res, 200, rows);
            return;
        }

        if (pathname === "/api/bids" && req.method === "GET") {
            const auctionId = requestURL.searchParams.get("auctionId");

            const query = `
                SELECT
                    b.bid_id AS id,
                    b.auction_id AS auctionId,
                    u.name AS buyerName,
                    b.amount,
                    b.bid_time AS time,
                    b.status
                FROM bids b
                INNER JOIN buyers byrs ON b.buyer_id = byrs.buyer_id
                INNER JOIN users u ON byrs.user_id = u.user_id
                ${auctionId ? "WHERE b.auction_id = ?" : ""}
                ORDER BY b.bid_time DESC, b.bid_id DESC
            `;

            const [rows] = auctionId
                ? await db.execute(query, [Number(auctionId)])
                : await db.execute(query);

            sendJSON(res, 200, rows);
            return;
        }

        if (pathname === "/api/auctions" && req.method === "POST") {
            const user = await authenticate(req, res);
            if (!user) return;
            req.user = user;

            if (!authorize("farmer")(req, res)) return;

            const [farmerRows] = await db.execute(
                `SELECT farmer_id
                 FROM farmers
                 WHERE user_id = ?
                 LIMIT 1`,
                [req.user.user_id]
            );

            if (farmerRows.length === 0) {
                sendJSON(res, 403, { message: "Farmer profile not found." });
                return;
            }

            const farmerId = farmerRows[0].farmer_id;
            const body = await getRequestBody(req);
            const cropId = await resolveCropId(body);

            // The farmer_id used by the database always comes from the authenticated user.
            const validation = validateAuctionInput({ ...body, farmerId, cropId });

            if (validation.error) {
                sendJSON(res, 400, { message: validation.error });
                return;
            }

            const auction = validation.value;

            const [cropRows] = await db.execute(`
                SELECT crop_id
                FROM crops
                WHERE crop_id = ?
                LIMIT 1
            `, [auction.cropId]);

            if (!cropRows.length) {
                sendJSON(res, 404, { message: "Crop not found." });
                return;
            }

            const [result] = await db.execute(`
                INSERT INTO auctions (
                    farmer_id, crop_id, title, description, quantity,
                    unit, quality, starting_price, current_bid,
                    minimum_increment, start_time, end_time, status,
                    latitude, longitude, location
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                farmerId,
                auction.cropId,
                auction.title,
                auction.description,
                auction.quantity,
                auction.unit,
                auction.quality,
                auction.basePrice,
                auction.currentBid,
                auction.minimumIncrement,
                auction.startTime,
                auction.endTime,
                auction.status,
                auction.latitude,
                auction.longitude,
                auction.location
            ]);

            const [rows] = await db.execute(`
                SELECT
                    a.auction_id AS id,
                    a.crop_id AS cropId,
                    a.farmer_id AS farmerId,
                    a.title,
                    a.description,
                    a.quantity,
                    a.unit,
                    a.quality,
                    a.starting_price AS basePrice,
                    a.current_bid AS currentBid,
                    a.minimum_increment AS minimumIncrement,
                    CASE a.status
                        WHEN 'active' THEN 'Active'
                        WHEN 'scheduled' THEN 'Scheduled'
                        WHEN 'closed' THEN 'Closed'
                        WHEN 'cancelled' THEN 'Cancelled'
                        ELSE a.status
                    END AS status,
                    a.start_time AS startTime,
                    a.end_time AS endTime,
                    a.latitude,
                    a.longitude,
                    a.location,
                    c.name AS cropName,
                    c.category AS category,
                    u.name AS farmerName
                FROM auctions a
                INNER JOIN crops c ON a.crop_id = c.crop_id
                INNER JOIN farmers f ON a.farmer_id = f.farmer_id
                INNER JOIN users u ON f.user_id = u.user_id
                WHERE a.auction_id = ?
            `, [result.insertId]);

            sendJSON(res, 201, {
                message: "Auction added successfully.",
                auction: rows[0]
            });
            return;
        }

        if (pathname.startsWith("/api/auctions/") && req.method === "PATCH") {
            const user = await authenticate(req, res);
            if (!user) return;
            req.user = user;

            if (!authorize("farmer")(req, res)) return;

            const parts = pathname.split("/").filter(Boolean);
            const id = Number(parts[2]);
            const isStatusOnly = parts[3] === "status";

            if (!Number.isInteger(id) || id <= 0) {
                sendJSON(res, 400, { message: "Invalid auction ID." });
                return;
            }

            const [farmerRows] = await db.execute(
                `SELECT farmer_id
                 FROM farmers
                 WHERE user_id = ?
                 LIMIT 1`,
                [req.user.user_id]
            );

            if (farmerRows.length === 0) {
                sendJSON(res, 403, { message: "Farmer profile not found." });
                return;
            }

            const farmerId = farmerRows[0].farmer_id;

            const [existingRows] = await db.execute(`
                SELECT *
                FROM auctions
                WHERE auction_id = ?
                LIMIT 1
            `, [id]);

            if (!existingRows.length) {
                sendJSON(res, 404, { message: "Auction not found." });
                return;
            }

            const current = existingRows[0];

            if (Number(current.farmer_id) !== Number(farmerId)) {
                sendJSON(res, 403, { message: "You can only modify your own auctions." });
                return;
            }

            const body = await getRequestBody(req);
            const cropId = await resolveCropId(body, current.crop_id);

            if (isStatusOnly) {
                const status = normalizeStatus(body.status);

                if (!status) {
                    sendJSON(res, 400, { message: "Invalid auction status." });
                    return;
                }

                await db.execute(`
                    UPDATE auctions
                    SET status = ?
                    WHERE auction_id = ?
                `, [status, id]);
            } else {
                const merged = {
                    cropId: cropId,
                    farmerId: farmerId,
                    title: body.title ?? current.title,
                    description: body.description ?? current.description,
                    quantity: body.quantity ?? current.quantity,
                    unit: body.unit ?? current.unit,
                    quality: body.quality ?? current.quality,
                    basePrice: body.basePrice ?? current.starting_price,
                    currentBid: body.currentBid ?? current.current_bid,
                    minimumIncrement: body.minimumIncrement ?? current.minimum_increment,
                    status: body.status ?? current.status,
                    startTime: body.startTime ?? current.start_time,
                    endTime: body.endTime ?? current.end_time,
                    latitude: body.latitude ?? current.latitude,
                    longitude: body.longitude ?? current.longitude,
                    location: body.location ?? current.location
                };

                const validation = validateAuctionInput(merged);

                if (validation.error) {
                    sendJSON(res, 400, { message: validation.error });
                    return;
                }

                const auction = validation.value;

                await db.execute(`
                    UPDATE auctions
                    SET
                        farmer_id = ?,
                        crop_id = ?,
                        title = ?,
                        description = ?,
                        quantity = ?,
                        unit = ?,
                        quality = ?,
                        starting_price = ?,
                        current_bid = ?,
                        minimum_increment = ?,
                        start_time = ?,
                        end_time = ?,
                        status = ?,
                        latitude = ?,
                        longitude = ?,
                        location = ?
                    WHERE auction_id = ?
                `, [
                    auction.farmerId,
                    auction.cropId,
                    auction.title,
                    auction.description,
                    auction.quantity,
                    auction.unit,
                    auction.quality,
                    auction.basePrice,
                    auction.currentBid,
                    auction.minimumIncrement,
                    auction.startTime,
                    auction.endTime,
                    auction.status,
                    auction.latitude,
                    auction.longitude,
                    auction.location,
                    id
                ]);
            }

            const [rows] = await db.execute(`
                SELECT
                    a.auction_id AS id,
                    a.crop_id AS cropId,
                    a.farmer_id AS farmerId,
                    a.title,
                    a.description,
                    a.quantity,
                    a.unit,
                    a.quality,
                    a.starting_price AS basePrice,
                    a.current_bid AS currentBid,
                    a.minimum_increment AS minimumIncrement,
                    CASE a.status
                        WHEN 'active' THEN 'Active'
                        WHEN 'scheduled' THEN 'Scheduled'
                        WHEN 'closed' THEN 'Closed'
                        WHEN 'cancelled' THEN 'Cancelled'
                        ELSE a.status
                    END AS status,
                    a.start_time AS startTime,
                    a.end_time AS endTime,
                    a.latitude,
                    a.longitude,
                    a.location,
                    c.name AS cropName,
                    c.category AS category,
                    u.name AS farmerName
                FROM auctions a
                INNER JOIN crops c ON a.crop_id = c.crop_id
                INNER JOIN farmers f ON a.farmer_id = f.farmer_id
                INNER JOIN users u ON f.user_id = u.user_id
                WHERE a.auction_id = ?
            `, [id]);

            sendJSON(res, 200, {
                message: isStatusOnly ? "Auction status updated." : "Auction updated successfully.",
                auction: rows[0]
            });
            return;
        }

        if (pathname.startsWith("/api/auctions/") && req.method === "DELETE") {
            const user = await authenticate(req, res);
            if (!user) return;
            req.user = user;

            if (!authorize("farmer")(req, res)) return;

            const id = Number(pathname.split("/").pop());

            if (!Number.isInteger(id) || id <= 0) {
                sendJSON(res, 400, { message: "Invalid auction ID." });
                return;
            }

            const [farmerRows] = await db.execute(
                `SELECT farmer_id
                 FROM farmers
                 WHERE user_id = ?
                 LIMIT 1`,
                [req.user.user_id]
            );

            if (farmerRows.length === 0) {
                sendJSON(res, 403, { message: "Farmer profile not found." });
                return;
            }

            const farmerId = farmerRows[0].farmer_id;

            const [auctionRows] = await db.execute(`
                SELECT farmer_id
                FROM auctions
                WHERE auction_id = ?
                LIMIT 1
            `, [id]);

            if (!auctionRows.length) {
                sendJSON(res, 404, { message: "Auction not found." });
                return;
            }

            if (Number(auctionRows[0].farmer_id) !== Number(farmerId)) {
                sendJSON(res, 403, { message: "You can only delete your own auctions." });
                return;
            }

            const [result] = await db.execute(`
                DELETE FROM auctions
                WHERE auction_id = ?
            `, [id]);

            if (result.affectedRows === 0) {
                sendJSON(res, 404, { message: "Auction not found." });
                return;
            }

            sendJSON(res, 200, { message: "Auction deleted successfully." });
            return;
        }

        if (pathname === "/api/bids" && req.method === "POST") {
            const user = await authenticate(req, res);
            if (!user) return;
            req.user = user;

            if (!authorize("buyer")(req, res)) return;

            const body = await getRequestBody(req);
            const auctionId = Number(body.auctionId);
            const amount = toNumber(body.amount);

            if (!Number.isInteger(auctionId) || auctionId <= 0) {
                sendJSON(res, 400, { message: "Invalid auction ID." });
                return;
            }

            if (amount === null || amount <= 0) {
                sendJSON(res, 400, { message: "Bid amount must be greater than 0." });
                return;
            }

            let connection;

            try {
                connection = await db.getConnection();
                await connection.beginTransaction();

                const [auctionRows] = await connection.execute(`
                    SELECT
                        auction_id,
                        current_bid,
                        minimum_increment,
                        status,
                        start_time,
                        end_time
                    FROM auctions
                    WHERE auction_id = ?
                    LIMIT 1
                    FOR UPDATE
                `, [auctionId]);

                if (!auctionRows.length) {
                    await connection.rollback();
                    sendJSON(res, 404, { message: "Auction not found." });
                    return;
                }

                const auction = auctionRows[0];
                const now = new Date();
                const startTime = new Date(auction.start_time);
                const endTime = new Date(auction.end_time);

                if (auction.status !== "active" || now < startTime || now >= endTime) {
                    await connection.rollback();
                    sendJSON(res, 400, { message: "Bidding is not active." });
                    return;
                }

                const minimumBid = Number(auction.current_bid) + Number(auction.minimum_increment);

                if (amount < minimumBid) {
                    await connection.rollback();
                    sendJSON(res, 400, { message: `Bid must be at least ₹${minimumBid}.` });
                    return;
                }

                // Derive buyer identity from the authenticated database user.
                const [buyerRows] = await connection.execute(`
                    SELECT
                        b.buyer_id AS buyerId,
                        u.name AS buyerName
                    FROM buyers b
                    INNER JOIN users u ON b.user_id = u.user_id
                    WHERE b.user_id = ?
                    LIMIT 1
                `, [req.user.user_id]);

                if (!buyerRows.length) {
                    await connection.rollback();
                    sendJSON(res, 403, { message: "Buyer profile not found." });
                    return;
                }

                const buyer = buyerRows[0];
                const bidTime = new Date();

                const [bidResult] = await connection.execute(`
                    INSERT INTO bids (
                        auction_id,
                        buyer_id,
                        amount,
                        bid_time,
                        status
                    )
                    VALUES (?, ?, ?, ?, 'valid')
                `, [auctionId, buyer.buyerId, amount, bidTime]);

                await connection.execute(`
                    UPDATE auctions
                    SET current_bid = ?
                    WHERE auction_id = ?
                `, [amount, auctionId]);

                await connection.commit();

                sendJSON(res, 201, {
                    message: "Bid placed successfully.",
                    bid: {
                        id: bidResult.insertId,
                        auctionId,
                        buyerName: buyer.buyerName,
                        amount,
                        time: bidTime.toISOString(),
                        status: "valid"
                    }
                });
            } catch (error) {
                if (connection) {
                    try {
                        await connection.rollback();
                    } catch (rollbackError) {
                        console.error("Transaction rollback failed:", rollbackError.message);
                    }
                }

                console.error("Bid transaction failed:", error);

                if (!res.headersSent) {
                    sendJSON(res, 500, {
                        message: "Unable to place bid.",
                        error: error.message
                    });
                }
            } finally {
                if (connection) connection.release();
            }

            return;
        }

        if (pathname === "/api/notifications" && req.method === "GET") {
            const user = await authenticate(req, res);
            if (!user) return;
            req.user = user;

            const requestedRole = String(requestURL.searchParams.get("role") || "").trim().toLowerCase();
            const role = String(req.user.role || "").toLowerCase();

            if (requestedRole && requestedRole !== role) {
                sendJSON(res, 403, { message: "You can only access your own role notifications." });
                return;
            }

            let notifications = [];
            try {
                const fsPath = path.join(__dirname, "data", "notifications.json");
                notifications = JSON.parse(fs.readFileSync(fsPath, "utf8"));
            } catch (_) {
                notifications = [];
            }

            notifications = notifications.filter(item =>
                String(item.role || "").toLowerCase() === role || String(item.role || "").toLowerCase() === "all"
            );

            sendJSON(res, 200, notifications);
            return;
        }

        if (pathname.startsWith("/api/farmers/") && pathname.endsWith("/verification") && req.method === "PATCH") {
            const user = await authenticate(req, res);
            if (!user) return;
            req.user = user;

            if (!authorize("admin")(req, res)) return;

            const farmerId = Number(pathname.split("/")[3]);
            if (!Number.isInteger(farmerId) || farmerId <= 0) {
                sendJSON(res, 400, { message: "Invalid farmer ID." });
                return;
            }

            const body = await getRequestBody(req);
            if (typeof body.verified !== "boolean") {
                sendJSON(res, 400, { message: "verified must be a boolean." });
                return;
            }

            const [farmerRows] = await db.execute(`
                SELECT user_id
                FROM farmers
                WHERE farmer_id = ?
                LIMIT 1
            `, [farmerId]);

            if (!farmerRows.length) {
                sendJSON(res, 404, { message: "Farmer not found." });
                return;
            }

            const status = body.verified ? "approved" : "pending";
            const reviewedAt = body.verified ? new Date() : null;

            const [verificationRows] = await db.execute(`
                SELECT verification_id
                FROM verifications
                WHERE user_id = ?
                ORDER BY verification_id DESC
                LIMIT 1
            `, [farmerRows[0].user_id]);

            if (verificationRows.length) {
                await db.execute(`
                    UPDATE verifications
                    SET status = ?, reviewed_at = ?, rejection_reason = NULL
                    WHERE verification_id = ?
                `, [status, reviewedAt, verificationRows[0].verification_id]);
            } else {
                await db.execute(`
                    INSERT INTO verifications
                        (user_id, document_type, status, submitted_at, reviewed_at)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    farmerRows[0].user_id,
                    "profile-verification",
                    status,
                    new Date(),
                    reviewedAt
                ]);
            }

            sendJSON(res, 200, {
                message: body.verified ? "Farmer verified successfully." : "Farmer marked as unverified.",
                verified: body.verified
            });
            return;
        }

        if (req.method === "GET" && serveStaticFile(res, pathname)) return;

        sendJSON(res, 404, { message: "Route not found." });

    } catch (error) {
        console.error("AgriBid API error:", error);

        if (!res.headersSent) {
            sendJSON(res, 500, {
                message: "Internal server error.",
                error: error.message
            });
        }
    }
});

async function startServer() {
    try {
        await db.execute("SELECT 1");
        console.log("MySQL connection successful.");
        console.log("Database:", process.env.DB_NAME || "agribid");

        server.listen(PORT, () => {
            console.log(`AgriBid server running at http://localhost:${PORT}`);
            console.log("Phase 9: APIs are using MySQL.");
        });
    } catch (error) {
        console.error("Unable to connect to MySQL.");
        console.error(error.message);
        process.exit(1);
    }
}

startServer();