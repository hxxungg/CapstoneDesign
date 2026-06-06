const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../database');
const { authenticateToken, requireTeacher, isMaster } = require('../middleware/auth');
const {
  buildStepScoringPlan,
} = require('../utils/rubricScoring');
const {
  callScoreStep,
  saveStepComplianceScore,
} = require('../services/stepComplianceScoring');
const { deleteAssessmentCascade } = require('../services/assessmentCleanup');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001';

function parseRubricJson(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function serializeRubricJson(rubric) {
  if (rubric == null) return null;
  if (typeof rubric !== 'object') return null;
  return JSON.stringify(rubric);
}

function formatAssessmentResponse(row) {
  if (!row) return row;
  const { rubric_json, ...rest } = row;
  return { ...rest, rubric: parseRubricJson(rubric_json) };
}

function stripRubricJsonColumn(row) {
  if (!row) return row;
  const { rubric_json, ...rest } = row;
  return rest;
}

// similarity_percent → originality enum 변환
function toOriginality(pct) {
  if (pct >= 70) return 'red';
  if (pct >= 40) return 'yellow';
  return 'green';
}

// deadline이 지난 assessments를 자동으로 closed 처리
async function autoCloseExpiredAssessments(assessmentIds) {
  if (!assessmentIds?.length) return;
  await pool.query(
    `UPDATE teacher_db.assessments
     SET status = 'closed'
     WHERE id IN (?) AND status = 'active' AND deadline IS NOT NULL AND deadline < NOW()`,
    [assessmentIds]
  );
}

// 유사도 분석 큐 — Flask 서버에 동시 요청이 쌓이지 않도록 1개씩 순차 처리
const _simQueue = [];
let _simRunning = false;

function enqueueSimilarityAnalysis(content, submissionId, participationId, stepId) {
  _simQueue.push({ content, submissionId, participationId, stepId });
  console.log(`[유사도 큐] 추가 submission=${submissionId} (대기 ${_simQueue.length}개)`);
  _drainSimQueue();
}

function _drainSimQueue() {
  if (_simRunning || _simQueue.length === 0) return;
  _simRunning = true;
  const job = _simQueue.shift();
  runSimilarityAnalysis(job.content, job.submissionId, job.participationId, job.stepId)
    .finally(() => {
      _simRunning = false;
      _drainSimQueue();
    });
}

// 유사도 분석 — 비동기 fire-and-forget (실패해도 제출에는 영향 없음)
async function runSimilarityAnalysis(content, submissionId, participationId, stepId) {
  const t0 = Date.now();
  console.log(`[유사도] 시작 — submission=${submissionId} participation=${participationId} step=${stepId}`);
  try {
    // 현재 단계 + 이전 모든 단계의 AI 응답 로그 조회
    // step_id의 step_order를 구한 뒤 그 이하의 모든 step AI 로그를 가져옴
    let aiLogs;
    if (stepId) {
      // 현재 step의 step_order 조회
      const [[currentStep]] = await pool.query(
        `SELECT step_order FROM teacher_db.assessment_steps WHERE id = ?`,
        [stepId]
      );
      if (currentStep) {
        // 현재 단계 이하의 모든 단계 id 목록
        const [prevStepIds] = await pool.query(
          `SELECT s.id FROM teacher_db.assessment_steps s
           JOIN teacher_db.assessment_steps cur ON cur.id = ?
           WHERE s.assessment_id = cur.assessment_id
             AND s.step_order <= cur.step_order`,
          [stepId]
        );
        const ids = prevStepIds.map(r => r.id);
        [aiLogs] = await pool.query(
          `SELECT id, response, step_id FROM log_db.ai_logs
           WHERE participation_id = ?
             AND step_id IN (?)
             AND response IS NOT NULL AND response != ''
           ORDER BY logged_at ASC`,
          [participationId, ids]
        );
      } else {
        // step_order 조회 실패 시 현재 단계만
        [aiLogs] = await pool.query(
          `SELECT id, response, step_id FROM log_db.ai_logs
           WHERE participation_id = ? AND step_id = ?
             AND response IS NOT NULL AND response != ''`,
          [participationId, stepId]
        );
      }
    } else {
      // stepId 없으면 해당 participation 전체
      [aiLogs] = await pool.query(
        `SELECT id, response, step_id FROM log_db.ai_logs
         WHERE participation_id = ? AND response IS NOT NULL AND response != ''
         ORDER BY logged_at ASC`,
        [participationId]
      );
    }
    if (aiLogs.length === 0) {
      // AI 로그 없음 (비허용 단계 등) → 줄 단위로 분리해 초록/0% 로 저장
      console.log(`[유사도] AI 로그 없음 → 초록/0% 저장 (submission=${submissionId})`);
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      const rows = (lines.length > 0 ? lines : [content])
        .map((line, idx) => [submissionId, idx, line, null, 0, 'green']);
      await pool.query(`DELETE FROM log_db.submissions_step WHERE submission_id = ?`, [submissionId]);
      await pool.query(
        `INSERT INTO log_db.submissions_step
         (submission_id, segment_order, content, ai_log_id, similarity_score, originality)
         VALUES ?`,
        [rows]
      );
      console.log(`[유사도] 완료 (${((Date.now()-t0)/1000).toFixed(1)}s) — ${rows.length}개 문장 저장`);
      return;
    }

    console.log(`[유사도] AI 로그 ${aiLogs.length}개 → 모델 요청 중...`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240000); // 4분 (모델 초기 로딩 대비)
    const res = await fetch(`${AI_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        ai_logs: aiLogs,
        submission_id: submissionId,
        participation_id: participationId,
        step_id: stepId || 0,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return;

    const results = await res.json();
    console.log(`[유사도] 모델 응답 (${((Date.now()-t0)/1000).toFixed(1)}s) — ${results.length}개 문장`);
    if (!Array.isArray(results) || results.length === 0) return;

    // 기존 임시 행 삭제 후 모델이 분리한 문장으로 교체
    await pool.query(
      `DELETE FROM log_db.submissions_step WHERE submission_id = ?`,
      [submissionId]
    );

    if (results.length > 0) {
      const rows = results.map(r => [
        submissionId,
        r.sentence_index,          // 0-based
        r.sentence,                // 모델이 분리한 문장
        r.best_ai_log_id ?? null,
        r.similarity_percent,
        toOriginality(r.similarity_percent),
      ]);
      await pool.query(
        `INSERT INTO log_db.submissions_step
         (submission_id, segment_order, content, ai_log_id, similarity_score, originality)
         VALUES ?`,
        [rows]
      );
      console.log(`[유사도] 저장 완료 (${((Date.now()-t0)/1000).toFixed(1)}s) — submission=${submissionId} ${rows.length}개 문장`);
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      console.error(`[유사도 타임아웃] submission=${submissionId} — AI 서비스 응답 없음 (4분 초과)`);
    } else {
      console.error(`[유사도 오류] submission=${submissionId}`, err.message);
    }
  }
}

// 루브릭 이행 채점 큐 — 최종 제출 + 동의 시에만 실행
const _rubricQueue = [];
let _rubricRunning = false;

function enqueueRubricScoring(participationId, assessmentId) {
  _rubricQueue.push({ participationId, assessmentId });
  console.log(`[단계이행채점 큐] participation=${participationId} (대기 ${_rubricQueue.length}개)`);
  _drainRubricQueue();
}

function _drainRubricQueue() {
  if (_rubricRunning || _rubricQueue.length === 0) return;
  _rubricRunning = true;
  const job = _rubricQueue.shift();
  runRubricScoring(job.participationId, job.assessmentId)
    .finally(() => {
      _rubricRunning = false;
      _drainRubricQueue();
    });
}

async function runRubricScoring(participationId, assessmentId) {
  const t0 = Date.now();
  console.log(`[단계이행채점] 시작 — participation=${participationId} assessment=${assessmentId}`);
  try {
    const [steps] = await pool.query(
      `SELECT id, step_order, title, description
       FROM teacher_db.assessment_steps
       WHERE assessment_id = ?
       ORDER BY step_order ASC`,
      [assessmentId]
    );
    const stepInstructions = buildStepScoringPlan(steps);
    if (!stepInstructions) {
      console.log(
        `[단계이행채점] 채점 가능한 단계 없음 — participation=${participationId} 스킵`
      );
      return;
    }

    const stepByOrder = Object.fromEntries(steps.map((s) => [s.step_order, s]));

    const [submissions] = await pool.query(
      `SELECT sub.id AS submissionId, sub.step_id, sub.content, s.step_order
       FROM log_db.submissions sub
       JOIN teacher_db.assessment_steps s ON sub.step_id = s.id
       WHERE sub.participation_id = ?
         AND sub.content IS NOT NULL AND TRIM(sub.content) != ''
       ORDER BY s.step_order ASC`,
      [participationId]
    );

    const subByOrder = {};
    submissions.forEach((sub) => {
      if (sub.step_order != null) subByOrder[sub.step_order] = sub;
    });

    for (const item of stepInstructions) {
      const step = stepByOrder[item.stepOrder];
      const submission = subByOrder[item.stepOrder];
      if (!step || !submission?.content?.trim()) {
        console.log(`[단계이행채점] step_order=${item.stepOrder} 제출 없음 — 스킵`);
        continue;
      }

      const aggregated = await callScoreStep(submission.content.trim(), item.criteria);
      if (!aggregated) {
        console.error(`[단계이행채점] AI 오류 step_order=${item.stepOrder} — /score-step 응답 없음`);
        continue;
      }

      await saveStepComplianceScore({
        participationId,
        stepId: step.id,
        submissionId: submission.submissionId,
        criteria: item.criteria,
        aggregated,
      });
      console.log(
        `[단계이행채점] 저장 step_order=${item.stepOrder} score=${aggregated.scoreClassification} met=${aggregated.criteriaMet}`
      );
    }

    console.log(`[단계이행채점] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) participation=${participationId}`);
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      console.error(`[단계이행채점 타임아웃] participation=${participationId}`);
    } else {
      console.error(`[단계이행채점 오류] participation=${participationId}`, err.message);
    }
  }
}

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

/** ISO 8601 등 → MySQL DATETIME ('YYYY-MM-DD HH:MM:SS') */
function toMysqlDatetime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// 교사 본인의 class invite_code 조회 (학생 회원가입용)
router.get('/invite-codes', authenticateToken, requireTeacher, async (req, res) => {
  try {
    if (isMaster(req.user)) {
      const [rows] = await pool.query(
        `SELECT t.invite_code, u.name AS teacher_name, u.email AS teacher_email
         FROM teacher_db.teachers t
         JOIN capstonedesign.users u ON t.user_id = u.id
         ORDER BY u.name`
      );
      return res.json({ invite_codes: rows });
    }
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

async function fetchAssessmentForRequest(req, assessmentId) {
  await autoCloseExpiredAssessments([assessmentId]);
  if (isMaster(req.user)) {
    const [rows] = await pool.query(
      'SELECT * FROM teacher_db.assessments WHERE id = ?',
      [assessmentId]
    );
    return rows[0] || null;
  }
  const teacherId = await getTeacherId(req.user.id);
  const [rows] = await pool.query(
    'SELECT * FROM teacher_db.assessments WHERE id = ? AND teacher_id = ?',
    [assessmentId, teacherId]
  );
  return rows[0] || null;
}

// 교사 수행평가 목록 조회
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    let fresh;
    if (isMaster(req.user)) {
      const [assessments] = await pool.query(
        'SELECT * FROM teacher_db.assessments ORDER BY created_at DESC'
      );
      await autoCloseExpiredAssessments(assessments.map((a) => a.id));
      [fresh] = await pool.query(
        'SELECT * FROM teacher_db.assessments ORDER BY created_at DESC'
      );
    } else {
      const teacherId = await getTeacherId(req.user.id);
      const [assessments] = await pool.query(
        'SELECT * FROM teacher_db.assessments WHERE teacher_id = ? ORDER BY created_at DESC',
        [teacherId]
      );
      await autoCloseExpiredAssessments(assessments.map((a) => a.id));
      [fresh] = await pool.query(
        'SELECT * FROM teacher_db.assessments WHERE teacher_id = ? ORDER BY created_at DESC',
        [teacherId]
      );
    }

    const result = await Promise.all(fresh.map(async (a) => {
      const [[{ stepCount }]] = await pool.query(
        'SELECT COUNT(*) as stepCount FROM teacher_db.assessment_steps WHERE assessment_id = ?',
        [a.id]
      );
      return stripRubricJsonColumn({ ...a, step_count: stepCount });
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 학생: 내 참여 목록 조회 — /:id 보다 반드시 먼저 등록
router.get('/my-participations', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student' && !isMaster(req.user)) {
    return res.status(403).json({ error: '학생 전용 API입니다.' });
  }

  try {
    if (isMaster(req.user)) {
      const [rows] = await pool.query(
        `SELECT p.*, a.title AS assessment_title, a.description AS assessment_description,
                a.invite_code, a.status AS assessment_status,
                u.name AS student_name, u.email AS student_email,
                (SELECT COUNT(*) FROM teacher_db.assessment_steps WHERE assessment_id = a.id) AS total_steps
         FROM student_db.participations p
         JOIN teacher_db.assessments a ON p.assessment_id = a.id
         JOIN student_db.students s ON p.student_id = s.id
         JOIN capstonedesign.users u ON s.user_id = u.id
         ORDER BY p.created_at DESC`
      );
      return res.json(rows);
    }

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
  if (req.user.role !== 'student' && !isMaster(req.user)) {
    return res.status(403).json({ error: '학생 전용 API입니다.' });
  }

  const participationId = parseInt(req.params.participationId, 10);
  if (isNaN(participationId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  try {
    let pRows;
    if (isMaster(req.user)) {
      [pRows] = await pool.query(
        `SELECT p.*, a.title AS assessment_title, a.description AS assessment_description,
                a.invite_code, a.subject, a.target_class, a.deadline
         FROM student_db.participations p
         JOIN teacher_db.assessments a ON p.assessment_id = a.id
         WHERE p.id = ?`,
        [participationId]
      );
    } else {
      const [sRows] = await pool.query(
        'SELECT id FROM student_db.students WHERE user_id = ?',
        [req.user.id]
      );
      if (sRows.length === 0) return res.status(404).json({ error: '학생 정보를 찾을 수 없습니다.' });

      [pRows] = await pool.query(
        `SELECT p.*, a.title AS assessment_title, a.description AS assessment_description,
                a.invite_code, a.subject, a.target_class, a.deadline
         FROM student_db.participations p
         JOIN teacher_db.assessments a ON p.assessment_id = a.id
         WHERE p.id = ? AND p.student_id = ?`,
        [participationId, sRows[0].id]
      );
    }
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
      subject: participation.subject || null,
      target_class: participation.target_class || null,
      deadline: participation.deadline || null,
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
    const assessment = await fetchAssessmentForRequest(req, assessmentId);
    if (!assessment) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

    const [steps] = await pool.query(
      'SELECT * FROM teacher_db.assessment_steps WHERE assessment_id = ? ORDER BY step_order',
      [assessmentId]
    );

    res.json({
      ...formatAssessmentResponse(assessment),
      steps: steps.map(s => ({ ...s, ai_mode: toFrontendAiMode(s.ai_permission) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 수행평가 생성 (assessment + assessment_steps)
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  if (isMaster(req.user)) {
    return res.status(403).json({ error: '마스터 계정은 조회 전용입니다.' });
  }
  const { title, description, subject, target_class, deadline, steps, rubric } = req.body;

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

    // deadline 문자열 — 로컬 시간 그대로 저장 (TZ 변환 금지)
    let deadlineVal = null;
    if (deadline && deadline.trim()) {
      const normalized = deadline.trim().replace(/\./g, '-');
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
        deadlineVal = normalized.length === 16 ? normalized + ':00' : normalized;
      }
    }

    const rubricJson = serializeRubricJson(rubric);

    const [result] = await conn.query(
      'INSERT INTO teacher_db.assessments (teacher_id, title, description, subject, target_class, deadline, status, invite_code, rubric_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [teacherId, title.trim(), description?.trim() || null, subject?.trim() || null, target_class?.trim() || null, deadlineVal, 'active', inviteCode, rubricJson]
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
      ...formatAssessmentResponse(newRows[0]),
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
  if (isMaster(req.user)) {
    return res.status(403).json({ error: '마스터 계정은 조회 전용입니다.' });
  }
  const assessmentId = parseInt(req.params.id, 10);
  const stepId = parseInt(req.params.stepId, 10);
  if (isNaN(assessmentId) || isNaN(stepId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  try {
    const assessment = await fetchAssessmentForRequest(req, assessmentId);
    if (!assessment) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

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

// 수행평가 수정 (기본 정보 + 단계 일괄 교체)
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  if (isMaster(req.user)) {
    return res.status(403).json({ error: '마스터 계정은 조회 전용입니다.' });
  }
  const assessmentId = parseInt(req.params.id, 10);
  if (isNaN(assessmentId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  const { title, description, subject, target_class, deadline, steps, rubric } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const assessment = await fetchAssessmentForRequest(req, assessmentId);
    if (!assessment) { await conn.rollback(); return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' }); }

    let deadlineVal = null;
    if (deadline && deadline.trim()) {
      const normalized = deadline.trim().replace(/\./g, '-');
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
        deadlineVal = normalized.length === 16 ? normalized + ':00' : normalized;
      }
    }

    const updateParams = [
      title.trim(),
      description?.trim() || null,
      subject?.trim() || null,
      target_class?.trim() || null,
      deadlineVal,
    ];
    let updateSql = 'UPDATE teacher_db.assessments SET title=?, description=?, subject=?, target_class=?, deadline=?';
    if ('rubric' in req.body) {
      updateSql += ', rubric_json=?';
      updateParams.push(serializeRubricJson(rubric));
    }
    updateSql += ' WHERE id=?';
    updateParams.push(assessmentId);
    await conn.query(updateSql, updateParams);

    // 기존 단계 삭제 후 재삽입
    await conn.query('DELETE FROM teacher_db.assessment_steps WHERE assessment_id = ?', [assessmentId]);
    if (Array.isArray(steps) && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await conn.query(
          'INSERT INTO teacher_db.assessment_steps (assessment_id, step_order, title, description, ai_permission) VALUES (?, ?, ?, ?, ?)',
          [assessmentId, i + 1, step.title?.trim(), step.description?.trim() || null, toDbAiPermission(step.ai_mode)]
        );
      }
    }

    await conn.commit();
    res.json({ message: '수행평가가 수정되었습니다.', id: assessmentId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 수행평가 삭제 (참여·제출·로그·단계 포함 전체 삭제)
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  if (isMaster(req.user)) {
    return res.status(403).json({ error: '마스터 계정은 조회 전용입니다.' });
  }
  const assessmentId = parseInt(req.params.id, 10);
  if (isNaN(assessmentId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  const conn = await pool.getConnection();
  try {
    const assessment = await fetchAssessmentForRequest(req, assessmentId);
    if (!assessment) return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });

    await conn.beginTransaction();
    await deleteAssessmentCascade(conn, assessmentId);
    await conn.commit();

    res.json({ message: '수행평가가 삭제되었습니다.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 학생: 이전 단계 제출 내용 조회
router.get('/participation/:participationId/submissions', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student' && !isMaster(req.user)) {
    return res.status(403).json({ error: '학생 전용 API입니다.' });
  }

  const participationId = parseInt(req.params.participationId, 10);
  if (isNaN(participationId)) return res.status(400).json({ error: '잘못된 ID입니다.' });

  try {
    if (!isMaster(req.user)) {
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
    }

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

  const { step_id, content, consent_given, step_unlock_snapshots } = req.body;

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

    const currentStep = participation.current_step || 1;
    const nextStep = currentStep + 1;
    const isLastStep = currentStep >= totalSteps;

    // 제출 내용 저장 (content 있을 때만) — unlock 스냅샷은 최종 제출 시에만 별도 반영
    if (content && content.trim()) {
      const [subResult] = await pool.query(
        `INSERT INTO log_db.submissions (participation_id, step_id, content, submitted_at)
         VALUES (?, ?, ?, NOW())`,
        [participationId, step_id || null, content.trim()]
      );
      const submissionId = subResult.insertId;

      // submissions_step: 전체 내용을 1개 행으로 임시 저장
      // (유사도 모델이 문장 분리 후 이 행들을 교체함)
      await pool.query(
        `INSERT INTO log_db.submissions_step (submission_id, segment_order, content) VALUES (?, 0, ?)`,
        [submissionId, content.trim()]
      );

      // 유사도 분석은 최종 제출 + 동의 시에만 실행
    }

    if (isLastStep && Array.isArray(step_unlock_snapshots)) {
      for (const snap of step_unlock_snapshots) {
        const snapStepId = parseInt(snap?.step_id, 10);
        const unlockContent =
          typeof snap?.content_at_unlock === 'string' && snap.content_at_unlock.trim()
            ? snap.content_at_unlock.trim()
            : null;
        if (!Number.isFinite(snapStepId) || !unlockContent) continue;

        const unlockedAt = snap.browser_unlocked_at
          ? toMysqlDatetime(snap.browser_unlocked_at)
          : null;

        try {
          await pool.query(
            `UPDATE log_db.submissions
             SET content_at_unlock = ?, browser_unlocked_at = ?
             WHERE participation_id = ? AND step_id = ?`,
            [unlockContent, unlockedAt, participationId, snapStepId]
          );
        } catch (updateErr) {
          if (updateErr.code !== 'ER_BAD_FIELD_ERROR') throw updateErr;
          console.warn(
            '[submit] content_at_unlock 컬럼 없음 — 마이그레이션 후 재시작 필요. 스냅샷 미저장.'
          );
        }
      }
    }

    if (isLastStep) {
      // 마지막 단계 → 전체 제출 완료 (동의 여부 함께 저장)
      await pool.query(
        `UPDATE student_db.participations
         SET status = 'submitted',
             consent_given = ?,
             consent_at = IF(? = true, NOW(), NULL),
             updated_at = NOW()
         WHERE id = ?`,
        [consent_given ? 1 : 0, consent_given ? 1 : 0, participationId]
      );

      // 동의한 경우에만 유사도 분석 실행 (전 단계 한번에 큐에 추가)
      if (consent_given) {
        const [allSubs] = await pool.query(
          `SELECT id AS submissionId, step_id, content
           FROM log_db.submissions
           WHERE participation_id = ?
           ORDER BY submitted_at ASC`,
          [participationId]
        );
        for (const sub of allSubs) {
          enqueueSimilarityAnalysis(sub.content, sub.submissionId, participationId, sub.step_id);
        }
        enqueueRubricScoring(participationId, participation.assessment_id);
        console.log(`[분석] 최종제출 동의 — participation=${participationId} 유사도 ${allSubs.length}건 + 단계이행채점 큐 추가`);
      } else {
        console.log(`[분석] 최종제출 미동의 — participation=${participationId} 유사도·단계이행채점 생략`);
      }

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
