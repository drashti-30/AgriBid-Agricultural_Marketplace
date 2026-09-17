function authorize(...allowedRoles) {
    return (req, res) => {
        if (!req.user) {
            res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ message: "Authentication required." }));
            return false;
        }

        if (!allowedRoles.includes(req.user.role)) {
            res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ message: "You do not have permission to perform this action." }));
            return false;
        }

        return true;
    };
}

module.exports = { authorize };
