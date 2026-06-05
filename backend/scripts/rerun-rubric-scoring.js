/**
 * 기존 participation에 대해 단계별 이행(루브릭) 판정 재실행
 * 실행: node scripts/rerun-rubric-scoring.js <participation_id>
 */
require('dotenv').config();
const { pool } = require('../src/database');
const { buildStepScoringPlan } = require('../src/utils/rubricScoring');
const {
  callScoreStep,
  saveStepComplianceScore,
} = require('../src/services/stepComplianceScoring');
const participationId = parseInt(process.argv[2], 10);

async function runRubricScoring(participationId, assessmentId) {
  const t0 = Date.now();
  console.log(`[루브릭채점] 시작 — participation=${participationId} assessment=${assessmentId}`);

  const [[assessment]] = await pool.query(
    'SELECT rubric_json FROM teacher_db.assessments WHERE id = ?',
    [assessmentId]
  );

  const [steps] = await pool.query(
    `SELECT id, step_order, title, description
     FROM teacher_db.assessment_steps
     WHERE assessment_id = ?
     ORDER BY step_order ASC`,
    [assessmentId]
  );
  const stepInstructions = buildStepScoringPlan(steps, assessment?.rubric_json ?? null);
  if (!stepInstructions) {
    console.log(`[루브릭채점] 채점 가능한 단계 없음 — participation=${participationId}`);
    return;
  }

  const stepByOrder = Object.fromEntries(steps.map((s) => [s.step_order, s]));
  const [submissions] = await pool.query(
    `SELECT sub.id AS submissionId, sub.step_id, sub.content, s.step_order
     FROM log_db.submissions sub
     JOIN teacher_db.assessment_steps s ON sub.step_id = s.id
     WHERE sub.participation_id = ?
       AND sub.content IS NOT NULL AND TRIM(sub.content) != ''
     ORDER BY s.step_order ASC`,
    [participationId]
  );

  const subByOrder = {};
  submissions.forEach((sub) => {
    if (sub.step_order != null) subByOrder[sub.step_order] = sub;
  });

  for (const item of stepInstructions) {
    const step = stepByOrder[item.stepOrder];
    const submission = subByOrder[item.stepOrder];
    if (!step || !submission?.content?.trim()) {
      console.log(`[루브릭채점] step_order=${item.stepOrder} 제출 없음 — 스킵`);
      continue;
    }

    try {
      const aggregated = await callScoreStep(submission.content.trim(), item.criteria);
      if (!aggregated) {
        console.error(`[단계이행채점] AI 오류 step_order=${item.stepOrder} — /score-step 응답 없음`);
        continue;
      }

      await saveStepComplianceScore({
        participationId,
        stepId: step.id,
        submissionId: submission.submissionId,
        criteria: item.criteria,
        aggregated,
      });
      console.log(
        `[단계이행채점] 저장 step_order=${item.stepOrder} score=${aggregated.scoreClassification} met=${aggregated.criteriaMet}`
      );
    } catch (err) {
      console.error(`[단계이행채점] 오류 step_order=${item.stepOrder}`, err.message);
    }
  }

  console.log(`[루브릭채점] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) participation=${participationId}`);
}

async function main() {
  if (!Number.isFinite(participationId)) {
    console.error('사용법: node scripts/rerun-rubric-scoring.js <participation_id>');
    process.exit(1);
  }

  console.log('=== 단계별 이행 판정 재실행 ===');
  console.log(`participation_id: ${participationId}`);
  console.log(`AI_SERVICE_URL: ${AI_SERVICE_URL}\n`);

  try {
    const [[row]] = await pool.query(
      'SELECT assessment_id FROM student_db.participations WHERE id = ?',
      [participationId]
    );
    if (!row) {
      console.error('participation을 찾을 수 없습니다.');
      process.exit(1);
    }

    await runRubricScoring(participationId, row.assessment_id);
  } catch (err) {
    console.error('스크립트 오류:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
