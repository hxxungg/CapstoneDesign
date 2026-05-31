/**
 * 단계별 이행(루브릭) — DB 읽기 + 모델 호출만 (INSERT/UPDATE 없음)
 */
const { pool } = require('../database');
const { buildStepScoringPlan, isCriteriaMet } = require('../utils/rubricScoring');
const { aiPostJson } = require('./aiServiceClient');

/** DB에 없는 단계만 모델 호출 → 메모리 결과 반환 (DB 미기록) */
async function computeMissingComplianceScores(participationId, assessmentId, existingRows = []) {
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
  if (!stepInstructions) return [];

  const stepByOrder = Object.fromEntries(steps.map((s) => [s.step_order, s]));
  const scoredStepIds = new Set(existingRows.map((r) => Number(r.step_id)));

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

  const computed = [];

  for (const item of stepInstructions) {
    const step = stepByOrder[item.stepOrder];
    const submission = subByOrder[item.stepOrder];
    if (!step || !submission?.content?.trim()) continue;
    if (scoredStepIds.has(Number(step.id))) continue;

    const result = await aiPostJson(
      '/score-rubric',
      {
        instruction: item.instruction,
        student_text: submission.content.trim(),
      },
      120000
    );
    if (!result) continue;

    const criteriaMet = isCriteriaMet(result.score_classification);
    computed.push({
      step_id: step.id,
      step_order: step.step_order,
      step_title: step.title,
      submission_id: submission.submissionId,
      score_regression: result.score_regression ?? null,
      score_classification: result.score_classification ?? null,
      confidence: result.confidence ?? null,
      criteria_met: criteriaMet ? 1 : 0,
      scored_at: null,
    });
  }

  return computed;
}

/** DB 행 + 미저장 계산 결과 병합 (DB 쓰기 없음) */
async function ensureComplianceScores(participationId, assessmentId, existingRows = []) {
  try {
    const computed = await computeMissingComplianceScores(
      participationId,
      assessmentId,
      existingRows
    );
    return [...existingRows, ...computed];
  } catch (err) {
    console.error('[ensureComplianceScores]', err.message);
    return existingRows;
  }
}

function toComplianceDto(row) {
  if (!row) return null;
  return {
    criteria_met: Boolean(row.criteria_met),
    score_classification: row.score_classification,
    score_regression: row.score_regression,
    confidence: row.confidence,
    status: row.criteria_met ? '이행' : '미이행',
    scored_at: row.scored_at ?? null,
  };
}

module.exports = {
  computeMissingComplianceScores,
  ensureComplianceScores,
  toComplianceDto,
};
