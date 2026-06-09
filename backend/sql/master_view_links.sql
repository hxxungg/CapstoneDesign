-- 마스터 계정이 특정 학생/교사 화면만 볼 때 연결 (전역 마스터는 행 없음)
CREATE TABLE IF NOT EXISTS capstonedesign.master_view_links (
  user_id BIGINT NOT NULL PRIMARY KEY,
  view_student_user_id BIGINT NULL,
  view_teacher_user_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mvl_user FOREIGN KEY (user_id) REFERENCES capstonedesign.users (id) ON DELETE CASCADE,
  CONSTRAINT fk_mvl_student FOREIGN KEY (view_student_user_id) REFERENCES capstonedesign.users (id) ON DELETE SET NULL,
  CONSTRAINT fk_mvl_teacher FOREIGN KEY (view_teacher_user_id) REFERENCES capstonedesign.users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
