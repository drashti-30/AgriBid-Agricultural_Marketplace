const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

// Hash a user's password before storing it in MySQL.
async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

// Compare a plain password with the bcrypt hash stored in the database.
async function comparePassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}

// Generate a JWT containing only the information required to identify the authenticated user.
function generateToken(user) {
    if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured");

    return jwt.sign(
        {
            userId: user.user_id,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// Verify a JWT and return its decoded payload.
function verifyToken(token) {
    if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured");
    return jwt.verify(token, JWT_SECRET);
}

// Remove sensitive database fields before sending user information to the browser.
function sanitizeUser(user) {
    return {
        userId: user.user_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        accountStatus: user.account_status
    };
}

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken,
    sanitizeUser
};