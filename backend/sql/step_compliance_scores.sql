-- 단계별 이행 준수(루브릭 채점) 결과 저장
CREATE TABLE IF NOT EXISTS log_db.step_compliance_scores (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  participation_id BIGINT NOT NULL,
  step_id BIGINT NOT NULL,
  submission_id BIGINT NULL,
  instruction TEXT NULL,
  score_regression DECIMAL(4,2) NULL,
  score_classification TINYINT NULL,
  confidence DECIMAL(6,4) NULL,
  class_probs JSON NULL,
  criteria_met TINYINT(1) NOT NULL DEFAULT 0,
  model_version VARCHAR(64) NULL,
  scored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_participation_step (participation_id, step_id),
  KEY idx_participation (participation_id)
) COMMENT='과정중심평가 루브릭 채점 결과';
