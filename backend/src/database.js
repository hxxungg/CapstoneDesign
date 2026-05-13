const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '10.0.2.6',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'capstone',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

async function initDatabase() {
  const conn = await pool.getConnection();
  conn.release();
  console.log('DB 연결 성공');
}

module.exports = { pool, initDatabase };
