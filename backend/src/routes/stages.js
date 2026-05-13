const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const { normalizeAiModeFromBody, resolveAiMode, normalizeStage } = require('../stageNormalize');

router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  const { assignment_id, title, description, ai_guidance } = req.body;

  if (!assignment_id || !title) {
    return res.status(400).json({ error: 'assignment_id와 title은 필수입니다.' });
  }

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [parseInt(assignment_id)]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    }

    const [[{ maxOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(order_num), 0) as maxOrder FROM teacher_db.stages WHERE assignment_id = ?',
      [parseInt(assignment_id)]
    );

    const ai_mode = normalizeAiModeFromBody(req.body);
    const ai_allowed = ai_mode !== 'disallowed';

    const [result] = await pool.query(
      `INSERT INTO teacher_db.stages
        (assignment_id, order_num, title, description, ai_mode, ai_allowed, ai_tools, ai_guidance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(assignment_id),
        maxOrder + 1,
        title,
        description || null,
        ai_mode,
        ai_allowed ? 1 : 0,
        JSON.stringify([]),
        ai_allowed ? (ai_guidance || null) : null,
      ]
    );

    const [newRows] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(normalizeStage(newRows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const { title, description, ai_guidance } = req.body;
  const stageId = parseInt(req.params.id);

  try {
    const [sRows] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE id = ?',
      [stageId]
    );
    const stage = sRows[0];
    if (!stage) return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });

    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [stage.assignment_id]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;

    if (req.body.ai_mode !== undefined || req.body.ai_allowed !== undefined) {
      const ai_mode = normalizeAiModeFromBody({ ...stage, ...req.body });
      updates.ai_mode = ai_mode;
      updates.ai_allowed = ai_mode !== 'disallowed' ? 1 : 0;
      if (ai_mode === 'disallowed') {
        updates.ai_tools = JSON.stringify([]);
        updates.ai_guidance = null;
      }
    }

    const modeForFields = updates.ai_mode !== undefined ? updates.ai_mode : resolveAiMode(stage);
    if (ai_guidance !== undefined && modeForFields !== 'disallowed') {
      updates.ai_guidance = ai_guidance;
    }

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await pool.query(
        `UPDATE teacher_db.stages SET ${setClauses} WHERE id = ?`,
        [...Object.values(updates), stageId]
      );
    }

    const [updated] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE id = ?',
      [stageId]
    );
    res.json(normalizeStage(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const stageId = parseInt(req.params.id);

  try {
    const [sRows] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE id = ?',
      [stageId]
    );
    const stage = sRows[0];
    if (!stage) return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });

    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [stage.assignment_id]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const deletedOrder = stage.order_num;
    await pool.query('DELETE FROM teacher_db.stages WHERE id = ?', [stageId]);

    // order_num 재정렬
    await pool.query(
      'UPDATE teacher_db.stages SET order_num = order_num - 1 WHERE assignment_id = ? AND order_num > ?',
      [stage.assignment_id, deletedOrder]
    );

    res.json({ message: '단계가 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.put('/:id/reorder', authenticateToken, requireTeacher, async (req, res) => {
  const { new_order } = req.body;
  const stageId = parseInt(req.params.id);

  try {
    const [sRows] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE id = ?',
      [stageId]
    );
    const stage = sRows[0];
    if (!stage) return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });

    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [stage.assignment_id]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const [[{ stageCount }]] = await pool.query(
      'SELECT COUNT(*) as stageCount FROM teacher_db.stages WHERE assignment_id = ?',
      [stage.assignment_id]
    );

    if (new_order < 1 || new_order > stageCount) {
      return res.status(400).json({ error: '유효하지 않은 순서입니다.' });
    }

    const oldOrder = stage.order_num;
    if (new_order === oldOrder) return res.json({ message: '변경 없음' });

    // 임시값으로 충돌 방지 후 재정렬
    await pool.query(
      'UPDATE teacher_db.stages SET order_num = 0 WHERE id = ?',
      [stageId]
    );

    if (new_order > oldOrder) {
      await pool.query(
        'UPDATE teacher_db.stages SET order_num = order_num - 1 WHERE assignment_id = ? AND order_num > ? AND order_num <= ?',
        [stage.assignment_id, oldOrder, new_order]
      );
    } else {
      await pool.query(
        'UPDATE teacher_db.stages SET order_num = order_num + 1 WHERE assignment_id = ? AND order_num >= ? AND order_num < ?',
        [stage.assignment_id, new_order, oldOrder]
      );
    }

    await pool.query(
      'UPDATE teacher_db.stages SET order_num = ? WHERE id = ?',
      [new_order, stageId]
    );

    const [updated] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE assignment_id = ? ORDER BY order_num',
      [stage.assignment_id]
    );

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
