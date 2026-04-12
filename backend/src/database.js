const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcryptjs');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, '..', 'data.json'));
const db = low(adapter);

function getDb() {
  return db;
}

function nextId(collection) {
  const key = `_counters_${collection}`;
  const current = db.get(key).value() || 0;
  const next = current + 1;
  db.set(key, next).write();
  return next;
}

function initDatabase() {
  db.defaults({
    users: [],
    assignments: [],
    stages: [],
    student_assignments: [],
    ai_logs: [],
    exit_attempts: [],
  }).write();

  const teacherExists = db.get('users').find({ email: 'teacher@test.com' }).value();

  if (!teacherExists) {
    db.set('_counters_users', 0)
      .set('_counters_assignments', 0)
      .set('_counters_stages', 0)
      .set('_counters_student_assignments', 0)
      .set('_counters_ai_logs', 0)
      .set('_counters_exit_attempts', 0)
      .write();

    const teacherPw = bcrypt.hashSync('teacher123', 10);
    db.get('users').push({
      id: nextId('users'),
      name: '김교사',
      email: 'teacher@test.com',
      password: teacherPw,
      role: 'teacher',
      teacher_code: 'TCH001',
      created_at: new Date().toISOString(),
    }).write();

    const studentPw = bcrypt.hashSync('student123', 10);
    db.get('users').push({
      id: nextId('users'),
      name: '홍길동',
      email: 'student@test.com',
      password: studentPw,
      role: 'student',
      teacher_code: 'TCH001',
      created_at: new Date().toISOString(),
    }).write();

    console.log('기본 계정 생성 완료 (teacher@test.com / teacher123, student@test.com / student123)');
  }

  console.log('데이터베이스 초기화 완료 (data.json)');
}

module.exports = { getDb, initDatabase, nextId };
