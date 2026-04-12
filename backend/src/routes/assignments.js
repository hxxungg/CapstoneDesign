const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, nextId } = require('../database');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

// 수행평가 목록 조회
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();

  if (req.user.role === 'teacher') {
    const assignments = db.get('assignments').filter({ teacher_id: req.user.id }).value().map(a => {
      const stageCount = db.get('stages').filter({ assignment_id: a.id }).size().value();
      const studentCount = db.get('student_assignments').filter({ assignment_id: a.id }).size().value();
      return { ...a, stage_count: stageCount, student_count: studentCount };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json(assignments);
  }

  // 학생: 수강 중인 수행평가 목록
  const studentAssignments = db.get('student_assignments').filter({ student_id: req.user.id }).value();
  const assignments = studentAssignments.map(sa => {
    const assignment = db.get('assignments').find({ id: sa.assignment_id, is_active: true }).value();
    if (!assignment) return null;
    const teacher = db.get('users').find({ id: assignment.teacher_id }).value();
    const stageCount = db.get('stages').filter({ assignment_id: assignment.id }).size().value();
    return {
      ...assignment,
      current_stage_order: sa.current_stage_order,
      status: sa.status,
      started_at: sa.started_at,
      teacher_name: teacher?.name || '',
      stage_count: stageCount,
    };
  }).filter(Boolean).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

  res.json(assignments);
});

// 수행평가 상세 조회
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const assignmentId = parseInt(req.params.id);
  const assignment = db.get('assignments').find({ id: assignmentId }).value();

  if (!assignment) {
    return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
  }

  const teacher = db.get('users').find({ id: assignment.teacher_id }).value();
  const stages = db.get('stages')
    .filter({ assignment_id: assignmentId })
    .value()
    .sort((a, b) => a.order_num - b.order_num);

  let studentProgress = null;
  if (req.user.role === 'student') {
    studentProgress = db.get('student_assignments')
      .find({ student_id: req.user.id, assignment_id: assignmentId })
      .value() || null;
  }

  res.json({
    ...assignment,
    teacher_name: teacher?.name || '',
    teacher_email: teacher?.email || '',
    stages,
    studentProgress,
  });
});

// 수행평가 생성 (교사)
router.post('/', authenticateToken, requireTeacher, (req, res) => {
  const { title, description, subject } = req.body;

  if (!title) {
    return res.status(400).json({ error: '수행평가 제목을 입력해주세요.' });
  }

  const db = getDb();
  const assignmentCode = `ASN${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const id = nextId('assignments');

  const newAssignment = {
    id,
    title,
    description: description || null,
    subject: subject || null,
    teacher_id: req.user.id,
    is_active: true,
    assignment_code: assignmentCode,
    created_at: new Date().toISOString(),
  };

  db.get('assignments').push(newAssignment).write();
  res.status(201).json(newAssignment);
});

// 수행평가 수정 (교사)
router.put('/:id', authenticateToken, requireTeacher, (req, res) => {
  const { title, description, subject, is_active } = req.body;
  const db = getDb();
  const assignmentId = parseInt(req.params.id);

  const assignment = db.get('assignments').find({ id: assignmentId, teacher_id: req.user.id }).value();
  if (!assignment) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (subject !== undefined) updates.subject = subject;
  if (is_active !== undefined) updates.is_active = Boolean(is_active);

  db.get('assignments').find({ id: assignmentId }).assign(updates).write();

  const updated = db.get('assignments').find({ id: assignmentId }).value();
  res.json(updated);
});

// 수행평가 삭제 (교사)
router.delete('/:id', authenticateToken, requireTeacher, (req, res) => {
  const db = getDb();
  const assignmentId = parseInt(req.params.id);

  const assignment = db.get('assignments').find({ id: assignmentId, teacher_id: req.user.id }).value();
  if (!assignment) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

  db.get('assignments').remove({ id: assignmentId }).write();
  db.get('stages').remove({ assignment_id: assignmentId }).write();
  db.get('student_assignments').remove({ assignment_id: assignmentId }).write();

  res.json({ message: '수행평가가 삭제되었습니다.' });
});

// 수행평가 참여 (학생 - 코드로 등록)
router.post('/enroll', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 수행평가에 참여할 수 있습니다.' });
  }

  const { assignment_code } = req.body;
  if (!assignment_code) {
    return res.status(400).json({ error: '수행평가 코드를 입력해주세요.' });
  }

  const db = getDb();
  const assignment = db.get('assignments').find({ assignment_code: assignment_code.toUpperCase(), is_active: true }).value();
  if (!assignment) {
    return res.status(404).json({ error: '유효하지 않은 수행평가 코드입니다.' });
  }

  const existing = db.get('student_assignments')
    .find({ student_id: req.user.id, assignment_id: assignment.id })
    .value();
  if (existing) {
    return res.status(409).json({ error: '이미 참여 중인 수행평가입니다.' });
  }

  const id = nextId('student_assignments');
  db.get('student_assignments').push({
    id,
    student_id: req.user.id,
    assignment_id: assignment.id,
    current_stage_order: 1,
    status: 'in_progress',
    started_at: new Date().toISOString(),
    completed_at: null,
  }).write();

  res.status(201).json({ message: '수행평가에 참여했습니다.', assignment });
});

// 학생 단계 진행 업데이트
router.put('/:id/progress', authenticateToken, (req, res) => {
  const { next_stage_order, student_id } = req.body;
  const db = getDb();
  const assignmentId = parseInt(req.params.id);

  const targetStudentId = req.user.role === 'teacher' ? student_id : req.user.id;

  const progress = db.get('student_assignments')
    .find({ student_id: targetStudentId, assignment_id: assignmentId })
    .value();
  if (!progress) return res.status(404).json({ error: '참여 정보를 찾을 수 없습니다.' });

  const stageCount = db.get('stages').filter({ assignment_id: assignmentId }).size().value();

  if (next_stage_order > stageCount) {
    db.get('student_assignments')
      .find({ student_id: targetStudentId, assignment_id: assignmentId })
      .assign({ status: 'completed', completed_at: new Date().toISOString() })
      .write();
    return res.json({ message: '수행평가를 완료했습니다.', status: 'completed' });
  }

  db.get('student_assignments')
    .find({ student_id: targetStudentId, assignment_id: assignmentId })
    .assign({ current_stage_order: next_stage_order })
    .write();

  res.json({ message: '단계가 업데이트되었습니다.', current_stage_order: next_stage_order });
});

// 수행평가에 참여한 학생 목록 (교사)
router.get('/:id/students', authenticateToken, requireTeacher, (req, res) => {
  const db = getDb();
  const assignmentId = parseInt(req.params.id);

  const assignment = db.get('assignments').find({ id: assignmentId, teacher_id: req.user.id }).value();
  if (!assignment) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

  const studentAssignments = db.get('student_assignments').filter({ assignment_id: assignmentId }).value();
  const stages = db.get('stages').filter({ assignment_id: assignmentId }).value();

  const students = studentAssignments.map(sa => {
    const user = db.get('users').find({ id: sa.student_id }).value();
    const logCount = db.get('ai_logs').filter({ student_id: sa.student_id, assignment_id: assignmentId }).size().value();
    const exitAttempts = db.get('exit_attempts').filter({ student_id: sa.student_id, assignment_id: assignmentId }).size().value();
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      current_stage_order: sa.current_stage_order,
      status: sa.status,
      started_at: sa.started_at,
      completed_at: sa.completed_at,
      log_count: logCount,
      exit_attempts: exitAttempts,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  res.json(students);
});

module.exports = router;
