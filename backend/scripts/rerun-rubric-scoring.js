/**
 * 기존 participation에 대해 단계별 이행(루브릭) 판정 재실행
 * 실행: node scripts/rerun-rubric-scoring.js <participation_id>
 */
require('dotenv').config();
const { pool } = require('../src/database');
const {
  buildStepScoringPlan,
  isCriteriaMet,
} = require('../src/utils/rubricScoring');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001';
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(`${AI_SERVICE_URL}/score-rubric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: item.instruction,
          student_text: submission.content.trim(),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(
          `[루브릭채점] AI 오류 step_order=${item.stepOrder} status=${res.status} ${errText.slice(0, 200)}`
        );
        continue;
      }

      const result = await res.json();
      const criteriaMet = isCriteriaMet(result.score_classification);

      await pool.query(
        `INSERT INTO log_db.step_compliance_scores
           (participation_id, step_id, submission_id, instruction,
            score_regression, score_classification, confidence, class_probs,
            criteria_met, model_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           submission_id = VALUES(submission_id),
           instruction = VALUES(instruction),
           score_regression = VALUES(score_regression),
           score_classification = VALUES(score_classification),
           confidence = VALUES(confidence),
           class_probs = VALUES(class_probs),
           criteria_met = VALUES(criteria_met),
           model_version = VALUES(model_version),
           scored_at = CURRENT_TIMESTAMP`,
        [
          participationId,
          step.id,
          submission.submissionId,
          item.instruction,
          result.score_regression ?? null,
          result.score_classification ?? null,
          result.confidence ?? null,
          result.class_probs ? JSON.stringify(result.class_probs) : null,
          criteriaMet ? 1 : 0,
          'essay_rubric_scorer_v1',
        ]
      );
      console.log(
        `[루브릭채점] 저장 step_order=${item.stepOrder} class=${result.score_classification} met=${criteriaMet}`
      );
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.error(`[루브릭채점] 타임아웃 step_order=${item.stepOrder}`);
      } else {
        console.error(`[루브릭채점] 오류 step_order=${item.stepOrder}`, err.message);
      }
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
