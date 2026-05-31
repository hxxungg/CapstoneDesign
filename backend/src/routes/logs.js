const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { scheduleRelevanceMatching } = require('../services/relevanceMatchingService');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001';

function normalizeAiText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();
}

function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// AI 서비스로 프롬프트 유형 분류 (실패 시 키워드 기반 폴백)
async function classifyPromptType(prompt) {
  if (!prompt) return 'info';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${AI_SERVICE_URL}/analyze-prompt-type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.label) return data.label;
    }
  } catch (_) {}
  // 폴백: 키워드 기반
  const p = prompt.toLowerCase();
  if (/요약|정리|summarize|summary/.test(p))                        return 'summary';
  if (/비교|차이|compare|versus|vs\.?/.test(p))                     return 'compare';
  if (/예측|전망|예상|predict|forecast/.test(p))                    return 'predict';
  if (/평가|분석|evaluate|assess|critique|장단점|pros|cons/.test(p)) return 'evaluate';
  if (/작성|생성|써줘|만들어|write|create|generate/.test(p))        return 'generate';
  return 'info';
}

// AI 서비스로 프롬프트 수준 분류 (실패 시 길이 기반 폴백)
async function classifyPromptLevel(prompt) {
  if (!prompt) return 1;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${AI_SERVICE_URL}/analyze-prompt-level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.level) return data.level;
    }
  } catch (_) {}
  // 폴백: 길이 기반
  const len = prompt.trim().length;
  if (len < 30)  return 1;
  if (len < 100) return 2;
  if (len < 200) return 3;
  return 4;
}

function scheduleAiLogClassification(id, prompt, prompt_type, prompt_level) {
  if (prompt_type && prompt_level) return;
  Promise.all([
    prompt_type  ? Promise.resolve(prompt_type)  : classifyPromptType(prompt),
    prompt_level ? Promise.resolve(prompt_level) : classifyPromptLevel(prompt),
  ]).then(([finalType, finalLevel]) => {
    pool.query(
      'UPDATE log_db.ai_logs SET prompt_type = ?, prompt_level = ? WHERE id = ?',
      [finalType, finalLevel, id]
    ).catch(err => console.error('[ai_logs 분류 업데이트 오류]', err.message));
  }).catch(() => {});
}

/** 비판적 사용 모델 → critical_label, critical_label_name, critical_confidence */
async function classifyCriticalUseApi(prompt) {
  if (!prompt?.trim()) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${AI_SERVICE_URL}/analyze-critical-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim() }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const label = data.label != null ? Number(data.label) : null;
    if (label == null || Number.isNaN(label)) return null;
    const labelName = data.label_name
      ? String(data.label_name).slice(0, 50)
      : (label === 1 ? 'Critical Use' : 'Non-Critical Use');
    const confidence =
      data.confidence != null && !Number.isNaN(Number(data.confidence))
        ? Number(data.confidence)
        : null;
    return { label, label_name: labelName, confidence };
  } catch (err) {
    console.error('[critical_use 분류 오류]', err.message);
    return null;
  }
}

function scheduleCriticalUseClassification(id, prompt, critical_label) {
  if (critical_label != null && critical_label !== '') return;
  classifyCriticalUseApi(prompt)
    .then((result) => {
      if (!result) return;
      return pool.query(
        `UPDATE log_db.ai_logs
         SET critical_label = ?, critical_label_name = ?, critical_confidence = ?
         WHERE id = ?`,
        [result.label, result.label_name, result.confidence, id]
      );
    })
    .catch((err) => console.error('[ai_logs critical_use 업데이트 오류]', err.message));
}

function scheduleAiLogEnrichment(id, prompt, { prompt_type, prompt_level, critical_label } = {}) {
  scheduleAiLogClassification(id, prompt, prompt_type, prompt_level);
  scheduleCriticalUseClassification(id, prompt, critical_label);
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

  const { participation_id, step_id, url, search_query, visited_at, complete_at } = req.body;
  if (!participation_id || !url || !step_id) {
    return res.status(400).json({ error: 'participation_id, step_id, url은 필수입니다.' });
  }

  // URL에서 검색어 자동 추출 (클라이언트가 안 보낸 경우 서버에서 파싱)
  function extractSearchQuery(rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (/google\./i.test(u.hostname))      return u.searchParams.get('q');
      if (/naver\.com/i.test(u.hostname))    return u.searchParams.get('query') || u.searchParams.get('q');
      if (/bing\.com/i.test(u.hostname))     return u.searchParams.get('q');
      if (/duckduckgo\.com/i.test(u.hostname)) return u.searchParams.get('q');
      if (/yahoo\.com/i.test(u.hostname))    return u.searchParams.get('p') || u.searchParams.get('q');
      if (/daum\.net/i.test(u.hostname))     return u.searchParams.get('q');
    } catch (_) {}
    return null;
  }

  try {
    const ok = await verifyParticipation(participation_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '본인의 참여 기록이 아닙니다.' });

    const safeUrl         = String(url).slice(0, 2083);
    const safeSearchQuery = (search_query || extractSearchQuery(safeUrl) || '').slice(0, 500) || null;
    const safeVisitedAt   = safeDate(visited_at) || new Date();
    const safeCompleteAt  = safeDate(complete_at);

    // 동일 participation + URL + 1분 이내 중복 삽입 방지
    const [dupRows] = await pool.query(
      `SELECT id FROM log_db.url_logs
       WHERE participation_id = ? AND url = ?
         AND visited_at >= DATE_SUB(?, INTERVAL 1 MINUTE)
       LIMIT 1`,
      [participation_id, safeUrl, safeVisitedAt]
    );
    if (dupRows.length > 0) {
      return res.status(200).json({ id: dupRows[0].id, message: '중복 URL 스킵' });
    }

    const [result] = await pool.query(
      `INSERT INTO log_db.url_logs
        (participation_id, step_id, url, search_query, visited_at, complete_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        participation_id,
        step_id,
        safeUrl,
        safeSearchQuery,
        safeVisitedAt,
        safeCompleteAt,
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'URL 방문 기록 완료' });
    scheduleRelevanceMatching(participation_id);
  } catch (err) {
    // 실제 오류 내용을 로그에 출력해 디버깅 편의 제공
    console.error('[url_logs 저장 오류]', err.code, err.sqlMessage || err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.', detail: err.code });
  }
});

// POST /logs/url/bulk — 동의 후 로컬 버퍼 → DB 일괄 저장
router.post('/url/bulk', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 로그를 기록할 수 있습니다.' });
  }

  const { participation_id, logs } = req.body;
  if (!participation_id || !Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ error: 'participation_id와 logs 배열이 필요합니다.' });
  }

  function extractSearchQuery(rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (/google\./i.test(u.hostname))      return u.searchParams.get('q');
      if (/naver\.com/i.test(u.hostname))    return u.searchParams.get('query') || u.searchParams.get('q');
      if (/bing\.com/i.test(u.hostname))     return u.searchParams.get('q');
      if (/duckduckgo\.com/i.test(u.hostname)) return u.searchParams.get('q');
      if (/yahoo\.com/i.test(u.hostname))    return u.searchParams.get('p') || u.searchParams.get('q');
      if (/daum\.net/i.test(u.hostname))     return u.searchParams.get('q');
    } catch (_) {}
    return null;
  }

  try {
    const ok = await verifyParticipation(participation_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '본인의 참여 기록이 아닙니다.' });

    const rows = logs.map((log) => {
      const safeUrl = String(log.url || '').slice(0, 2083);
      const safeSearchQuery = (log.search_query || extractSearchQuery(safeUrl) || '').slice(0, 500) || null;
      return [
        participation_id,
        log.step_id || null,
        safeUrl,
        safeSearchQuery,
        safeDate(log.visited_at) || new Date(),
        safeDate(log.complete_at),
      ];
    }).filter((row) => row[2]);

    if (rows.length === 0) {
      return res.status(400).json({ error: '저장할 URL 로그가 없습니다.' });
    }

    await pool.query(
      `INSERT INTO log_db.url_logs
         (participation_id, step_id, url, search_query, visited_at, complete_at)
       VALUES ?`,
      [rows]
    );

    console.log(`[url_logs bulk] participation=${participation_id} ${rows.length}개 저장`);
    res.status(201).json({ message: `${rows.length}개 URL 로그 저장 완료`, count: rows.length });
    scheduleRelevanceMatching(participation_id);
  } catch (err) {
    console.error('[url_logs bulk 오류]', err.code, err.sqlMessage || err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /logs/ai — AI 프롬프트 & 응답 기록
router.post('/ai', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 로그를 기록할 수 있습니다.' });
  }

  const { participation_id, step_id, prompt, response, prompt_type, prompt_level, logged_at, complete_at } = req.body;
  if (!participation_id || !step_id || !prompt) {
    return res.status(400).json({ error: 'participation_id, step_id, prompt는 필수입니다.' });
  }

  try {
    const ok = await verifyParticipation(participation_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '본인의 참여 기록이 아닙니다.' });

    // 먼저 저장 후 AI 분류를 비동기로 업데이트 (클라이언트 대기 최소화)
    const [result] = await pool.query(
      `INSERT INTO log_db.ai_logs
        (participation_id, step_id, prompt, response, prompt_type, prompt_level, logged_at, complete_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        participation_id,
        step_id,
        String(normalizeAiText(prompt)).slice(0, 2000),
        response ? String(normalizeAiText(response)).slice(0, 8000) : '',
        prompt_type || null,
        prompt_level || null,
        safeDate(logged_at) || new Date(),
        safeDate(complete_at),
      ]
    );
    const insertedId = result.insertId;

    // 즉시 응답 — 클라이언트가 기다리지 않아도 됨
    res.status(201).json({ id: insertedId, message: 'AI 로그 기록 완료' });

    scheduleAiLogEnrichment(insertedId, prompt, { prompt_type, prompt_level });
    scheduleRelevanceMatching(participation_id);
  } catch (err) {
    console.error('[ai_logs 저장 오류]', err.code, err.sqlMessage || err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.', detail: err.code });
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

    const safeResponse = response ? String(normalizeAiText(response)).slice(0, 8000) : null;
    await pool.query(
      'UPDATE log_db.ai_logs SET response = ? WHERE id = ?',
      [safeResponse, logId]
    );

    res.json({ message: 'AI 응답 업데이트 완료' });
  } catch (err) {
    console.error('[ai_logs 응답 업데이트 오류]', err.code, err.sqlMessage || err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /logs/ai/bulk — 동의 후 로컬 버퍼 → DB 일괄 저장
router.post('/ai/bulk', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 로그를 기록할 수 있습니다.' });
  }

  const { participation_id, logs } = req.body;
  if (!participation_id || !Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ error: 'participation_id와 logs 배열이 필요합니다.' });
  }

  try {
    const ok = await verifyParticipation(participation_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '본인의 참여 기록이 아닙니다.' });

    const rows = logs.map(log => [
      participation_id,
      log.step_id || null,
      String(normalizeAiText(log.prompt || '')).slice(0, 2000),
      log.response ? String(normalizeAiText(log.response)).slice(0, 8000) : '',
      log.prompt_type || null,
      log.prompt_level || null,
      safeDate(log.logged_at) || new Date(),
      safeDate(log.complete_at),
    ]);

    const [result] = await pool.query(
      `INSERT INTO log_db.ai_logs
         (participation_id, step_id, prompt, response, prompt_type, prompt_level, logged_at, complete_at)
       VALUES ?`,
      [rows]
    );
    const firstId = result.insertId;

    console.log(`[ai_logs bulk] participation=${participation_id} ${rows.length}개 저장`);
    res.status(201).json({ message: `${rows.length}개 AI 로그 저장 완료`, count: rows.length });

    logs.forEach((log, i) => {
      scheduleAiLogEnrichment(firstId + i, rows[i][2], {
        prompt_type: log.prompt_type || null,
        prompt_level: log.prompt_level || null,
        critical_label: log.critical_label ?? null,
      });
    });
    scheduleRelevanceMatching(participation_id);
  } catch (err) {
    console.error('[ai_logs bulk 오류]', err.code, err.sqlMessage || err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /logs/exit — 이탈 시도: participations.exit_attempts + 1
router.post('/exit', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 이탈 시도를 기록할 수 있습니다.' });
  }
  const { participation_id } = req.body;
  if (!participation_id) return res.status(400).json({ error: 'participation_id는 필수입니다.' });

  try {
    const ok = await verifyParticipation(participation_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '본인의 참여 기록이 아닙니다.' });

    await pool.query(
      'UPDATE student_db.participations SET exit_attempts = exit_attempts + 1 WHERE id = ?',
      [participation_id]
    );
    res.status(200).json({ message: '이탈 시도 기록 완료' });
  } catch (err) {
    console.error('[exit 기록 오류]', err.code, err.sqlMessage || err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /logs/exit-attempt — 하위 호환 유지
router.post('/exit-attempt', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '학생만 이탈 시도를 기록할 수 있습니다.' });
  }
  const { participation_id } = req.body;
  if (!participation_id) return res.status(200).json({ message: '이탈 시도 기록 생략 (participation_id 없음)' });

  try {
    const ok = await verifyParticipation(participation_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '본인의 참여 기록이 아닙니다.' });

    await pool.query(
      'UPDATE student_db.participations SET exit_attempts = exit_attempts + 1 WHERE id = ?',
      [participation_id]
    );
    res.status(200).json({ message: '이탈 시도 기록 완료' });
  } catch (err) {
    console.error('[exit-attempt 기록 오류]', err.code, err.sqlMessage || err.message);
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

    const exitAttempts = pRows[0].exit_attempts ?? 0;

    res.json({
      participation: pRows[0],
      url_logs: urlLogs,
      ai_logs: aiLogs,
      exit_attempts: exitAttempts,  // participations.exit_attempts 컬럼값
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
