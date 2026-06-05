/**
 * 단계별 이행 채점 — POST /score-step 호출 및 DB 저장
 */
const { pool } = require('../database');
const { aiPostJson } = require('./aiServiceClient');
const {
  STEP_SCORE_THRESHOLD,
  aggregateStepScoreResults,
} = require('../utils/rubricScoring');

const MODEL_VERSION = 'step_scorer_v1';

async function callScoreStep(submissionText, criteria, threshold = STEP_SCORE_THRESHOLD) {
  if (!submissionText?.trim() || !Array.isArray(criteria) || criteria.length === 0) {
    return null;
  }

  const raw = await aiPostJson(
    '/score-step',
    {
      submission: submissionText.trim(),
      criteria,
      threshold,
    },
    120000
  );

  if (!Array.isArray(raw)) return null;
  return aggregateStepScoreResults(raw, threshold);
}

async function saveStepComplianceScore({
  participationId,
  stepId,
  submissionId,
  criteria,
  aggregated,
}) {
  if (!aggregated) return false;

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
      stepId,
      submissionId,
      JSON.stringify(criteria),
      null,
      aggregated.scoreClassification,
      aggregated.confidence,
      JSON.stringify({
        threshold: aggregated.threshold,
        criteria_results: aggregated.results,
      }),
      aggregated.criteriaMet ? 1 : 0,
      MODEL_VERSION,
    ]
  );

  return true;
}

module.exports = {
  MODEL_VERSION,
  callScoreStep,
  saveStepComplianceScore,
};
