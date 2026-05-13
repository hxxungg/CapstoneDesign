const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  const { name, email, password, role, teacher_code } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: '필수 정보를 입력해주세요.' });
  }
  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: '역할은 teacher 또는 student여야 합니다.' });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id FROM capstonedesign.users WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
    }

    let code = null;

    if (role === 'student') {
      if (!teacher_code) {
        return res.status(400).json({ error: '학생은 교사 코드가 필요합니다.' });
      }
      const [teacher] = await pool.query(
        "SELECT id FROM capstonedesign.users WHERE teacher_code = ? AND role = 'teacher'",
        [teacher_code]
      );
      if (teacher.length === 0) {
        return res.status(400).json({ error: '유효하지 않은 교사 코드입니다.' });
      }
      code = teacher_code;
    }

    if (role === 'teacher') {
      code = `TCH${Date.now().toString().slice(-6)}`;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO capstonedesign.users (name, email, password, role, teacher_code) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, code]
    );
    const id = result.insertId;

    const token = jwt.sign(
      { id, name, email, role, teacher_code: code },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id, name, email, role, teacher_code: code } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM capstonedesign.users WHERE email = ?',
      [email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, teacher_code, created_at FROM capstonedesign.users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/students', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '교사 권한이 필요합니다.' });
  }

  try {
    const [students] = await pool.query(
      "SELECT id, name, email, role, teacher_code, created_at FROM capstonedesign.users WHERE teacher_code = ? AND role = 'student'",
      [req.user.teacher_code]
    );
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
