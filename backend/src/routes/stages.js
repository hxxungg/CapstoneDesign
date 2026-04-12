const express = require('express');
const router = express.Router();
const { getDb, nextId } = require('../database');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const { normalizeAiModeFromBody, resolveAiMode, normalizeStage } = require('../stageNormalize');

// 단계 생성 (교사)
router.post('/', authenticateToken, requireTeacher, (req, res) => {
  const { assignment_id, title, description, ai_guidance } = req.body;

  if (!assignment_id || !title) {
    return res.status(400).json({ error: 'assignment_id와 title은 필수입니다.' });
  }

  const db = getDb();
  const assignment = db.get('assignments').find({ id: parseInt(assignment_id) }).value();
  if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
    return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
  }

  const maxOrder = db.get('stages').filter({ assignment_id: parseInt(assignment_id) }).value()
    .reduce((max, s) => Math.max(max, s.order_num), 0);

  const ai_mode = normalizeAiModeFromBody(req.body);
  const ai_allowed = ai_mode !== 'disallowed';

  const id = nextId('stages');
  const newStage = {
    id,
    assignment_id: parseInt(assignment_id),
    order_num: maxOrder + 1,
    title,
    description: description || null,
    ai_mode,
    ai_allowed,
    ai_tools: [],
    ai_guidance: ai_allowed ? (ai_guidance || null) : null,
    created_at: new Date().toISOString(),
  };

  db.get('stages').push(newStage).write();
  res.status(201).json(normalizeStage(newStage));
});

// 단계 수정 (교사)
router.put('/:id', authenticateToken, requireTeacher, (req, res) => {
  const { title, description, ai_guidance } = req.body;
  const db = getDb();
  const stageId = parseInt(req.params.id);

  const stage = db.get('stages').find({ id: stageId }).value();
  if (!stage) return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });

  const assignment = db.get('assignments').find({ id: stage.assignment_id }).value();
  if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (req.body.ai_mode !== undefined || req.body.ai_allowed !== undefined) {
    const ai_mode = normalizeAiModeFromBody({ ...stage, ...req.body });
    updates.ai_mode = ai_mode;
    updates.ai_allowed = ai_mode !== 'disallowed';
    if (ai_mode === 'disallowed') {
      updates.ai_tools = [];
      updates.ai_guidance = null;
    }
  }
  const modeForFields = updates.ai_mode !== undefined ? updates.ai_mode : resolveAiMode(stage);
  if (ai_guidance !== undefined && modeForFields !== 'disallowed') updates.ai_guidance = ai_guidance;

  db.get('stages').find({ id: stageId }).assign(updates).write();

  const updated = db.get('stages').find({ id: stageId }).value();
  res.json(normalizeStage(updated));
});

// 단계 삭제 (교사)
router.delete('/:id', authenticateToken, requireTeacher, (req, res) => {
  const db = getDb();
  const stageId = parseInt(req.params.id);

  const stage = db.get('stages').find({ id: stageId }).value();
  if (!stage) return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });

  const assignment = db.get('assignments').find({ id: stage.assignment_id }).value();
  if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  const deletedOrder = stage.order_num;
  db.get('stages').remove({ id: stageId }).write();

  // order_num 재정렬
  const remaining = db.get('stages').filter({ assignment_id: stage.assignment_id }).value()
    .sort((a, b) => a.order_num - b.order_num);

  remaining.forEach((s, idx) => {
    if (s.order_num !== idx + 1) {
      db.get('stages').find({ id: s.id }).assign({ order_num: idx + 1 }).write();
    }
  });

  res.json({ message: '단계가 삭제되었습니다.' });
});

// 단계 순서 변경 (교사)
router.put('/:id/reorder', authenticateToken, requireTeacher, (req, res) => {
  const { new_order } = req.body;
  const db = getDb();
  const stageId = parseInt(req.params.id);

  const stage = db.get('stages').find({ id: stageId }).value();
  if (!stage) return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });

  const assignment = db.get('assignments').find({ id: stage.assignment_id }).value();
  if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  const allStages = db.get('stages').filter({ assignment_id: stage.assignment_id }).value()
    .sort((a, b) => a.order_num - b.order_num);

  const stageCount = allStages.length;
  if (new_order < 1 || new_order > stageCount) {
    return res.status(400).json({ error: '유효하지 않은 순서입니다.' });
  }

  const oldOrder = stage.order_num;
  if (new_order === oldOrder) return res.json({ message: '변경 없음' });

  // 다른 단계들의 order_num 조정
  allStages.forEach(s => {
    if (s.id === stageId) return;
    let newNum = s.order_num;
    if (new_order > oldOrder) {
      if (s.order_num > oldOrder && s.order_num <= new_order) newNum = s.order_num - 1;
    } else {
      if (s.order_num >= new_order && s.order_num < oldOrder) newNum = s.order_num + 1;
    }
    if (newNum !== s.order_num) {
      db.get('stages').find({ id: s.id }).assign({ order_num: newNum }).write();
    }
  });

  db.get('stages').find({ id: stageId }).assign({ order_num: new_order }).write();

  const updated = db.get('stages').filter({ assignment_id: stage.assignment_id }).value()
    .sort((a, b) => a.order_num - b.order_num);

  res.json(updated);
});

module.exports = router;
