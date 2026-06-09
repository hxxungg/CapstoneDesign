/**
 * 특정 수행평가 + 특정 학생(user_id) 참여 기록만 삭제
 * 실행: node scripts/reset-student-participation.js <assessment_id> <student_user_id>
 * 예: node scripts/reset-student-participation.js 45 22
 */
require('dotenv').config();
const { pool } = require('../src/database');
const { deleteParticipationLogs } = require('../src/services/assessmentCleanup');

const ASSESSMENT_ID = parseInt(process.argv[2], 10);
const STUDENT_USER_ID = parseInt(process.argv[3], 10);

async function main() {
  if (!Number.isFinite(ASSESSMENT_ID) || !Number.isFinite(STUDENT_USER_ID)) {
    console.error('사용법: node scripts/reset-student-participation.js <assessment_id> <student_user_id>');
    process.exit(1);
  }

  const [[assessment]] = await pool.query(
    'SELECT id, title, status FROM teacher_db.assessments WHERE id = ?',
    [ASSESSMENT_ID]
  );
  if (!assessment) {
    throw new Error(`assessment ${ASSESSMENT_ID} 없음`);
  }

  const [[student]] = await pool.query(
    `SELECT s.id AS student_id, u.id AS user_id, u.name
     FROM student_db.students s
     JOIN capstonedesign.users u ON u.id = s.user_id
     WHERE u.id = ?`,
    [STUDENT_USER_ID]
  );
  if (!student) {
    throw new Error(`student user_id=${STUDENT_USER_ID} 없음`);
  }

  const [parts] = await pool.query(
    `SELECT p.id, p.status, p.current_step, p.created_at
     FROM student_db.participations p
     WHERE p.assessment_id = ? AND p.student_id = ?`,
    [ASSESSMENT_ID, student.student_id]
  );

  if (parts.length === 0) {
    console.log(`삭제할 참여 없음 — assessment=${ASSESSMENT_ID}, ${student.name}(user_id=${STUDENT_USER_ID})`);
    await pool.end();
    return;
  }

  const partIds = parts.map((p) => p.id);
  console.log('수행평가:', assessment);
  console.log('학생:', student);
  console.log('삭제 대상 participation:', parts);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await deleteParticipationLogs(conn, partIds);
    const [del] = await conn.query(
      'DELETE FROM student_db.participations WHERE id IN (?)',
      [partIds]
    );
    await conn.commit();
    console.log(`\n완료 — participations ${del.affectedRows}건 및 연관 로그·제출·채점 삭제`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
