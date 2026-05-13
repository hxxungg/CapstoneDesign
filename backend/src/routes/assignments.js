const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../database');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const { normalizeStage } = require('../stageNormalize');

router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      const [assignments] = await pool.query(
        'SELECT * FROM teacher_db.assignments WHERE teacher_id = ? ORDER BY created_at DESC',
        [req.user.id]
      );

      const result = await Promise.all(assignments.map(async (a) => {
        const [[{ stageCount }]] = await pool.query(
          'SELECT COUNT(*) as stageCount FROM teacher_db.stages WHERE assignment_id = ?',
          [a.id]
        );
        const [[{ studentCount }]] = await pool.query(
          'SELECT COUNT(*) as studentCount FROM student_db.student_assignments WHERE assignment_id = ?',
          [a.id]
        );
        return { ...a, is_active: !!a.is_active, stage_count: stageCount, student_count: studentCount };
      }));

      return res.json(result);
    }

    // 학생
    const [studentAssignments] = await pool.query(
      'SELECT * FROM student_db.student_assignments WHERE student_id = ?',
      [req.user.id]
    );

    const result = await Promise.all(studentAssignments.map(async (sa) => {
      const [aRows] = await pool.query(
        'SELECT * FROM teacher_db.assignments WHERE id = ? AND is_active = 1',
        [sa.assignment_id]
      );
      const assignment = aRows[0];
      if (!assignment) return null;

      const [teacherRows] = await pool.query(
        'SELECT name FROM capstonedesign.users WHERE id = ?',
        [assignment.teacher_id]
      );
      const [[{ stageCount }]] = await pool.query(
        'SELECT COUNT(*) as stageCount FROM teacher_db.stages WHERE assignment_id = ?',
        [assignment.id]
      );

      return {
        ...assignment,
        is_active: !!assignment.is_active,
        current_stage_order: sa.current_stage_order,
        status: sa.status,
        started_at: sa.started_at,
        teacher_name: teacherRows[0]?.name || '',
        stage_count: stageCount,
      };
    }));

    const filtered = result.filter(Boolean).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  const assignmentId = parseInt(req.params.id);

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [assignmentId]
    );
    const assignment = aRows[0];
    if (!assignment) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

    const [teacherRows] = await pool.query(
      'SELECT name, email FROM capstonedesign.users WHERE id = ?',
      [assignment.teacher_id]
    );

    const [stages] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE assignment_id = ? ORDER BY order_num',
      [assignmentId]
    );

    let studentProgress = null;
    let stageWritings = {};

    if (req.user.role === 'student') {
      const [progressRows] = await pool.query(
        'SELECT * FROM student_db.student_assignments WHERE student_id = ? AND assignment_id = ?',
        [req.user.id, assignmentId]
      );
      studentProgress = progressRows[0] || null;

      const [writings] = await pool.query(
        'SELECT stage_id, content, updated_at FROM student_db.student_stage_writings WHERE student_id = ? AND assignment_id = ?',
        [req.user.id, assignmentId]
      );
      writings.forEach((w) => {
        stageWritings[w.stage_id] = { content: w.content || '', updated_at: w.updated_at };
      });
    }

    const teacher = teacherRows[0] || {};
    res.json({
      ...assignment,
      is_active: !!assignment.is_active,
      teacher_name: teacher.name || '',
      teacher_email: teacher.email || '',
      stages: stages.map(normalizeStage),
      studentProgress,
      ...(req.user.role === 'student' ? { stageWritings } : {}),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  const { title, description, subject } = req.body;

  if (!title) {
    return res.status(400).json({ error: '수행평가 제목을 입력해주세요.' });
  }

  try {
    const assignmentCode = `ASN${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const [result] = await pool.query(
      'INSERT INTO teacher_db.assignments (title, description, subject, teacher_id, is_active, assignment_code) VALUES (?, ?, ?, ?, 1, ?)',
      [title, description || null, subject || null, Number(req.user.id), assignmentCode]
    );

    const [newRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [result.insertId]
    );
    const newAssignment = { ...newRows[0], is_active: !!newRows[0].is_active };
    res.status(201).json(newAssignment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const { title, description, subject, is_active } = req.body;
  const assignmentId = parseInt(req.params.id);

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [assignmentId]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (subject !== undefined) updates.subject = subject;
    if (is_active !== undefined) updates.is_active = Boolean(is_active) ? 1 : 0;

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await pool.query(
        `UPDATE teacher_db.assignments SET ${setClauses} WHERE id = ?`,
        [...Object.values(updates), assignmentId]
      );
    }

    const [updated] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [assignmentId]
    );
    res.json({ ...updated[0], is_active: !!updated[0].is_active });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const assignmentId = parseInt(req.params.id, 10);

  if (Number.isNaN(assignmentId)) {
    return res.status(400).json({ error: '잘못된 수행평가 ID입니다.' });
  }

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [assignmentId]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    }

    await Promise.all([
      pool.query('DELETE FROM teacher_db.assignments WHERE id = ?', [assignmentId]),
      pool.query('DELETE FROM teacher_db.stages WHERE assignment_id = ?', [assignmentId]),
      pool.query('DELETE FROM student_db.student_assignments WHERE assignment_id = ?', [assignmentId]),
      pool.query('DELETE FROM student_db.student_stage_writings WHERE assignment_id = ?', [assignmentId]),
      pool.query('DELETE FROM log_db.activity_logs WHERE assignment_id = ?', [assignmentId]),
      pool.query('DELETE FROM log_db.exit_attempts WHERE assignment_id = ?', [assignmentId]),
    ]);

    res.json({ message: '수행평가가 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/enroll', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 수행평가에 참여할 수 있습니다.' });
  }

  const { assignment_code } = req.body;
  if (!assignment_code) {
    return res.status(400).json({ error: '수행평가 코드를 입력해주세요.' });
  }

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE assignment_code = ? AND is_active = 1',
      [assignment_code.toUpperCase()]
    );
    const assignment = aRows[0];
    if (!assignment) {
      return res.status(404).json({ error: '유효하지 않은 수행평가 코드입니다.' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM student_db.student_assignments WHERE student_id = ? AND assignment_id = ?',
      [req.user.id, assignment.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: '이미 참여 중인 수행평가입니다.' });
    }

    await pool.query(
      'INSERT INTO student_db.student_assignments (student_id, assignment_id, current_stage_order, status) VALUES (?, ?, 1, ?)',
      [req.user.id, assignment.id, 'in_progress']
    );

    res.status(201).json({ message: '수행평가에 참여했습니다.', assignment: { ...assignment, is_active: !!assignment.is_active } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

const MAX_STAGE_WRITING_LEN = 50000;
router.put('/:id/stage-writing', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 작성 내용을 저장할 수 있습니다.' });
  }

  const assignmentId = parseInt(req.params.id, 10);
  const { stage_id, content } = req.body;
  const stageId = parseInt(stage_id, 10);
  const text = typeof content === 'string' ? content : content == null ? '' : String(content);

  if (Number.isNaN(assignmentId) || Number.isNaN(stageId)) {
    return res.status(400).json({ error: '잘못된 요청입니다.' });
  }
  if (text.length > MAX_STAGE_WRITING_LEN) {
    return res.status(400).json({ error: `작성 내용은 ${MAX_STAGE_WRITING_LEN}자 이하로 입력해주세요.` });
  }

  try {
    const [enrolled] = await pool.query(
      'SELECT id FROM student_db.student_assignments WHERE student_id = ? AND assignment_id = ?',
      [req.user.id, assignmentId]
    );
    if (enrolled.length === 0) {
      return res.status(404).json({ error: '참여 정보를 찾을 수 없습니다.' });
    }

    const [stage] = await pool.query(
      'SELECT id FROM teacher_db.stages WHERE id = ? AND assignment_id = ?',
      [stageId, assignmentId]
    );
    if (stage.length === 0) {
      return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });
    }

    await pool.query(
      `INSERT INTO student_db.student_stage_writings (student_id, assignment_id, stage_id, content)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, assignmentId, stageId, text]
    );

    const [[{ updated_at }]] = await pool.query(
      'SELECT updated_at FROM student_db.student_stage_writings WHERE student_id = ? AND assignment_id = ? AND stage_id = ?',
      [req.user.id, assignmentId, stageId]
    );

    res.json({ message: '저장되었습니다.', stage_id: stageId, updated_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.put('/:id/progress', authenticateToken, async (req, res) => {
  const { next_stage_order, student_id } = req.body;
  const assignmentId = parseInt(req.params.id);
  const targetStudentId = req.user.role === 'teacher' ? student_id : req.user.id;

  try {
    const [progressRows] = await pool.query(
      'SELECT * FROM student_db.student_assignments WHERE student_id = ? AND assignment_id = ?',
      [targetStudentId, assignmentId]
    );
    if (progressRows.length === 0) {
      return res.status(404).json({ error: '참여 정보를 찾을 수 없습니다.' });
    }

    const [[{ stageCount }]] = await pool.query(
      'SELECT COUNT(*) as stageCount FROM teacher_db.stages WHERE assignment_id = ?',
      [assignmentId]
    );

    if (next_stage_order > stageCount) {
      await pool.query(
        "UPDATE student_db.student_assignments SET status = 'completed', completed_at = NOW() WHERE student_id = ? AND assignment_id = ?",
        [targetStudentId, assignmentId]
      );
      return res.json({ message: '수행평가를 완료했습니다.', status: 'completed' });
    }

    await pool.query(
      'UPDATE student_db.student_assignments SET current_stage_order = ? WHERE student_id = ? AND assignment_id = ?',
      [next_stage_order, targetStudentId, assignmentId]
    );

    res.json({ message: '단계가 업데이트되었습니다.', current_stage_order: next_stage_order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/:id/students', authenticateToken, requireTeacher, async (req, res) => {
  const assignmentId = parseInt(req.params.id);

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [assignmentId]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    }

    const [studentAssignments] = await pool.query(
      'SELECT * FROM student_db.student_assignments WHERE assignment_id = ?',
      [assignmentId]
    );

    const students = await Promise.all(studentAssignments.map(async (sa) => {
      const [userRows] = await pool.query(
        'SELECT id, name, email FROM capstonedesign.users WHERE id = ?',
        [sa.student_id]
      );
      const user = userRows[0] || {};

      const [[{ logCount }]] = await pool.query(
        'SELECT COUNT(*) as logCount FROM log_db.activity_logs WHERE student_id = ? AND assignment_id = ?',
        [sa.student_id, assignmentId]
      );
      const [[{ exitCount }]] = await pool.query(
        'SELECT COUNT(*) as exitCount FROM log_db.exit_attempts WHERE student_id = ? AND assignment_id = ?',
        [sa.student_id, assignmentId]
      );

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        current_stage_order: sa.current_stage_order,
        status: sa.status,
        started_at: sa.started_at,
        completed_at: sa.completed_at,
        log_count: logCount,
        exit_attempts: exitCount,
      };
    }));

    students.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
