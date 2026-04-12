const express = require('express');
const router = express.Router();
const { getDb, nextId } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// AI 사용 로그 기록 (학생)
router.post('/', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 로그를 기록할 수 있습니다.' });
  }

  const { assignment_id, stage_id, stage_order, action_type, url, page_title, duration_seconds } = req.body;
  if (!assignment_id || !action_type) {
    return res.status(400).json({ error: 'assignment_id와 action_type은 필수입니다.' });
  }

  const db = getDb();
  const enrollment = db.get('student_assignments')
    .find({ student_id: req.user.id, assignment_id: parseInt(assignment_id) })
    .value();
  if (!enrollment) {
    return res.status(403).json({ error: '참여하지 않은 수행평가입니다.' });
  }

  const id = nextId('ai_logs');
  db.get('ai_logs').push({
    id,
    student_id: req.user.id,
    assignment_id: parseInt(assignment_id),
    stage_id: stage_id ? parseInt(stage_id) : null,
    stage_order: stage_order || null,
    action_type,
    url: url || null,
    page_title: page_title || null,
    duration_seconds: duration_seconds || 0,
    created_at: new Date().toISOString(),
  }).write();

  res.status(201).json({ id, message: '로그가 기록되었습니다.' });
});

// 앱 이탈 시도 기록
router.post('/exit-attempt', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 이탈 시도를 기록할 수 있습니다.' });
  }

  const { assignment_id, attempt_type } = req.body;
  const db = getDb();
  const id = nextId('exit_attempts');

  db.get('exit_attempts').push({
    id,
    student_id: req.user.id,
    assignment_id: assignment_id ? parseInt(assignment_id) : null,
    attempt_type: attempt_type || 'unknown',
    created_at: new Date().toISOString(),
  }).write();

  res.status(201).json({ message: '이탈 시도가 기록되었습니다.' });
});

// 특정 학생의 로그 조회 (교사)
router.get('/student/:studentId/assignment/:assignmentId', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '교사 권한이 필요합니다.' });
  }

  const db = getDb();
  const studentId = parseInt(req.params.studentId);
  const assignmentId = parseInt(req.params.assignmentId);

  const assignment = db.get('assignments').find({ id: assignmentId, teacher_id: req.user.id }).value();
  if (!assignment) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

  const stages = db.get('stages').filter({ assignment_id: assignmentId }).value();

  const logs = db.get('ai_logs')
    .filter({ student_id: studentId, assignment_id: assignmentId })
    .value()
    .map(log => {
      const stage = stages.find(s => s.id === log.stage_id);
      return {
        ...log,
        stage_title: stage?.title || null,
        stage_order_num: stage?.order_num || log.stage_order,
        ai_allowed: stage?.ai_allowed || false,
      };
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const exitAttempts = db.get('exit_attempts')
    .filter({ student_id: studentId, assignment_id: assignmentId })
    .value()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const student = db.get('users').find({ id: studentId }).value();
  const { password: _, ...safeStudent } = student || {};

  const progress = db.get('student_assignments')
    .find({ student_id: studentId, assignment_id: assignmentId })
    .value();

  res.json({ student: safeStudent, assignment, progress, logs, exitAttempts });
});

module.exports = router;
