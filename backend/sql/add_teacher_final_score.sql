-- NCP Cloud DB에서 실행 (student_db)
ALTER TABLE student_db.participations
  ADD COLUMN teacher_final_score VARCHAR(32) NULL
  COMMENT '교사 입력 최종 점수'
  AFTER status;
