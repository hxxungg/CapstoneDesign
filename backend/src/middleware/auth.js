const jwt = require('jsonwebtoken');
const { getDb } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'performance_eval_secret_key_2024';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    next();
  });
}

function requireTeacher(req, res, next) {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '교사 권한이 필요합니다.' });
  }
  next();
}

function requireStudent(req, res, next) {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생 권한이 필요합니다.' });
  }
  next();
}

module.exports = { authenticateToken, requireTeacher, requireStudent, JWT_SECRET };
