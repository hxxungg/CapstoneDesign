const mysql = require('mysql2/promise');

const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbPort = parseInt(process.env.DB_PORT, 10) || 13306;

const pool = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: process.env.DB_USER || 'capstone',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
  dateStrings: true,
});

async function initDatabase() {
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log('DB 연결 성공');
  } catch (err) {
    const hint =
      err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED'
        ? '\n  → python scripts/db_tunnel.py 로 SSH 터널을 먼저 실행하세요.'
        : '';
    console.error(`DB 초기화 실패: ${err.message}${hint}`);
    throw err;
  }
}

module.exports = { pool, initDatabase };

