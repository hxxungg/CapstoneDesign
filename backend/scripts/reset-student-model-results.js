/**
 * 특정 학생의 모델 분석 결과만 초기화 (제출 본문·로그 원문은 유지).
 * - log_db.submissions.content 유지
 * - submissions_step: 본문 1행(segment_order=0), similarity/originality/ai_log_id NULL
 * - step_compliance_scores 삭제
 * - ai_logs: prompt_type/level, critical_*, related_url_log_id, relevance_score NULL
 *
 * 사용: node scripts/reset-student-model-results.js [student_id|user_name]
 */
require('dotenv').config();
const { pool } = require('../src/database');

const arg = process.argv[2] || '하승연';

async function resolveStudentId() {
  if (/^\d+$/.test(arg)) return parseInt(arg, 10);

  const [rows] = await pool.query(
    `SELECT s.id FROM student_db.students s
     JOIN capstonedesign.users u ON u.id = s.user_id
     WHERE u.name = ? OR u.email = ?`,
    [arg, arg]
  );
  if (rows.length === 0) {
    const [like] = await pool.query(
      `SELECT s.id, u.name FROM student_db.students s
       JOIN capstonedesign.users u ON u.id = s.user_id
       WHERE u.name LIKE ?`,
      [`%${arg}%`]
    );
    if (like.length === 1) return like[0].id;
    throw new Error(`학생을 찾을 수 없음: ${arg}`);
  }
  return rows[0].id;
}

async function main() {
  const studentId = await resolveStudentId();
  console.log(`=== 모델 결과 초기화 — student_id=${studentId} ===`);

  const [parts] = await pool.query(
    'SELECT id FROM student_db.participations WHERE student_id = ?',
    [studentId]
  );
  const partIds = parts.map((p) => p.id);
  if (partIds.length === 0) {
    console.log('participation 없음');
    return;
  }

  const [subs] = await pool.query(
    `SELECT id, participation_id, content FROM log_db.submissions
     WHERE participation_id IN (?)
     ORDER BY id`,
    [partIds]
  );

  console.log(`participations: ${partIds.join(', ')}`);
  console.log(`submissions: ${subs.length}개`);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const sub of subs) {
      await conn.query('DELETE FROM log_db.submissions_step WHERE submission_id = ?', [sub.id]);
      if (sub.content && sub.content.trim()) {
        await conn.query(
          `INSERT INTO log_db.submissions_step (submission_id, segment_order, content)
           VALUES (?, 0, ?)`,
          [sub.id, sub.content.trim()]
        );
      }
      console.log(`  reset submission #${sub.id} (participation=${sub.participation_id})`);
    }

    const [delRubric] = await conn.query(
      'DELETE FROM log_db.step_compliance_scores WHERE participation_id IN (?)',
      [partIds]
    );
    console.log(`  step_compliance_scores 삭제: ${delRubric.affectedRows}행`);

    const [resetAiLogs] = await conn.query(
      `UPDATE log_db.ai_logs
       SET prompt_type = NULL,
           prompt_level = NULL,
           critical_label = NULL,
           critical_label_name = NULL,
           critical_confidence = NULL,
           related_url_log_id = NULL,
           relevance_score = NULL
       WHERE participation_id IN (?)`,
      [partIds]
    );
    console.log(`  ai_logs 모델 필드 초기화: ${resetAiLogs.affectedRows}행`);

    await conn.commit();
    console.log('=== 초기화 완료 — node scripts/rerun-student-models.js 로 재분석 ===');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
