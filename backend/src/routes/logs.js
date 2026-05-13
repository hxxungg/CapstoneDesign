const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 로그를 기록할 수 있습니다.' });
  }

  const { assignment_id, stage_id, stage_order, action_type, url, page_title, duration_seconds } = req.body;
  if (!assignment_id || !action_type) {
    return res.status(400).json({ error: 'assignment_id와 action_type은 필수입니다.' });
  }

  try {
    const [enrolled] = await pool.query(
      'SELECT id FROM student_db.student_assignments WHERE student_id = ? AND assignment_id = ?',
      [req.user.id, parseInt(assignment_id)]
    );
    if (enrolled.length === 0) {
      return res.status(403).json({ error: '참여하지 않은 수행평가입니다.' });
    }

    const [result] = await pool.query(
      `INSERT INTO log_db.activity_logs
        (student_id, assignment_id, stage_id, stage_order, action_type, url, page_title, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        parseInt(assignment_id),
        stage_id ? parseInt(stage_id) : null,
        stage_order || null,
        action_type,
        url || null,
        page_title || null,
        duration_seconds || 0,
      ]
    );

    res.status(201).json({ id: result.insertId, message: '로그가 기록되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/exit-attempt', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 이탈 시도를 기록할 수 있습니다.' });
  }

  const { assignment_id, attempt_type } = req.body;

  try {
    const [result] = await pool.query(
      'INSERT INTO log_db.exit_attempts (student_id, assignment_id, attempt_type) VALUES (?, ?, ?)',
      [
        req.user.id,
        assignment_id ? parseInt(assignment_id) : null,
        attempt_type || 'unknown',
      ]
    );

    res.status(201).json({ message: '이탈 시도가 기록되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/student/:studentId/assignment/:assignmentId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '교사 권한이 필요합니다.' });
  }

  const studentId = parseInt(req.params.studentId);
  const assignmentId = parseInt(req.params.assignmentId);

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ? AND teacher_id = ?',
      [assignmentId, req.user.id]
    );
    if (aRows.length === 0) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    const assignment = aRows[0];

    const [stages] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE assignment_id = ?',
      [assignmentId]
    );

    const [logsRaw] = await pool.query(
      'SELECT * FROM log_db.activity_logs WHERE student_id = ? AND assignment_id = ? ORDER BY created_at',
      [studentId, assignmentId]
    );
    const logs = logsRaw.map(log => {
      const stage = stages.find(s => s.id === log.stage_id);
      return {
        ...log,
        stage_title: stage?.title || null,
        stage_order_num: stage?.order_num || log.stage_order,
        ai_allowed: stage ? !!stage.ai_allowed : false,
      };
    });

    const [exitAttempts] = await pool.query(
      'SELECT * FROM log_db.exit_attempts WHERE student_id = ? AND assignment_id = ? ORDER BY created_at',
      [studentId, assignmentId]
    );

    const [userRows] = await pool.query(
      'SELECT id, name, email, role, teacher_code, created_at FROM capstonedesign.users WHERE id = ?',
      [studentId]
    );

    const [progressRows] = await pool.query(
      'SELECT * FROM student_db.student_assignments WHERE student_id = ? AND assignment_id = ?',
      [studentId, assignmentId]
    );

    res.json({
      student: userRows[0] || {},
      assignment: { ...assignment, is_active: !!assignment.is_active },
      progress: progressRows[0] || null,
      logs,
      exitAttempts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
