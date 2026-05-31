-- 평가 설계(루브릭) JSON 저장용 컬럼
ALTER TABLE teacher_db.assessments
  ADD COLUMN rubric_json JSON NULL COMMENT '평가 설계 전체 (GradingRubricTable rubric 객체)' AFTER description;
