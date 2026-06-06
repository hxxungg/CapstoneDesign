/**
 * 수행평가 참여 데이터를 다른 assessment로 이전
 * - participations.assessment_id 변경
 * - 연관 로그/제출의 step_id를 대상 수행평가 단계 ID로 재매핑 (step_order 기준)
 *
 * 사용: node scripts/migrate-participations.js <from_assessment_id> <to_assessment_id>
 * 예:   node scripts/migrate-participations.js 35 36
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const FROM_ID = parseInt(process.argv[2], 10);
const TO_ID = parseInt(process.argv[3], 10);

const STEP_TABLES = [
  'log_db.submissions',
  'log_db.ai_logs',
  'log_db.url_logs',
  'log_db.step_compliance_scores',
];

async function main() {
  if (!FROM_ID || !TO_ID || FROM_ID === TO_ID) {
    console.error('사용법: node scripts/migrate-participations.js <from_id> <to_id>');
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 13306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dateStrings: true,
  });

  const conn = await pool.getConnection();
  try {
    const [[fromA]] = await conn.query(
      'SELECT id, title FROM teacher_db.assessments WHERE id = ?',
      [FROM_ID]
    );
    const [[toA]] = await conn.query(
      'SELECT id, title FROM teacher_db.assessments WHERE id = ?',
      [TO_ID]
    );
    if (!fromA || !toA) {
      console.error('assessment를 찾을 수 없습니다.', { from: !!fromA, to: !!toA });
      process.exit(1);
    }

    const [fromSteps] = await conn.query(
      'SELECT id, step_order, title, ai_permission FROM teacher_db.assessment_steps WHERE assessment_id = ? ORDER BY step_order',
      [FROM_ID]
    );
    const [toSteps] = await conn.query(
      'SELECT id, step_order, title, ai_permission FROM teacher_db.assessment_steps WHERE assessment_id = ? ORDER BY step_order',
      [TO_ID]
    );

    if (fromSteps.length !== toSteps.length) {
      console.error(`단계 수 불일치: ${FROM_ID}=${fromSteps.length}, ${TO_ID}=${toSteps.length}`);
      process.exit(1);
    }

    const stepMap = {};
    for (let i = 0; i < fromSteps.length; i++) {
      const fs = fromSteps[i];
      const ts = toSteps[i];
      if (fs.title !== ts.title || fs.ai_permission !== ts.ai_permission) {
        console.error(
          `단계 ${fs.step_order} 불일치: "${fs.title}"(${fs.ai_permission}) vs "${ts.title}"(${ts.ai_permission})`
        );
        process.exit(1);
      }
      stepMap[fs.id] = ts.id;
    }

    const [parts] = await conn.query(
      `SELECT p.id, p.student_id, u.name AS student_name
       FROM student_db.participations p
       JOIN student_db.students s ON p.student_id = s.id
       JOIN capstonedesign.users u ON s.user_id = u.id
       WHERE p.assessment_id = ?`,
      [FROM_ID]
    );
    if (parts.length === 0) {
      console.log(`assessment ${FROM_ID}에 이전할 참여가 없습니다.`);
      process.exit(0);
    }

    const partIds = parts.map((p) => p.id);

    const [conflicts] = await conn.query(
      `SELECT p.student_id, u.name
       FROM student_db.participations p
       JOIN student_db.students s ON p.student_id = s.id
       JOIN capstonedesign.users u ON s.user_id = u.id
       WHERE p.assessment_id = ? AND p.student_id IN (?)`,
      [TO_ID, parts.map((p) => p.student_id)]
    );
    if (conflicts.length > 0) {
      console.error('대상 assessment에 이미 참여 중인 학생이 있습니다:', conflicts);
      process.exit(1);
    }

    console.log(`이전: assessment ${FROM_ID} "${fromA.title}" → ${TO_ID} "${toA.title}"`);
    console.log('step_id 매핑:', stepMap);
    console.log(`참여 ${parts.length}건:`, parts);

    await conn.beginTransaction();

    for (const [oldStepId, newStepId] of Object.entries(stepMap)) {
      for (const table of STEP_TABLES) {
        const [r] = await conn.query(
          `UPDATE ${table} SET step_id = ? WHERE participation_id IN (?) AND step_id = ?`,
          [newStepId, partIds, Number(oldStepId)]
        );
        if (r.affectedRows > 0) {
          console.log(`${table}: step ${oldStepId}→${newStepId} ${r.affectedRows}행`);
        }
      }
    }

    const [uParts] = await conn.query(
      'UPDATE student_db.participations SET assessment_id = ? WHERE id IN (?)',
      [TO_ID, partIds]
    );
    console.log(`participations assessment_id 변경: ${uParts.affectedRows}행`);

    await conn.commit();

    const [afterFrom] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM student_db.participations WHERE assessment_id = ?',
      [FROM_ID]
    );
    const [afterTo] = await conn.query(
      `SELECT p.id, u.name, p.status, p.current_step
       FROM student_db.participations p
       JOIN student_db.students s ON p.student_id = s.id
       JOIN capstonedesign.users u ON s.user_id = u.id
       WHERE p.assessment_id = ?
       ORDER BY p.id`,
      [TO_ID]
    );

    console.log('\n=== 완료 ===');
    console.log(`assessment ${FROM_ID} 남은 참여: ${afterFrom[0].cnt}건`);
    console.log(`assessment ${TO_ID} 참여 (${afterTo.length}건):`);
    console.table(afterTo);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('실패:', err.message);
  process.exit(1);
});
