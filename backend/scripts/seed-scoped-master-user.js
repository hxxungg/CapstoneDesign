/**
 * 특정 학생/교사 화면 전환용 마스터 계정 생성
 * 실행: node scripts/seed-scoped-master-user.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/database');

const EMAIL = 'test10@test.com';
const PASSWORD = '123456';
const NAME = '테스트10';
const VIEW_STUDENT_USER_ID = 22;
const VIEW_TEACHER_USER_ID = 26;

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

async function ensureLinksTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS capstonedesign.master_view_links (
      user_id BIGINT NOT NULL PRIMARY KEY,
      view_student_user_id BIGINT NULL,
      view_teacher_user_id BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_mvl_user FOREIGN KEY (user_id) REFERENCES capstonedesign.users (id) ON DELETE CASCADE,
      CONSTRAINT fk_mvl_student FOREIGN KEY (view_student_user_id) REFERENCES capstonedesign.users (id) ON DELETE SET NULL,
      CONSTRAINT fk_mvl_teacher FOREIGN KEY (view_teacher_user_id) REFERENCES capstonedesign.users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function verifyLinkedUsers() {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.role, s.id AS student_id, t.id AS teacher_id
     FROM capstonedesign.users u
     LEFT JOIN student_db.students s ON s.user_id = u.id
     LEFT JOIN teacher_db.teachers t ON t.user_id = u.id
     WHERE u.id IN (?, ?)`,
    [VIEW_STUDENT_USER_ID, VIEW_TEACHER_USER_ID]
  );
  const student = rows.find((r) => Number(r.id) === VIEW_STUDENT_USER_ID);
  const teacher = rows.find((r) => Number(r.id) === VIEW_TEACHER_USER_ID);
  if (!student || student.role !== 'student' || !student.student_id) {
    throw new Error(`학생 user_id=${VIEW_STUDENT_USER_ID} 확인 실패`);
  }
  if (!teacher || teacher.role !== 'teacher' || !teacher.teacher_id) {
    throw new Error(`교사 user_id=${VIEW_TEACHER_USER_ID} 확인 실패`);
  }
  console.log(`연결 학생: ${student.name} (user_id=${student.id})`);
  console.log(`연결 교사: ${teacher.name} (user_id=${teacher.id})`);
}

async function main() {
  await ensureMasterRoleEnum();
  await ensureLinksTable();
  await verifyLinkedUsers();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [existing] = await pool.query(
    'SELECT id FROM capstonedesign.users WHERE email = ?',
    [EMAIL]
  );

  let userId;
  if (existing.length > 0) {
    userId = existing[0].id;
    await pool.query(
      'UPDATE capstonedesign.users SET name = ?, role = ?, is_active = 1 WHERE id = ?',
      [NAME, 'master', userId]
    );
    await pool.query(
      'UPDATE capstonedesign.user_credentials SET password_hash = ? WHERE user_id = ?',
      [passwordHash, userId]
    );
    console.log(`계정 갱신 — user_id=${userId}`);
  } else {
    const [result] = await pool.query(
      'INSERT INTO capstonedesign.users (email, name, role, is_active) VALUES (?, ?, ?, 1)',
      [EMAIL, NAME, 'master']
    );
    userId = result.insertId;
    await pool.query(
      'INSERT INTO capstonedesign.user_credentials (user_id, password_hash) VALUES (?, ?)',
      [userId, passwordHash]
    );
    console.log(`계정 생성 — user_id=${userId}`);
  }

  await pool.query(
    `INSERT INTO capstonedesign.master_view_links
       (user_id, view_student_user_id, view_teacher_user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       view_student_user_id = VALUES(view_student_user_id),
       view_teacher_user_id = VALUES(view_teacher_user_id)`,
    [userId, VIEW_STUDENT_USER_ID, VIEW_TEACHER_USER_ID]
  );

  console.log('\n로그인 정보');
  console.log(`이메일: ${EMAIL}`);
  console.log(`비밀번호: ${PASSWORD}`);
  console.log(`학생 화면 → user_id ${VIEW_STUDENT_USER_ID}`);
  console.log(`교사 화면 → user_id ${VIEW_TEACHER_USER_ID}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
