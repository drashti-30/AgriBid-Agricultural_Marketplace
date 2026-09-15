const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");

const PORT = 3001;
const server = spawn(process.execPath, ["app.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"]
});

function request(pathname) {
    return new Promise((resolve, reject) => {
        const request = http.get(`http://localhost:${PORT}${pathname}`, response => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", chunk => body += chunk);
            response.on("end", () => resolve({ status: response.statusCode, body }));
        });
        request.on("error", reject);
    });
}

async function waitForServer() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            const response = await request("/api/health");
            if (response.status === 200) return;
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    throw new Error("Test server did not start.");
}

async function run() {
    try {
        await waitForServer();
        const checks = ["/api/health", "/api/crops", "/api/farmers", "/api/auctions", "/api/bids", "/api/notifications?role=Admin&userName=Admin"];
        for (const pathname of checks) {
            const response = await request(pathname);
            assert.strictEqual(response.status, 200, `${pathname} returned ${response.status}`);
            JSON.parse(response.body);
        }
        console.log(`Smoke tests passed: ${checks.length} read-only API checks.`);
    } finally {
        server.kill();
    }
}

run().catch(error => {
    console.error(error.message);
    server.kill();
    process.exit(1);
});
