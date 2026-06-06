/**
 * participation 채점 입력·결과 조회
 * node scripts/inspect-participation-scoring.js <participation_id>
 */
require('dotenv').config();
const { pool } = require('../src/database');
const { buildStepScoringPlan } = require('../src/utils/rubricScoring');

const participationId = parseInt(process.argv[2], 10);

async function main() {
  if (!Number.isFinite(participationId)) {
    console.error('사용법: node scripts/inspect-participation-scoring.js <participation_id>');
    process.exit(1);
  }

  const [[part]] = await pool.query(
    `SELECT p.id, p.assessment_id, a.title, u.name AS student_name
     FROM student_db.participations p
     JOIN teacher_db.assessments a ON p.assessment_id = a.id
     JOIN student_db.students s ON p.student_id = s.id
     JOIN capstonedesign.users u ON s.user_id = u.id
     WHERE p.id = ?`,
    [participationId]
  );
  if (!part) {
    console.error('participation 없음');
    process.exit(1);
  }

  console.log('=== 참여 정보 ===');
  console.table([part]);

  const [steps] = await pool.query(
    `SELECT id, step_order, title, description
     FROM teacher_db.assessment_steps
     WHERE assessment_id = ?
     ORDER BY step_order`,
    [part.assessment_id]
  );

  const plan = buildStepScoringPlan(steps) || [];

  const [subs] = await pool.query(
    `SELECT sub.id, s.step_order, sub.content
     FROM log_db.submissions sub
     JOIN teacher_db.assessment_steps s ON sub.step_id = s.id
     WHERE sub.participation_id = ?
     ORDER BY s.step_order`,
    [participationId]
  );

  const [scores] = await pool.query(
    `SELECT sc.step_id, s.step_order, sc.criteria_met, sc.score_classification,
            sc.instruction, sc.class_probs, sc.scored_at
     FROM log_db.step_compliance_scores sc
     JOIN teacher_db.assessment_steps s ON sc.step_id = s.id
     WHERE sc.participation_id = ?
     ORDER BY s.step_order`,
    [participationId]
  );

  const subByOrder = Object.fromEntries(subs.map((s) => [s.step_order, s]));
  const scoreByOrder = Object.fromEntries(scores.map((s) => [s.step_order, s]));

  console.log('\n=== 단계별 모델 입력 (현재 코드 기준) ===');
  for (const item of plan) {
    const sub = subByOrder[item.stepOrder];
    const sc = scoreByOrder[item.stepOrder];
    console.log(`\n--- ${item.stepOrder}단계 ---`);
    console.log('submission:', JSON.stringify(sub?.content ?? '(없음)'));
    console.log('criteria:', JSON.stringify(item.criteria));
    if (sc) {
      console.log('저장 score:', sc.score_classification, 'met:', sc.criteria_met);
      try {
        const probs = JSON.parse(sc.class_probs);
        console.log('model results:', JSON.stringify(probs.criteria_results, null, 2));
      } catch (_) {}
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
