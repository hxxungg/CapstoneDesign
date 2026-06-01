/**
 * assessment_id=25 (진로에 관한 글쓰기) 참여 기록 전체 삭제 + 수행평가 재활성화
 * 실행: node scripts/reset-assessment-participations.js [assessment_id]
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const ASSESSMENT_ID = parseInt(process.argv[2], 10) || 25;
// 3시 50분(오후) 마감 — 이전 03:50(새벽) 설정으로 즉시 마감된 것으로 보임
const NEW_DEADLINE = '2026-06-07 15:50:00';

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 13306,
    user: process.env.DB_USER || 'capstone',
    password: process.env.DB_PASSWORD || 'Capstone1!',
    dateStrings: true,
  });

  const conn = await pool.getConnection();
  try {
    const [[assessment]] = await conn.query(
      `SELECT id, title, status, deadline, invite_code
       FROM teacher_db.assessments WHERE id = ?`,
      [ASSESSMENT_ID]
    );
    if (!assessment) {
      console.error(`assessment ${ASSESSMENT_ID} 없음`);
      process.exit(1);
    }
    console.log('대상 수행평가:', assessment);

    const [parts] = await conn.query(
      'SELECT id, student_id, status, current_step FROM student_db.participations WHERE assessment_id = ?',
      [ASSESSMENT_ID]
    );
    const partIds = parts.map((p) => p.id);
    console.log(`참여 ${parts.length}건:`, partIds);

    await conn.beginTransaction();

    if (partIds.length > 0) {
      const [subs] = await conn.query(
        'SELECT id FROM log_db.submissions WHERE participation_id IN (?)',
        [partIds]
      );
      const subIds = subs.map((s) => s.id);

      if (subIds.length > 0) {
        const [d1] = await conn.query(
          'DELETE FROM log_db.submissions_step WHERE submission_id IN (?)',
          [subIds]
        );
        console.log(`submissions_step 삭제: ${d1.affectedRows}행`);
      }

      const tables = [
        ['log_db.submissions', 'participation_id'],
        ['log_db.ai_logs', 'participation_id'],
        ['log_db.url_logs', 'participation_id'],
        ['log_db.step_compliance_scores', 'participation_id'],
        ['teacher_db.evaluations', 'participation_id'],
      ];
      for (const [table, col] of tables) {
        const [r] = await conn.query(
          `DELETE FROM ${table} WHERE ${col} IN (?)`,
          [partIds]
        );
        console.log(`${table} 삭제: ${r.affectedRows}행`);
      }

      const [dPart] = await conn.query(
        'DELETE FROM student_db.participations WHERE assessment_id = ?',
        [ASSESSMENT_ID]
      );
      console.log(`participations 삭제: ${dPart.affectedRows}행`);
    }

    const [u] = await conn.query(
      `UPDATE teacher_db.assessments
       SET status = 'active', deadline = ?
       WHERE id = ?`,
      [NEW_DEADLINE, ASSESSMENT_ID]
    );
    console.log(`assessments 업데이트: ${u.affectedRows}행 (status=active, deadline=${NEW_DEADLINE})`);

    await conn.commit();

    const [[after]] = await conn.query(
      `SELECT id, title, status, deadline, invite_code FROM teacher_db.assessments WHERE id = ?`,
      [ASSESSMENT_ID]
    );
    const [partsAfter] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM student_db.participations WHERE assessment_id = ?',
      [ASSESSMENT_ID]
    );
    console.log('\n=== 완료 ===');
    console.log('수행평가:', after);
    console.log('남은 참여:', partsAfter[0].cnt, '건');
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
