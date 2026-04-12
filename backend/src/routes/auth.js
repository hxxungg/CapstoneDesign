const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, nextId } = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// 회원가입
router.post('/register', (req, res) => {
  const { name, email, password, role, teacher_code } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: '필수 정보를 입력해주세요.' });
  }
  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: '역할은 teacher 또는 student여야 합니다.' });
  }

  const db = getDb();

  const existingUser = db.get('users').find({ email }).value();
  if (existingUser) {
    return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
  }

  let code = teacher_code || null;

  if (role === 'student' && teacher_code) {
    const teacher = db.get('users').find({ teacher_code, role: 'teacher' }).value();
    if (!teacher) {
      return res.status(400).json({ error: '유효하지 않은 교사 코드입니다.' });
    }
    code = teacher_code;
  }

  if (role === 'teacher') {
    code = `TCH${Date.now().toString().slice(-6)}`;
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const id = nextId('users');
  const newUser = {
    id,
    name,
    email,
    password: hashedPassword,
    role,
    teacher_code: code,
    created_at: new Date().toISOString(),
  };

  db.get('users').push(newUser).write();

  const token = jwt.sign(
    { id, name, email, role, teacher_code: code },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({ token, user: { id, name, email, role, teacher_code: code } });
});

// 로그인
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  const db = getDb();
  const user = db.get('users').find({ email }).value();

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, teacher_code: user.teacher_code },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, teacher_code: user.teacher_code },
  });
});

// 현재 사용자 정보
router.get('/me', authenticateToken, (req, res) => {
  const db = getDb();
  const user = db.get('users').find({ id: req.user.id }).value();
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  const { password: _, ...safeUser } = user;
  res.json(safeUser);
});

// 교사의 학생 목록 조회
router.get('/students', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '교사 권한이 필요합니다.' });
  }

  const db = getDb();
  const teacher = db.get('users').find({ id: req.user.id }).value();
  const students = db.get('users')
    .filter({ teacher_code: teacher.teacher_code, role: 'student' })
    .map(({ password: _, ...u }) => u)
    .value();

  res.json(students);
});

module.exports = router;
