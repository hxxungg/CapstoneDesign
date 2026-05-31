require('dotenv').config();
const { pool } = require('../src/database');

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
    const schemas = ['capstonedesign', 'teacher_db', 'student_db', 'log_db'];
    for (const schema of schemas) {
      await conn.query(`SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`, [schema]);
    }
    console.log('OK — MySQL 연결 및 4개 스키마 확인 완료');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FAIL —', err.message);
  process.exit(1);
});
