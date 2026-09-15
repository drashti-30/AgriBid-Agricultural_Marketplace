const db = require("../db");
const { verifyToken } = require("../utils/auth");

// Authentication middleware.
async function authenticate(req, res) {
    const authorization = req.headers.authorization;

    if (!authorization) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Authentication required" }));
        return null;
    }

    const parts = authorization.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid Authorization header" }));
        return null;
    }

    const token = parts[1];

    try {
        const decoded = verifyToken(token);

        const [rows] = await db.execute(`
            SELECT
                user_id,
                name,
                email,
                phone,
                role,
                account_status
            FROM users
            WHERE user_id = ?
            LIMIT 1
        `, [decoded.userId]);

        if (rows.length === 0) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "User no longer exists" }));
            return null;
        }

        const user = rows[0];

        if (user.account_status !== "active") {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Account is not active" }));
            return null;
        }

        return user;
    } catch (error) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or expired token" }));
        return null;
    }
}

module.exports = authenticate;