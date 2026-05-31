/**
 * AI 로그 ↔ URL 로그 연관성 매칭 (/match-relevance) → ai_logs.related_url_log_id, relevance_score 저장
 */
const { pool } = require('../database');
const { aiPostJson } = require('./aiServiceClient');

function toAiPayload(rows) {
  return (rows || []).map((l) => ({
    id: l.id,
    participation_id: l.participation_id,
    step_id: l.step_id,
    prompt: l.prompt || '',
    response: l.response || '',
    logged_at: l.logged_at,
    complete_at: l.complete_at ?? l.logged_at,
  }));
}

function toUrlPayload(rows) {
  return (rows || []).map((l) => ({
    id: l.id,
    participation_id: l.participation_id,
    step_id: l.step_id,
    search_query: l.search_query || '',
    visited_at: l.visited_at,
    complete_at: l.complete_at,
  }));
}

async function callMatchRelevance(aiLogs, urlLogs) {
  if (!aiLogs?.length) return [];
  const rows = await aiPostJson(
    '/match-relevance',
    {
      ai_logs: toAiPayload(aiLogs),
      url_logs: toUrlPayload(urlLogs),
      min_score: 0,
      same_step_only: false,
    },
    120000
  );
  return Array.isArray(rows) ? rows : [];
}

async function persistRelevanceRows(matchRows) {
  if (!matchRows?.length) return 0;
  let updated = 0;
  for (const row of matchRows) {
    if (row.id == null) continue;
    const urlId = row.related_url_log_id != null ? Number(row.related_url_log_id) : null;
    const score = row.relevance_score != null ? Number(row.relevance_score) : null;
    await pool.query(
      `UPDATE log_db.ai_logs
       SET related_url_log_id = ?, relevance_score = ?
       WHERE id = ?`,
      [urlId, score, row.id]
    );
    updated += 1;
  }
  return updated;
}

async function runRelevanceMatchingForParticipation(participationId) {
  const pid = Number(participationId);
  if (!pid) return { updated: 0, matched: 0 };

  const [aiLogs] = await pool.query(
    'SELECT * FROM log_db.ai_logs WHERE participation_id = ? ORDER BY id',
    [pid]
  );
  if (!aiLogs.length) return { updated: 0, matched: 0 };

  const [urlLogs] = await pool.query(
    'SELECT * FROM log_db.url_logs WHERE participation_id = ? ORDER BY id',
    [pid]
  );

  const matchRows = await callMatchRelevance(aiLogs, urlLogs);
  const updated = await persistRelevanceRows(matchRows);
  const matched = matchRows.filter((r) => r.related_url_log_id != null).length;
  console.log(
    `[relevance] participation=${pid} ai=${aiLogs.length} url=${urlLogs.length} updated=${updated} matched=${matched}`
  );
  return { updated, matched };
}

const pending = new Map();

/** AI/URL 로그 저장 직후 비동기 매칭 (bulk 시 debounce) */
function scheduleRelevanceMatching(participationId) {
  const pid = Number(participationId);
  if (!pid) return;

  if (pending.has(pid)) clearTimeout(pending.get(pid));
  pending.set(
    pid,
    setTimeout(() => {
      pending.delete(pid);
      runRelevanceMatchingForParticipation(pid).catch((err) => {
        console.error(`[relevance] participation=${pid} FAIL:`, err.message);
      });
    }, 2000)
  );
}

module.exports = {
  callMatchRelevance,
  persistRelevanceRows,
  runRelevanceMatchingForParticipation,
  scheduleRelevanceMatching,
};
