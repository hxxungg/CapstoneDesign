const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001';

function toOriginality(pct) {
  if (pct >= 70) return 'red';
  if (pct >= 40) return 'yellow';
  return 'green';
}

function normalizeText(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function stripTrailingPunct(text) {
  return (text ?? '').replace(/[.!?…]+$/u, '').trimEnd();
}

/** content_at_unlock 직후 텍스트 */
function splitSubmissionAtUnlock(fullRaw, unlockRaw) {
  const full = (fullRaw ?? '').trim();
  const unlock = (unlockRaw ?? '').trim();
  if (!full || !unlock) return { pre: full, post: '' };

  if (full.startsWith(unlock)) {
    return { pre: unlock, post: full.slice(unlock.length).trimStart() };
  }

  const fullNorm = normalizeText(full);
  const unlockNorm = normalizeText(unlock);
  if (!fullNorm || !unlockNorm) return { pre: full, post: '' };

  const fullLow = fullNorm.toLowerCase();
  const unlockLow = unlockNorm.toLowerCase();

  let splitAt = -1;
  if (fullLow.startsWith(unlockLow)) {
    splitAt = unlockNorm.length;
  } else {
    const unlockCore = stripTrailingPunct(unlockNorm);
    if (unlockCore && fullLow.startsWith(unlockCore.toLowerCase())) {
      splitAt = unlockCore.length;
    }
  }

  if (splitAt < 0) return { pre: full, post: '' };

  return {
    pre: unlock,
    post: fullNorm.slice(splitAt).trimStart(),
  };
}

function greenLineResults(content) {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const chunks = lines.length > 0 ? lines : [content];
  return chunks.map((line, idx) => ({
    sentence_index: idx,
    sentence: line,
    best_ai_log_id: null,
    similarity_percent: 0,
  }));
}

async function fetchStepAiLogs(pool, participationId, stepId, includeCurrentStep) {
  if (!stepId) {
    const [rows] = await pool.query(
      `SELECT id, response, step_id FROM log_db.ai_logs
       WHERE participation_id = ? AND response IS NOT NULL AND response != ''
       ORDER BY logged_at ASC`,
      [participationId]
    );
    return rows;
  }

  const [[currentStep]] = await pool.query(
    `SELECT step_order FROM teacher_db.assessment_steps WHERE id = ?`,
    [stepId]
  );

  if (!currentStep) {
    if (!includeCurrentStep) return [];
    const [rows] = await pool.query(
      `SELECT id, response, step_id FROM log_db.ai_logs
       WHERE participation_id = ? AND step_id = ?
         AND response IS NOT NULL AND response != ''
       ORDER BY logged_at ASC`,
      [participationId, stepId]
    );
    return rows;
  }

  const cmp = includeCurrentStep ? '<=' : '<';
  const [stepIdRows] = await pool.query(
    `SELECT s.id FROM teacher_db.assessment_steps s
     JOIN teacher_db.assessment_steps cur ON cur.id = ?
     WHERE s.assessment_id = cur.assessment_id
       AND s.step_order ${cmp} cur.step_order`,
    [stepId]
  );
  const ids = stepIdRows.map((r) => r.id);
  if (ids.length === 0) return [];

  const [rows] = await pool.query(
    `SELECT id, response, step_id FROM log_db.ai_logs
     WHERE participation_id = ?
       AND step_id IN (?)
       AND response IS NOT NULL AND response != ''
     ORDER BY logged_at ASC`,
    [participationId, ids]
  );
  return rows;
}

async function requestSimilarityModel(content, aiLogs, submissionId, participationId, stepId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
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
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    return results;
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeContentSegment({
  pool,
  content,
  aiLogs,
  submissionId,
  participationId,
  stepId,
  label,
  t0,
}) {
  if (!content?.trim()) return [];

  if (aiLogs.length === 0) {
    console.log(`[유사도] ${label} AI 로그 없음 → 초록/0% (${content.trim().length}자)`);
    return greenLineResults(content.trim());
  }

  console.log(`[유사도] ${label} AI 로그 ${aiLogs.length}개 → 모델 요청...`);
  const results = await requestSimilarityModel(
    content.trim(),
    aiLogs,
    submissionId,
    participationId,
    stepId
  );
  if (!results) {
    console.log(`[유사도] ${label} 모델 응답 없음`);
    return [];
  }
  console.log(
    `[유사도] ${label} 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) — ${results.length}개 문장`
  );
  return results;
}

async function saveSimilarityResults(pool, submissionId, results) {
  await pool.query(`DELETE FROM log_db.submissions_step WHERE submission_id = ?`, [submissionId]);
  if (!results.length) return 0;

  const rows = results.map((r, idx) => [
    submissionId,
    r.sentence_index ?? idx,
    r.sentence,
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
  return rows.length;
}

/**
 * 유사도 분석
 * - 일반: (현재 단계 결과물) + (현재·이전 단계 AI 로그)
 * - 조건부: 웹뷰 전 → (unlock 스냅샷) + (이전 단계 AI 로그만)
 *           웹뷰 후 → (unlock 이후 결과물) + (현재·이전 단계 AI 로그)
 */
async function runSimilarityAnalysis(pool, content, submissionId, participationId, stepId) {
  const t0 = Date.now();
  console.log(`[유사도] 시작 — submission=${submissionId} participation=${participationId} step=${stepId}`);

  try {
    let aiPermission = null;
    let contentAtUnlock = null;

    if (stepId) {
      const [[stepMeta]] = await pool.query(
        `SELECT ai_permission FROM teacher_db.assessment_steps WHERE id = ?`,
        [stepId]
      );
      aiPermission = stepMeta?.ai_permission ?? null;
    }

    const [[subMeta]] = await pool.query(
      `SELECT content_at_unlock FROM log_db.submissions WHERE id = ?`,
      [submissionId]
    );
    contentAtUnlock = subMeta?.content_at_unlock?.trim() || null;

    const isConditional = aiPermission === 'conditional' && !!contentAtUnlock;
    let mergedResults = [];

    if (isConditional) {
      const { pre, post } = splitSubmissionAtUnlock(content, contentAtUnlock);
      console.log(
        `[유사도] 조건부 분할 — submission=${submissionId} pre=${pre.length}자 post=${post.length}자`
      );

      let segmentOffset = 0;

      if (pre) {
        const preLogs = await fetchStepAiLogs(pool, participationId, stepId, false);
        const preResults = await analyzeContentSegment({
          pool,
          content: pre,
          aiLogs: preLogs,
          submissionId,
          participationId,
          stepId,
          label: '웹뷰 전',
          t0,
        });
        mergedResults.push(
          ...preResults.map((r, i) => ({ ...r, sentence_index: segmentOffset + i }))
        );
        segmentOffset += preResults.length;
      }

      if (post) {
        const postLogs = await fetchStepAiLogs(pool, participationId, stepId, true);
        const postResults = await analyzeContentSegment({
          pool,
          content: post,
          aiLogs: postLogs,
          submissionId,
          participationId,
          stepId,
          label: '웹뷰 후',
          t0,
        });
        mergedResults.push(
          ...postResults.map((r, i) => ({ ...r, sentence_index: segmentOffset + i }))
        );
      }
    } else {
      const aiLogs = await fetchStepAiLogs(pool, participationId, stepId, true);
      mergedResults = await analyzeContentSegment({
        pool,
        content,
        aiLogs,
        submissionId,
        participationId,
        stepId,
        label: '전체',
        t0,
      });
    }

    if (mergedResults.length === 0) {
      console.log(`[유사도] 저장할 결과 없음 — submission=${submissionId}`);
      return;
    }

    const saved = await saveSimilarityResults(pool, submissionId, mergedResults);
    console.log(
      `[유사도] 저장 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) — submission=${submissionId} ${saved}개 문장`
    );
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      console.error(`[유사도 타임아웃] submission=${submissionId} — AI 서비스 응답 없음 (4분 초과)`);
    } else {
      console.error(`[유사도 오류] submission=${submissionId}`, err.message);
    }
  }
}

module.exports = {
  runSimilarityAnalysis,
  splitSubmissionAtUnlock,
  fetchStepAiLogs,
  toOriginality,
};
