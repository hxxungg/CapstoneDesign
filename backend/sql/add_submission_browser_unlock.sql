-- 조건부 AI 단계: 웹뷰 해제 시각·해제 직전 작성 스냅샷
ALTER TABLE log_db.submissions
  ADD COLUMN content_at_unlock TEXT NULL,
  ADD COLUMN browser_unlocked_at DATETIME NULL;
