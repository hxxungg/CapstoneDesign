const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../database');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8자리 16진수 대문자
}

// ai_mode(프론트) → ai_permission(DB)
function toDbAiPermission(aiMode) {
  if (aiMode === 'disallowed') return 'denied';
  return aiMode; // 'allowed', 'conditional'
}

// ai_permission(DB) → ai_mode(프론트)
function toFrontendAiMode(aiPermission) {
  if (aiPermission === 'denied') return 'disallowed';
  return aiPermission;
}

// 교사 본인의 class invite_code 조회 (학생 회원가입용)
router.get('/invite-codes', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT invite_code FROM teacher_db.teachers WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '교사 정보를 찾을 수 없습니다.' });
    }
    res.json({ invite_code: rows[0].invite_code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// req.user.id(users.id) → teachers.id 조회 헬퍼
async function getTeacherId(userId) {
  const [rows] = await pool.query(
    'SELECT id FROM teacher_db.teachers WHERE user_id = ?',
    [userId]
  );
  if (rows.length === 0) throw Object.assign(new Error('교사 정보를 찾을 수 없습니다.'), { status: 404 });
  return rows[0].id;
}

// 교사 수행평가 목록 조회
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = await getTeacherId(req.user.id);
    const [assessments] = await pool.query(
      'SELECT * FROM teacher_db.assessments WHERE teacher_id = ? ORDER BY created_at DESC',
      [teacherId]
    );

    const result = await Promise.all(assessments.map(async (a) => {
      const [[{ stepCount }]] = await pool.query(
        'SELECT COUNT(*) as stepCount FROM teacher_db.assessment_steps WHERE assessment_id = ?',
        [a.id]
      );
      return { ...a, step_count: stepCount };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 수행평가 상세 조회 (steps 포함)
router.get('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const assessmentId = parseInt(req.params.id, 10);
  if (isNaN(assessmentId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  try {
    const teacherId = await getTeacherId(req.user.id);
    const [rows] = await pool.query(
      'SELECT * FROM teacher_db.assessments WHERE id = ? AND teacher_id = ?',
      [assessmentId, teacherId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

    const [steps] = await pool.query(
      'SELECT * FROM teacher_db.assessment_steps WHERE assessment_id = ? ORDER BY step_order',
      [assessmentId]
    );

    res.json({
      ...rows[0],
      steps: steps.map(s => ({ ...s, ai_mode: toFrontendAiMode(s.ai_permission) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 수행평가 생성 (assessment + assessment_steps)
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  const { title, description, steps } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: '수행평가 제목을 입력해주세요.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // users.id → teachers.id 변환
    const [teacherRows] = await conn.query(
      'SELECT id FROM teacher_db.teachers WHERE user_id = ?',
      [req.user.id]
    );
    if (teacherRows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: '교사 정보를 찾을 수 없습니다.' });
    }
    const teacherId = teacherRows[0].id;

    // 고유 invite_code 생성
    let inviteCode;
    for (let i = 0; i < 10; i++) {
      inviteCode = generateInviteCode();
      const [dup] = await conn.query(
        'SELECT id FROM teacher_db.assessments WHERE invite_code = ?',
        [inviteCode]
      );
      if (dup.length === 0) break;
    }

    const [result] = await conn.query(
      'INSERT INTO teacher_db.assessments (teacher_id, title, description, status, invite_code) VALUES (?, ?, ?, ?, ?)',
      [teacherId, title.trim(), description?.trim() || null, 'active', inviteCode]
    );
    const assessmentId = result.insertId;

    // 단계 저장
    if (Array.isArray(steps) && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await conn.query(
          `INSERT INTO teacher_db.assessment_steps
             (assessment_id, step_order, title, description, ai_permission, is_locked)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            assessmentId,
            i + 1,
            step.title?.trim() || `단계 ${i + 1}`,
            step.description?.trim() || null,
            toDbAiPermission(step.ai_mode || 'disallowed'),
            1,
          ]
        );
      }
    }

    await conn.commit();

    const [newRows] = await conn.query(
      'SELECT * FROM teacher_db.assessments WHERE id = ?',
      [assessmentId]
    );
    const [newSteps] = await conn.query(
      'SELECT * FROM teacher_db.assessment_steps WHERE assessment_id = ? ORDER BY step_order',
      [assessmentId]
    );

    res.status(201).json({
      ...newRows[0],
      step_count: newSteps.length,
      steps: newSteps.map(s => ({ ...s, ai_mode: toFrontendAiMode(s.ai_permission) })),
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 단계(step) 삭제
router.delete('/:id/steps/:stepId', authenticateToken, requireTeacher, async (req, res) => {
  const assessmentId = parseInt(req.params.id, 10);
  const stepId = parseInt(req.params.stepId, 10);
  if (isNaN(assessmentId) || isNaN(stepId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  try {
    const teacherId = await getTeacherId(req.user.id);
    const [aRows] = await pool.query(
      'SELECT id FROM teacher_db.assessments WHERE id = ? AND teacher_id = ?',
      [assessmentId, teacherId]
    );
    if (aRows.length === 0) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

    await pool.query(
      'DELETE FROM teacher_db.assessment_steps WHERE id = ? AND assessment_id = ?',
      [stepId, assessmentId]
    );

    res.json({ message: '단계가 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 수행평가 삭제 (steps 연쇄 삭제)
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const assessmentId = parseInt(req.params.id, 10);
  if (isNaN(assessmentId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  try {
    const teacherId = await getTeacherId(req.user.id);
    const [rows] = await pool.query(
      'SELECT id FROM teacher_db.assessments WHERE id = ? AND teacher_id = ?',
      [assessmentId, teacherId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

    await pool.query('DELETE FROM teacher_db.assessment_steps WHERE assessment_id = ?', [assessmentId]);
    await pool.query('DELETE FROM teacher_db.assessments WHERE id = ?', [assessmentId]);

    res.json({ message: '수행평가가 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
