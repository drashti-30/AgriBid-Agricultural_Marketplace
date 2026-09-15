const pool = require("./db");

async function testConnection() {
  try {
    const [rows] = await pool.query(
      "SELECT DATABASE() AS databaseName, VERSION() AS mysqlVersion"
    );

    console.log("Connected to MySQL successfully.");
    console.log("Database:", rows[0].databaseName);
    console.log("MySQL version:", rows[0].mysqlVersion);
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection();