const jwt = require('jsonwebtoken');
const { isMaster, applyMasterScope } = require('../services/masterScope');

const JWT_SECRET = process.env.JWT_SECRET || 'performance_eval_secret_key_2024';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
    req.user = decoded;
    applyMasterScope(req);
    next();
  });
}

function isTeacherOrMaster(user) {
  return user?.role === 'teacher' || isMaster(user);
}

function isStudentOrMaster(user) {
  return user?.role === 'student' || isMaster(user);
}

function requireTeacher(req, res, next) {
  if (!isTeacherOrMaster(req.user)) {
    return res.status(403).json({ error: '교사 권한이 필요합니다.' });
  }
  next();
}

function requireStudent(req, res, next) {
  if (!isStudentOrMaster(req.user)) {
    return res.status(403).json({ error: '학생 권한이 필요합니다.' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireTeacher,
  requireStudent,
  isMaster,
  isTeacherOrMaster,
  isStudentOrMaster,
  JWT_SECRET,
};
