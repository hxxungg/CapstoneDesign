-- master@master.com 계정만 남기고 전체 데이터 삭제
-- 서버에서 실행: mysql -h 10.0.2.6 -u capstone -p < backend/sql/reset_all_except_master.sql

SET @master_id := (
  SELECT id FROM capstonedesign.users WHERE email = 'master@master.com' LIMIT 1
);

SELECT IF(@master_id IS NULL, 'ERROR: master 계정 없음 — seed-master-user.js 먼저 실행', CONCAT('master user_id=', @master_id)) AS check_msg;

START TRANSACTION;
SET FOREIGN_KEY_CHECKS = 0;

-- log_db 전체
DELETE FROM log_db.submissions_step;
DELETE FROM log_db.submissions;
DELETE FROM log_db.ai_logs;
DELETE FROM log_db.url_logs;
DELETE FROM log_db.step_compliance_scores;
DELETE FROM log_db.activity_logs;
DELETE FROM log_db.exit_attempts;

-- student_db 전체
DELETE FROM student_db.participations;
DELETE FROM student_db.student_stage_writings;
DELETE FROM student_db.student_assignments;
DELETE FROM student_db.students;

-- teacher_db 전체
DELETE FROM teacher_db.evaluations;
DELETE FROM teacher_db.assessment_steps;
DELETE FROM teacher_db.assessments;
DELETE FROM teacher_db.stages;
DELETE FROM teacher_db.assignments;
DELETE FROM teacher_db.teachers;

-- capstonedesign (master 제외)
DELETE FROM capstonedesign.user_oauth_connections WHERE user_id <> @master_id;
DELETE FROM capstonedesign.user_consents WHERE user_id <> @master_id;
DELETE FROM capstonedesign.user_credentials WHERE user_id <> @master_id;
DELETE FROM capstonedesign.users WHERE id <> @master_id;

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

SELECT '남은 사용자' AS label;
SELECT id, email, name, role FROM capstonedesign.users;
