const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const db = require("./db");

const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");

const files = {
    crops: path.join(dataDir, "crops.json"),
    farmers: path.join(dataDir, "farmers.json"),
    auctions: path.join(dataDir, "auctions.json"),
    bids: path.join(dataDir, "bids.json"),
    notifications: path.join(dataDir, "notifications.json")
};

const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

function sendJSON(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

function serveFile(res, file, type) {
    try {
        const data = fs.readFileSync(file);
        res.writeHead(200, { "Content-Type": type });
        res.end(data);
    } catch (error) {
        sendJSON(res, 404, { message: "File not found." });
    }
}

function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
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

function getAutomaticStatus(auction) {
    if (!auction.startTime || !auction.endTime) {
        return auction.status || "Active";
    }

    const now = Date.now();
    const startTime = new Date(auction.startTime).getTime();
    const endTime = new Date(auction.endTime).getTime();

    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
        return auction.status || "Active";
    }

    if (now < startTime) return "Scheduled";
    if (now >= endTime) return "Closed";
    return "Active";
}

function synchronizeAuctionStatuses(auctions) {
    let changed = false;

    auctions.forEach(auction => {
        const automaticStatus = getAutomaticStatus(auction);
        if (auction.status !== automaticStatus && auction.startTime && auction.endTime) {
            auction.status = automaticStatus;
            changed = true;
        }
    });

    if (changed) writeJSON(files.auctions, auctions);
    return auctions;
}

function enrichAuctions(auctions) {
    const crops = readJSON(files.crops);
    const farmers = readJSON(files.farmers);

    return auctions.map(auction => {
        const crop = crops.find(item => item.id === Number(auction.cropId)) ||
            crops.find(item => item.name.toLowerCase() === String(auction.cropName || "").toLowerCase());
        const farmer = farmers.find(item => item.id === Number(auction.farmerId)) ||
            farmers.find(item => item.name.toLowerCase() === String(auction.farmerName || "").toLowerCase());

        return {
            ...auction,
            status: getAutomaticStatus(auction),
            cropName: auction.cropName || crop?.name || "Unknown Crop",
            farmerName: auction.farmerName || farmer?.name || "Unknown Farmer",
            category: auction.category || crop?.category || "General",
            quality: auction.quality || crop?.quality || "Standard",
            unit: auction.unit || crop?.unit || "units",
            location: auction.location || farmer?.location || "Location not provided",
            verified: auction.verified ?? farmer?.verified ?? false
        };
    });
}


function getTimeRemainingForNotification(auction) {
    const end = new Date(auction.endTime).getTime();
    return Number.isNaN(end) ? Number.MAX_SAFE_INTEGER : Math.max(0, end - Date.now());
}

const server = http.createServer(async (req, res) => {
    const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);

    try {
        if (pathname === "/api/db-health" && req.method === "GET") {
            try {
                const [rows] = await db.execute("SELECT DATABASE() AS databaseName, VERSION() AS mysqlVersion");

                sendJSON(res, 200, {
                    status: "connected",
                    database: rows[0].databaseName,
                    mysqlVersion: rows[0].mysqlVersion
                });
            } catch (error) {
                console.error("Database health check failed:", error);
                sendJSON(res, 500, {
                    status: "disconnected",
                    message: "Unable to connect to MySQL."
                });
            }
            return;
        }
        if (pathname === "/" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "index.html"), "text/html");
        }

        if (pathname === "/auctions.html" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "auctions.html"), "text/html");
        }

        if (pathname === "/register.html" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "register.html"), "text/html");
        }


        if (pathname === "/login.html" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "login.html"), "text/html");
        }

        if (pathname === "/farmer-dashboard.html" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "farmer-dashboard.html"), "text/html");
        }

        if (pathname === "/buyer-dashboard.html" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "buyer-dashboard.html"), "text/html");
        }

        if (pathname === "/admin-dashboard.html" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "admin-dashboard.html"), "text/html");
        }

        if (pathname === "/css/style.css" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "css", "style.css"), "text/css");
        }

        if (pathname === "/script.js" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "script.js"), "application/javascript");
        }

        if (pathname === "/auctions.js" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "auctions.js"), "application/javascript");
        }

        if (pathname === "/farmer-dashboard.js" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "farmer-dashboard.js"), "application/javascript");
        }

        if (pathname === "/buyer-dashboard.js" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "buyer-dashboard.js"), "application/javascript");
        }

        if (pathname === "/admin-dashboard.js" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "admin-dashboard.js"), "application/javascript");
        }

        if (pathname === "/dashboard-common.js" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "dashboard-common.js"), "application/javascript");
        }

        if (pathname === "/auth.js" && req.method === "GET") {
            return serveFile(res, path.join(publicDir, "auth.js"), "application/javascript");
        }


        if (pathname === "/api/health" && req.method === "GET") {
            return sendJSON(res, 200, { status: "ok", service: "AgriBid", timestamp: new Date().toISOString() });
        }

        if (pathname === "/api/crops" && req.method === "GET") {
            return sendJSON(res, 200, readJSON(files.crops));
        }

        if (pathname === "/api/farmers" && req.method === "GET") {
            return sendJSON(res, 200, readJSON(files.farmers));
        }

        if (pathname === "/api/auctions" && req.method === "GET") {
            const auctions = synchronizeAuctionStatuses(readJSON(files.auctions));
            return sendJSON(res, 200, enrichAuctions(auctions));
        }

        if (pathname === "/api/auctions" && req.method === "POST") {
            const body = await getBody(req);
            const auctions = readJSON(files.auctions);

            if (!body.cropName || !body.farmerName || !body.category || Number(body.quantity) <= 0 || Number(body.basePrice) <= 0 || Number(body.minimumIncrement) <= 0) {
                return sendJSON(res, 400, { message: "Please provide valid auction details." });
            }

            if (!body.startTime || !body.endTime || new Date(body.endTime) <= new Date(body.startTime)) {
                return sendJSON(res, 400, { message: "End time must be later than the start time." });
            }

            const auction = {
                id: auctions.length ? Math.max(...auctions.map(item => Number(item.id))) + 1 : 1,
                ...body,
                quantity: Number(body.quantity),
                basePrice: Number(body.basePrice),
                currentBid: Number(body.basePrice),
                minimumIncrement: Number(body.minimumIncrement),
                status: "Active"
            };

            auction.status = getAutomaticStatus(auction);
            auctions.push(auction);
            writeJSON(files.auctions, auctions);

            return sendJSON(res, 201, {
                message: "Auction created successfully.",
                auction
            });
        }

        if (pathname.endsWith("/status") && req.method === "PATCH") {
            const id = Number(pathname.split("/")[3]);
            const auctions = readJSON(files.auctions);
            const auction = auctions.find(item => item.id === id);

            if (!auction) {
                return sendJSON(res, 404, { message: "Auction not found." });
            }

            auction.status = getAutomaticStatus(auction);
            writeJSON(files.auctions, auctions);

            return sendJSON(res, 200, {
                message: "Auction status synchronized automatically.",
                auction
            });
        }

        if (pathname.startsWith("/api/auctions/") && req.method === "PATCH") {
            const id = Number(pathname.split("/").pop());
            const body = await getBody(req);
            const auctions = readJSON(files.auctions);
            const auction = auctions.find(item => item.id === id);

            if (!auction) {
                return sendJSON(res, 404, { message: "Auction not found." });
            }

            const editableFields = [
                "cropName",
                "farmerName",
                "category",
                "quantity",
                "basePrice",
                "minimumIncrement",
                "startTime",
                "endTime",
                "latitude",
                "longitude"
            ];

            editableFields.forEach(field => {
                if (body[field] !== undefined) auction[field] = body[field];
            });

            auction.quantity = Number(auction.quantity);
            auction.basePrice = Number(auction.basePrice);
            auction.minimumIncrement = Number(auction.minimumIncrement);

            if (!auction.cropName || !auction.farmerName || !auction.category || auction.quantity <= 0 || auction.basePrice <= 0 || auction.minimumIncrement <= 0) {
                return sendJSON(res, 400, { message: "Please provide valid auction details." });
            }

            if (!auction.startTime || !auction.endTime || new Date(auction.endTime) <= new Date(auction.startTime)) {
                return sendJSON(res, 400, { message: "End time must be later than the start time." });
            }

            auction.status = getAutomaticStatus(auction);
            writeJSON(files.auctions, auctions);

            return sendJSON(res, 200, {
                message: "Auction updated successfully.",
                auction
            });
        }

        if (pathname.startsWith("/api/auctions/") && req.method === "DELETE") {
            const id = Number(pathname.split("/").pop());
            const auctions = readJSON(files.auctions);
            const updated = auctions.filter(auction => auction.id !== id);

            if (updated.length === auctions.length) {
                return sendJSON(res, 404, { message: "Auction not found." });
            }

            writeJSON(files.auctions, updated);
            return sendJSON(res, 200, { message: "Auction deleted successfully." });
        }

        if (pathname === "/api/notifications" && req.method === "GET") {
            const role = searchParams.get("role") || "Buyer";
            const userName = searchParams.get("userName") || "";
            const notifications = readJSON(files.notifications).filter(item => item.role === role || item.role === "All");
            const auctions = enrichAuctions(synchronizeAuctionStatuses(readJSON(files.auctions)));
            const bids = readJSON(files.bids);
            const farmers = readJSON(files.farmers);
            const generated = [];
            const now = new Date().toISOString();

            if (role === "Farmer") {
                const farmerAuctions = auctions.filter(auction =>
                    auction.farmerName.toLowerCase() === userName.toLowerCase() ||
                    Number(auction.farmerId) === Number(searchParams.get("farmerId"))
                );
                const farmerAuctionIds = new Set(farmerAuctions.map(auction => Number(auction.id)));
                const farmerBids = bids.filter(bid => farmerAuctionIds.has(Number(bid.auctionId)));
                const activeAuctions = farmerAuctions.filter(auction => auction.status === "Active");
                const scheduledCount = farmerAuctions.filter(auction => auction.status === "Scheduled").length;
                const closedCount = farmerAuctions.filter(auction => auction.status === "Closed").length;
                const recentBid = [...farmerBids].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
                const endingSoon = activeAuctions.filter(auction => getTimeRemainingForNotification(auction) <= 24 * 60 * 60 * 1000);

                if (activeAuctions.length) {
                    generated.push({ id: `farmer-active-${activeAuctions.length}`, title: "Active auctions", message: `You currently have ${activeAuctions.length} active auction${activeAuctions.length === 1 ? "" : "s"}.`, icon: "🟢", time: now });
                }
                if (recentBid) {
                    const auction = farmerAuctions.find(item => Number(item.id) === Number(recentBid.auctionId));
                    generated.push({ id: `farmer-new-bid-${recentBid.id}`, title: "New bid received", message: `${recentBid.buyerName} bid ₹${recentBid.amount} on ${auction?.cropName || "your auction"}.`, icon: "💰", time: recentBid.time });
                }
                if (endingSoon.length) {
                    generated.push({ id: `farmer-ending-${endingSoon.map(item => item.id).join("-")}`, title: "Auction ending soon", message: `${endingSoon.length} of your active auction${endingSoon.length === 1 ? " is" : "s are"} ending within 24 hours.`, icon: "⏳", time: now });
                }
                if (scheduledCount) {
                    generated.push({ id: `farmer-scheduled-${scheduledCount}`, title: "Scheduled auctions", message: `${scheduledCount} auction${scheduledCount === 1 ? " is" : "s are"} waiting to start.`, icon: "⏰", time: now });
                }
                if (closedCount) {
                    generated.push({ id: `farmer-closed-${closedCount}`, title: "Completed auctions", message: `${closedCount} of your auction${closedCount === 1 ? " has" : "s have"} closed.`, icon: "🏆", time: now });
                }
            }

            if (role === "Buyer") {
                const buyerBids = bids.filter(bid => bid.buyerName.toLowerCase() === userName.toLowerCase());
                const winningCount = buyerBids.filter(bid => {
                    const auction = auctions.find(item => Number(item.id) === Number(bid.auctionId));
                    return auction && auction.status !== "Closed" && Number(bid.amount) >= Number(auction.currentBid);
                }).length;
                const outbidBids = buyerBids.filter(bid => {
                    const auction = auctions.find(item => Number(item.id) === Number(bid.auctionId));
                    return auction && auction.status === "Active" && Number(bid.amount) < Number(auction.currentBid);
                });
                const closedWon = buyerBids.filter(bid => {
                    const auction = auctions.find(item => Number(item.id) === Number(bid.auctionId));
                    return auction && auction.status === "Closed" && Number(bid.amount) >= Number(auction.currentBid);
                });
                const wishlist = JSON.parse(searchParams.get("wishlist") || "[]").map(Number);
                const watchedActive = auctions.filter(auction => wishlist.includes(Number(auction.id)) && auction.status === "Active").length;
                const endingSoon = auctions.filter(auction => wishlist.includes(Number(auction.id)) && auction.status === "Active" && getTimeRemainingForNotification(auction) <= 24 * 60 * 60 * 1000);
                const latestOutbid = [...outbidBids].sort((a, b) => new Date(b.time) - new Date(a.time))[0];

                if (buyerBids.length) {
                    generated.push({ id: `buyer-bids-${buyerBids.length}`, title: "Your bidding activity", message: `You have placed ${buyerBids.length} bid${buyerBids.length === 1 ? "" : "s"}.`, icon: "💰", time: now });
                }
                if (winningCount) {
                    generated.push({ id: `buyer-winning-${winningCount}`, title: "You are currently winning", message: `${winningCount} auction${winningCount === 1 ? "" : "s"} currently have your highest bid.`, icon: "🏆", time: now });
                }
                if (latestOutbid) {
                    const auction = auctions.find(item => Number(item.id) === Number(latestOutbid.auctionId));
                    generated.push({ id: `buyer-outbid-${latestOutbid.id}-${auction?.currentBid}`, title: "You have been outbid", message: `${auction?.cropName || "An auction"} is now at ₹${auction?.currentBid || 0}; your bid was ₹${latestOutbid.amount}.`, icon: "⚠️", time: now });
                }
                if (closedWon.length) {
                    generated.push({ id: `buyer-won-${closedWon.map(item => item.auctionId).join("-")}`, title: "Auction won", message: `You have the highest bid on ${closedWon.length} closed auction${closedWon.length === 1 ? "" : "s"}.`, icon: "🏆", time: now });
                }
                if (endingSoon.length) {
                    generated.push({ id: `buyer-ending-${endingSoon.map(item => item.id).join("-")}`, title: "Wishlist auction ending soon", message: `${endingSoon.length} saved auction${endingSoon.length === 1 ? " is" : "s are"} ending within 24 hours.`, icon: "⏳", time: now });
                }
                if (watchedActive) {
                    generated.push({ id: `buyer-watch-${watchedActive}`, title: "Wishlist auctions are live", message: `${watchedActive} saved auction${watchedActive === 1 ? " is" : "s are"} currently active.`, icon: "❤️", time: now });
                }
            }

            if (role === "Admin") {
                const pendingFarmers = farmers.filter(farmer => !farmer.verified).length;
                const activeCount = auctions.filter(auction => auction.status === "Active").length;
                const scheduledCount = auctions.filter(auction => auction.status === "Scheduled").length;

                generated.push({ id: `admin-auctions-${auctions.length}`, title: "Marketplace overview", message: `${auctions.length} auctions and ${bids.length} bids are currently recorded.`, icon: "📊", time: now });
                if (activeCount) generated.push({ id: `admin-active-${activeCount}`, title: "Live marketplace", message: `${activeCount} auction${activeCount === 1 ? " is" : "s are"} currently active.`, icon: "🟢", time: now });
                if (scheduledCount) generated.push({ id: `admin-scheduled-${scheduledCount}`, title: "Upcoming auctions", message: `${scheduledCount} auction${scheduledCount === 1 ? " is" : "s are"} scheduled.`, icon: "⏰", time: now });
                if (pendingFarmers) generated.push({ id: `admin-verification-${pendingFarmers}`, title: "Verification required", message: `${pendingFarmers} farmer${pendingFarmers === 1 ? " needs" : "s need"} verification review.`, icon: "🔎", time: now });
            }

            return sendJSON(res, 200, [...generated, ...notifications].slice(0, 12));
        }

        if (pathname.startsWith("/api/farmers/") && pathname.endsWith("/verification") && req.method === "PATCH") {
            const id = Number(pathname.split("/")[3]);
            const body = await getBody(req);
            const farmers = readJSON(files.farmers);
            const farmer = farmers.find(item => item.id === id);

            if (!farmer) return sendJSON(res, 404, { message: "Farmer not found." });
            if (typeof body.verified !== "boolean") return sendJSON(res, 400, { message: "Verification status must be true or false." });

            farmer.verified = body.verified;
            writeJSON(files.farmers, farmers);
            return sendJSON(res, 200, { message: `Farmer ${farmer.verified ? "verified" : "marked as unverified"} successfully.`, farmer });
        }

        if (pathname === "/api/bids" && req.method === "GET") {
            const bids = readJSON(files.bids);
            const auctionId = searchParams.get("auctionId");

            if (!auctionId) return sendJSON(res, 200, bids);

            return sendJSON(
                res,
                200,
                bids.filter(bid => bid.auctionId === Number(auctionId))
            );
        }

        if (pathname === "/api/bids" && req.method === "POST") {
            const body = await getBody(req);
            const auctions = synchronizeAuctionStatuses(readJSON(files.auctions));
            const bids = readJSON(files.bids);
            const auction = auctions.find(item => item.id === Number(body.auctionId));

            if (!auction) {
                return sendJSON(res, 404, { message: "Auction not found." });
            }
            auction.status = getAutomaticStatus(auction);
            if (auction.status !== "Active") {
                return sendJSON(res, 400, { message: `Auction is ${auction.status.toLowerCase()}.` });
            }
            const buyerName = String(body.buyerName || "").trim();
            const amount = Number(body.amount);
            const minimumBid = Number(auction.currentBid || auction.basePrice || 0) + Number(auction.minimumIncrement || 1);
            if (!buyerName) {
                return sendJSON(res, 400, { message: "Buyer name is required." });
            }
            if (!Number.isFinite(amount) || amount < minimumBid) {
                return sendJSON(res, 400, { message: `Minimum bid is ₹${minimumBid}.` });
            }
            const bid = {
                id: bids.length ? Math.max(...bids.map(item => Number(item.id))) + 1 : 1,
                auctionId: Number(body.auctionId),
                buyerName,
                amount,
                time: new Date().toISOString()
            };
            bids.push(bid);
            auction.currentBid = amount;
            writeJSON(files.bids, bids);
            writeJSON(files.auctions, auctions);
            return sendJSON(res, 201, {
                message: "Bid placed successfully.",
                bid
            });
        }
        return sendJSON(res, 404, { message: "Route not found." });
    } catch (error) {
        console.error("Server Error:", error);
        return sendJSON(res, 500, { message: error.message || "Internal server error." });
    }
});
async function startServer() {
    try {
        await db.execute("SELECT 1");
        console.log("MySQL connection successful.");
        console.log("Database:", process.env.DB_NAME || "agribid");
        server.listen(PORT, () => {
            console.log(`AgriBid server running at http://localhost:${PORT}`);
            console.log("Application is connected to MySQL.");
        });
    } catch (error) {
        console.error("Unable to connect to MySQL.");
        console.error(error.message);
        process.exit(1);
    }
}

startServer();
