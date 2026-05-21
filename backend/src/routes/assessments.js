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

// 학생: 내 참여 목록 조회 — /:id 보다 반드시 먼저 등록
router.get('/my-participations', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생 전용 API입니다.' });
  }

  try {
    const [sRows] = await pool.query(
      'SELECT id FROM student_db.students WHERE user_id = ?',
      [req.user.id]
    );
    if (sRows.length === 0) return res.json([]);

    const [rows] = await pool.query(
      `SELECT p.*, a.title AS assessment_title, a.description AS assessment_description,
              a.invite_code, a.status AS assessment_status,
              (SELECT COUNT(*) FROM teacher_db.assessment_steps WHERE assessment_id = a.id) AS total_steps
       FROM student_db.participations p
       JOIN teacher_db.assessments a ON p.assessment_id = a.id
       WHERE p.student_id = ?
       ORDER BY p.created_at DESC`,
      [sRows[0].id]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 학생: 참여 상세 조회 (단계 목록 포함) — /:id 보다 반드시 먼저 등록
router.get('/participation/:participationId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생 전용 API입니다.' });
  }

  const participationId = parseInt(req.params.participationId, 10);
  if (isNaN(participationId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  try {
    // 본인 참여인지 확인
    const [sRows] = await pool.query(
      'SELECT id FROM student_db.students WHERE user_id = ?',
      [req.user.id]
    );
    if (sRows.length === 0) return res.status(404).json({ error: '학생 정보를 찾을 수 없습니다.' });

    const [pRows] = await pool.query(
      `SELECT p.*, a.title AS assessment_title, a.description AS assessment_description,
              a.invite_code
       FROM student_db.participations p
       JOIN teacher_db.assessments a ON p.assessment_id = a.id
       WHERE p.id = ? AND p.student_id = ?`,
      [participationId, sRows[0].id]
    );
    if (pRows.length === 0) return res.status(404).json({ error: '참여 정보를 찾을 수 없습니다.' });

    const participation = pRows[0];

    const [steps] = await pool.query(
      'SELECT * FROM teacher_db.assessment_steps WHERE assessment_id = ? ORDER BY step_order',
      [participation.assessment_id]
    );

    res.json({
      participation_id: participation.id,
      assessment_id: participation.assessment_id,
      title: participation.assessment_title,
      description: participation.assessment_description,
      invite_code: participation.invite_code,
      status: participation.status,
      current_step: participation.current_step,
      steps: steps.map(s => ({ ...s, ai_mode: toFrontendAiMode(s.ai_permission) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 학생: invite_code로 수행평가 참여 — /:id 보다 반드시 먼저 등록
router.post('/join', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 수행평가에 참여할 수 있습니다.' });
  }

  const { invite_code } = req.body;
  if (!invite_code?.trim()) {
    return res.status(400).json({ error: '초대 코드를 입력해주세요.' });
  }

  try {
    const [aRows] = await pool.query(
      "SELECT * FROM teacher_db.assessments WHERE invite_code = ? AND status = 'active'",
      [invite_code.trim().toUpperCase()]
    );
    if (aRows.length === 0) {
      return res.status(404).json({ error: '유효하지 않은 초대 코드입니다.' });
    }
    const assessment = aRows[0];

    const [sRows] = await pool.query(
      'SELECT id FROM student_db.students WHERE user_id = ?',
      [req.user.id]
    );
    if (sRows.length === 0) {
      return res.status(404).json({ error: '학생 정보를 찾을 수 없습니다.' });
    }
    const studentId = sRows[0].id;

    const [existing] = await pool.query(
      'SELECT id, status FROM student_db.participations WHERE assessment_id = ? AND student_id = ?',
      [assessment.id, studentId]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        error: '이미 참여 중인 수행평가입니다.',
        participation_id: existing[0].id,
      });
    }

    const [result] = await pool.query(
      `INSERT INTO student_db.participations
        (assessment_id, student_id, consent_given, consent_at, current_step, status)
       VALUES (?, ?, 1, NOW(), 1, 'in_progress')`,
      [assessment.id, studentId]
    );

    const [steps] = await pool.query(
      'SELECT * FROM teacher_db.assessment_steps WHERE assessment_id = ? ORDER BY step_order',
      [assessment.id]
    );

    res.status(201).json({
      participation_id: result.insertId,
      assessment: {
        ...assessment,
        steps: steps.map(s => ({ ...s, ai_mode: toFrontendAiMode(s.ai_permission) })),
      },
      message: `"${assessment.title}" 수행평가에 참여했습니다.`,
    });
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

// 학생: 이전 단계 제출 내용 조회
router.get('/participation/:participationId/submissions', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생 전용 API입니다.' });
  }

  const participationId = parseInt(req.params.participationId, 10);
  if (isNaN(participationId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  try {
    const [sRows] = await pool.query(
      'SELECT id FROM student_db.students WHERE user_id = ?',
      [req.user.id]
    );
    if (sRows.length === 0) return res.status(404).json({ error: '학생 정보를 찾을 수 없습니다.' });

    const [pRows] = await pool.query(
      'SELECT id FROM student_db.participations WHERE id = ? AND student_id = ?',
      [participationId, sRows[0].id]
    );
    if (pRows.length === 0) return res.status(403).json({ error: '권한이 없습니다.' });

    // 단계별 최신 제출 1건씩만 반환 (중복 제출 시 최신 우선)
    const [rows] = await pool.query(
      `SELECT s.id, s.step_id, s.content, s.submitted_at,
              st.title AS step_title, st.step_order
       FROM log_db.submissions s
       LEFT JOIN teacher_db.assessment_steps st ON s.step_id = st.id
       WHERE s.participation_id = ?
         AND s.id = (
           SELECT id FROM log_db.submissions s2
           WHERE s2.participation_id = s.participation_id
             AND s2.step_id = s.step_id
           ORDER BY s2.submitted_at DESC
           LIMIT 1
         )
       ORDER BY st.step_order ASC`,
      [participationId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 학생: 단계 제출 + 다음 단계로 진행
// POST /assessments/participation/:participationId/submit
router.post('/participation/:participationId/submit', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생 전용 API입니다.' });
  }

  const participationId = parseInt(req.params.participationId, 10);
  if (isNaN(participationId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  const { step_id, content } = req.body;

  try {
    // 본인 참여인지 확인
    const [sRows] = await pool.query(
      'SELECT id FROM student_db.students WHERE user_id = ?',
      [req.user.id]
    );
    if (sRows.length === 0) return res.status(404).json({ error: '학생 정보를 찾을 수 없습니다.' });

    const [pRows] = await pool.query(
      `SELECT p.*, a.id AS assessment_id
       FROM student_db.participations p
       JOIN teacher_db.assessments a ON p.assessment_id = a.id
       WHERE p.id = ? AND p.student_id = ?`,
      [participationId, sRows[0].id]
    );
    if (pRows.length === 0) return res.status(404).json({ error: '참여 정보를 찾을 수 없습니다.' });

    const participation = pRows[0];

    // 전체 단계 수 조회
    const [[{ totalSteps }]] = await pool.query(
      'SELECT COUNT(*) AS totalSteps FROM teacher_db.assessment_steps WHERE assessment_id = ?',
      [participation.assessment_id]
    );

    // 제출 내용 저장 (content 있을 때만)
    if (content && content.trim()) {
      const [subResult] = await pool.query(
        `INSERT INTO log_db.submissions (participation_id, step_id, content, submitted_at)
         VALUES (?, ?, ?, NOW())`,
        [participationId, step_id || null, content.trim()]
      );

      // submissions_step: 마침표(.) 기준으로 문장을 분리해 저장
      const submissionId = subResult.insertId;

      const rawText = content.trim();

      // '.' 기준으로 분리 후 마침표를 각 문장 끝에 다시 붙임
      // 예: "안녕하세요. 반갑습니다." → ["안녕하세요.", "반갑습니다."]
      const parts = rawText.split('.');
      const sentences = parts
        .map((part, idx) => {
          const trimmed = part.trim();
          if (!trimmed) return null;
          // 마지막 조각이 아닌 경우 마침표 복원
          return idx < parts.length - 1 ? trimmed + '.' : trimmed;
        })
        .filter(Boolean);

      // 문장이 하나도 추출되지 않았으면 전체 텍스트를 1개 문장으로 저장
      const finalSentences = sentences.length > 0 ? sentences : [rawText];
      const segmentRows = finalSentences.map((s, i) => [submissionId, i + 1, s]);

      if (segmentRows.length > 0) {
        await pool.query(
          `INSERT INTO log_db.submissions_step (submission_id, segment_order, content) VALUES ?`,
          [segmentRows]
        );
      }
    }

    const currentStep = participation.current_step || 1;
    const nextStep = currentStep + 1;
    const isLastStep = currentStep >= totalSteps;

    if (isLastStep) {
      // 마지막 단계 → 전체 제출 완료
      await pool.query(
        `UPDATE student_db.participations
         SET status = 'submitted', updated_at = NOW()
         WHERE id = ?`,
        [participationId]
      );
      return res.json({ status: 'submitted', message: '수행평가를 제출했습니다.' });
    } else {
      // 다음 단계로 진행
      await pool.query(
        `UPDATE student_db.participations
         SET current_step = ?, updated_at = NOW()
         WHERE id = ?`,
        [nextStep, participationId]
      );

      // 다음 단계 정보 반환
      const [nextStepRows] = await pool.query(
        'SELECT * FROM teacher_db.assessment_steps WHERE assessment_id = ? AND step_order = ?',
        [participation.assessment_id, nextStep]
      );

      return res.json({
        status: 'in_progress',
        next_step: nextStep,
        total_steps: totalSteps,
        next_step_info: nextStepRows[0]
          ? { ...nextStepRows[0], ai_mode: toFrontendAiMode(nextStepRows[0].ai_permission) }
          : null,
        message: `${nextStep}단계로 이동했습니다.`,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
