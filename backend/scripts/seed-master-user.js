/**
 * 마스터 계정 생성/비밀번호 갱신
 * 실행: node scripts/seed-master-user.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/database');

const MASTER_EMAIL = 'master@master.com';
const MASTER_PASSWORD = '123456';
const MASTER_NAME = 'Master';

async function ensureMasterRoleEnum() {
  const [cols] = await pool.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = 'capstonedesign' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
  );
  const columnType = String(cols[0]?.COLUMN_TYPE || '');
  if (!columnType.includes("'master'")) {
    await pool.query(
      `ALTER TABLE capstonedesign.users
       MODIFY COLUMN role ENUM('teacher', 'student', 'master') NOT NULL`
    );
    console.log("role ENUM에 'master' 추가됨");
  }
}

async function main() {
  await ensureMasterRoleEnum();
  const passwordHash = await bcrypt.hash(MASTER_PASSWORD, 10);

  const [existing] = await pool.query(
    'SELECT id FROM capstonedesign.users WHERE email = ?',
    [MASTER_EMAIL]
  );

  let userId;
  if (existing.length > 0) {
    userId = existing[0].id;
    await pool.query(
      'UPDATE capstonedesign.users SET name = ?, role = ?, is_active = 1 WHERE id = ?',
      [MASTER_NAME, 'master', userId]
    );
    await pool.query(
      'UPDATE capstonedesign.user_credentials SET password_hash = ? WHERE user_id = ?',
      [passwordHash, userId]
    );
    console.log(`마스터 계정 갱신 — user_id=${userId}`);
  } else {
    const [result] = await pool.query(
      'INSERT INTO capstonedesign.users (email, name, role, is_active) VALUES (?, ?, ?, 1)',
      [MASTER_EMAIL, MASTER_NAME, 'master']
    );
    userId = result.insertId;
    await pool.query(
      'INSERT INTO capstonedesign.user_credentials (user_id, password_hash) VALUES (?, ?)',
      [userId, passwordHash]
    );
    console.log(`마스터 계정 생성 — user_id=${userId}`);
  }

  console.log(`이메일: ${MASTER_EMAIL}`);
  console.log(`비밀번호: ${MASTER_PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
