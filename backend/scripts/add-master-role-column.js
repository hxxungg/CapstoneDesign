/**
 * users.role ENUM에 'master' 추가
 * 실행: node scripts/add-master-role-column.js
 */
require('dotenv').config();
const { pool } = require('../src/database');

async function main() {
  const [cols] = await pool.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = 'capstonedesign' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
  );

  if (cols.length === 0) {
    console.error('capstonedesign.users.role 컬럼을 찾을 수 없습니다.');
    process.exit(1);
  }

  const columnType = String(cols[0].COLUMN_TYPE || '');
  if (columnType.includes("'master'")) {
    console.log('role ENUM에 master가 이미 있습니다.');
    await pool.end();
    return;
  }

  await pool.query(
    `ALTER TABLE capstonedesign.users
     MODIFY COLUMN role ENUM('teacher', 'student', 'master') NOT NULL`
  );
  console.log("role ENUM에 'master'를 추가했습니다.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
