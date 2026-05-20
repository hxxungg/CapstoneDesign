const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

function classifyPromptType(prompt) {
  if (!prompt) return 'info';
  const p = prompt.toLowerCase();
  if (/요약|정리|summarize|summary/.test(p))                        return 'summary';
  if (/비교|차이|compare|versus|vs\.?/.test(p))                     return 'compare';
  if (/예측|전망|예상|predict|forecast/.test(p))                    return 'predict';
  if (/평가|분석|evaluate|assess|critique|장단점|pros|cons/.test(p)) return 'evaluate';
  if (/작성|생성|써줘|만들어|write|create|generate/.test(p))        return 'generate';
  return 'info';
}

function classifyPromptLevel(prompt) {
  if (!prompt) return 1;
  const len = prompt.trim().length;
  if (len < 30)  return 1;
  if (len < 100) return 2;
  return 3;
}

// participationId + users.id 기반 본인 확인 (participations.student_id = students.id)
async function verifyParticipation(participationId, userId) {
  const [rows] = await pool.query(
    `SELECT p.id FROM student_db.participations p
     JOIN student_db.students s ON p.student_id = s.id
     WHERE p.id = ? AND s.user_id = ?`,
    [participationId, userId]
  );
  return rows.length > 0;
}

// POST /logs/url — URL 방문 기록
router.post('/url', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 로그를 기록할 수 있습니다.' });
  }

  const { participation_id, step_id, url, page_title, visited_at, complete_at } = req.body;
  if (!participation_id || !url) {
    return res.status(400).json({ error: 'participation_id와 url은 필수입니다.' });
  }

  try {
    const ok = await verifyParticipation(participation_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '본인의 참여 기록이 아닙니다.' });

    const [result] = await pool.query(
      `INSERT INTO log_db.url_logs
        (participation_id, step_id, url, page_title, visited_at, complete_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        participation_id,
        step_id || null,
        url,
        page_title || null,
        visited_at ? new Date(visited_at) : new Date(),
        complete_at ? new Date(complete_at) : null,
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'URL 방문 기록 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /logs/ai — AI 프롬프트 & 응답 기록
router.post('/ai', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 로그를 기록할 수 있습니다.' });
  }

  const { participation_id, step_id, prompt, response, prompt_type, prompt_level } = req.body;
  if (!participation_id || !prompt) {
    return res.status(400).json({ error: 'participation_id와 prompt는 필수입니다.' });
  }

  try {
    const ok = await verifyParticipation(participation_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '본인의 참여 기록이 아닙니다.' });

    const finalType  = prompt_type  || classifyPromptType(prompt);
    const finalLevel = prompt_level || classifyPromptLevel(prompt);

    const [result] = await pool.query(
      `INSERT INTO log_db.ai_logs
        (participation_id, step_id, prompt, response, prompt_type, prompt_level, logged_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        participation_id,
        step_id || null,
        prompt,
        response || '',
        finalType,
        finalLevel,
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'AI 로그 기록 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// PATCH /logs/ai/:id/response — AI 응답 추가 (프롬프트 후 응답이 생성되면 호출)
router.patch('/ai/:id/response', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 로그를 수정할 수 있습니다.' });
  }

  const logId = parseInt(req.params.id);
  const { response } = req.body;

  try {
    const [rows] = await pool.query(
      `SELECT al.id FROM log_db.ai_logs al
       JOIN student_db.participations p ON al.participation_id = p.id
       JOIN student_db.students s ON p.student_id = s.id
       WHERE al.id = ? AND s.user_id = ?`,
      [logId, req.user.id]
    );
    if (rows.length === 0) return res.status(403).json({ error: '수정 권한이 없습니다.' });

    await pool.query(
      'UPDATE log_db.ai_logs SET response = ?, complete_at = NOW() WHERE id = ?',
      [response || null, logId]
    );

    res.json({ message: 'AI 응답 업데이트 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /logs/exit — 이탈 시도 (신규)
router.post('/exit', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 이탈 시도를 기록할 수 있습니다.' });
  }

  const { participation_id, assignment_id, attempt_type } = req.body;

  try {
    await pool.query(
      'INSERT INTO log_db.exit_attempts (student_id, assignment_id, attempt_type) VALUES (?, ?, ?)',
      [req.user.id, assignment_id ? parseInt(assignment_id) : null, attempt_type || 'unknown']
    );
    res.status(201).json({ message: '이탈 시도 기록 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /logs/exit-attempt — 하위 호환 유지
router.post('/exit-attempt', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 이탈 시도를 기록할 수 있습니다.' });
  }
  const { assignment_id, attempt_type } = req.body;
  try {
    await pool.query(
      'INSERT INTO log_db.exit_attempts (student_id, assignment_id, attempt_type) VALUES (?, ?, ?)',
      [req.user.id, assignment_id ? parseInt(assignment_id) : null, attempt_type || 'unknown']
    );
    res.status(201).json({ message: '이탈 시도 기록 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /logs/participation/:id — 교사용: 참여별 로그 전체 조회
router.get('/participation/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '교사 권한이 필요합니다.' });
  }

  const participationId = parseInt(req.params.id);

  try {
    const [pRows] = await pool.query(
      `SELECT p.*, a.teacher_id, a.title AS assessment_title
       FROM student_db.participations p
       JOIN teacher_db.assessments a ON p.assessment_id = a.id
       WHERE p.id = ?`,
      [participationId]
    );
    if (pRows.length === 0) return res.status(404).json({ error: '참여 기록을 찾을 수 없습니다.' });

    const [teacherRows] = await pool.query(
      'SELECT id FROM teacher_db.teachers WHERE user_id = ?',
      [req.user.id]
    );
    if (
      teacherRows.length === 0 ||
      Number(pRows[0].teacher_id) !== Number(teacherRows[0].id)
    ) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const [urlLogs] = await pool.query(
      `SELECT ul.*, s.title AS step_title, s.step_order
       FROM log_db.url_logs ul
       LEFT JOIN teacher_db.assessment_steps s ON ul.step_id = s.id
       WHERE ul.participation_id = ?
       ORDER BY ul.visited_at`,
      [participationId]
    );

    const [aiLogs] = await pool.query(
      `SELECT al.*, s.title AS step_title, s.step_order
       FROM log_db.ai_logs al
       LEFT JOIN teacher_db.assessment_steps s ON al.step_id = s.id
       WHERE al.participation_id = ?
       ORDER BY al.logged_at`,
      [participationId]
    );

    // exit_attempts.student_id = users.id이므로 students를 통해 변환
    const [uRows] = await pool.query(
      'SELECT user_id FROM student_db.students WHERE id = ?',
      [pRows[0].student_id]
    );
    const exitUserId = uRows[0]?.user_id || null;
    const [exitAttempts] = exitUserId
      ? await pool.query(
          'SELECT * FROM log_db.exit_attempts WHERE student_id = ? ORDER BY created_at',
          [exitUserId]
        )
      : [[]];

    res.json({
      participation: pRows[0],
      url_logs: urlLogs,
      ai_logs: aiLogs,
      exit_attempts: exitAttempts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
