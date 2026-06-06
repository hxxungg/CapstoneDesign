-- capstonedesign.users.role ENUM에 master 추가
ALTER TABLE capstonedesign.users
  MODIFY COLUMN role ENUM('teacher', 'student', 'master') NOT NULL;
