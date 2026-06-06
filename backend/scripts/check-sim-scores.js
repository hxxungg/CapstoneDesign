require('dotenv').config();
const { pool } = require('../src/database');

const participationId = parseInt(process.argv[2], 10) || 46;

(async () => {
  const [subs] = await pool.query(
    `SELECT id, step_id, CHAR_LENGTH(content) AS content_len,
            CHAR_LENGTH(content_at_unlock) AS unlock_len
     FROM log_db.submissions WHERE participation_id = ? ORDER BY id`,
    [participationId]
  );
  console.log('=== submissions ===');
  console.table(subs);

  const stepIds = subs.map((s) => s.step_id).filter(Boolean);
  if (stepIds.length) {
    const [steps] = await pool.query(
      `SELECT id, step_order, title, ai_permission
       FROM teacher_db.assessment_steps WHERE id IN (?) ORDER BY step_order`,
      [stepIds]
    );
    console.log('=== steps ===');
    console.table(steps);
  }

  const [logs] = await pool.query(
    `SELECT step_id, COUNT(*) AS cnt
     FROM log_db.ai_logs
     WHERE participation_id = ? AND response IS NOT NULL AND TRIM(response) != ''
     GROUP BY step_id`,
    [participationId]
  );
  console.log('=== ai_logs (with response) ===');
  console.table(logs);

  for (const sub of subs) {
    const [rows] = await pool.query(
      `SELECT segment_order, LEFT(content, 50) AS sentence,
              similarity_score, originality, ai_log_id
       FROM log_db.submissions_step WHERE submission_id = ?
       ORDER BY segment_order`,
      [sub.id]
    );
    const step = stepIds.length
      ? (await pool.query('SELECT step_order FROM teacher_db.assessment_steps WHERE id = ?', [sub.step_id]))[0][0]
      : null;
    console.log(`\n=== step_order=${step?.step_order ?? '?'} submission=${sub.id} ===`);
    console.table(rows);
  }

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
