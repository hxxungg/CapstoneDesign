const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// 회원가입
router.post('/register', async (req, res) => {
  const { email, name, password, role, school, subject, grade, class_num } = req.body;

  if (!email || !name || !password || !role) {
    return res.status(400).json({ error: '필수 정보를 입력해주세요.' });
  }
  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: '역할은 teacher 또는 student여야 합니다.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT id FROM capstonedesign.users WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
    }

    // users 테이블에 기본 정보 저장
    const [userResult] = await conn.query(
      'INSERT INTO capstonedesign.users (email, name, role) VALUES (?, ?, ?)',
      [email, name, role]
    );
    const userId = userResult.insertId;

    // 비밀번호 저장
    const passwordHash = await bcrypt.hash(password, 10);
    await conn.query(
      'INSERT INTO capstonedesign.user_credentials (user_id, password_hash) VALUES (?, ?)',
      [userId, passwordHash]
    );

    // 역할별 추가 정보 저장
    if (role === 'teacher') {
      await conn.query(
        'INSERT INTO teacher_db.teachers (user_id, school, subject) VALUES (?, ?, ?)',
        [userId, school || null, subject || null]
      );
    } else {
      await conn.query(
        'INSERT INTO student_db.students (user_id, school, grade, class_num) VALUES (?, ?, ?, ?)',
        [userId, school || null, grade || null, class_num || null]
      );
    }

    await conn.commit();

    const token = jwt.sign(
      { id: userId, name, email, role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: userId, name, email, role } });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 로그인
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, uc.password_hash
       FROM capstonedesign.users u
       JOIN capstonedesign.user_credentials uc ON uc.user_id = u.id
       WHERE u.email = ?`,
      [email]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: '비활성화된 계정입니다.' });
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 내 정보 조회
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM capstonedesign.users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
