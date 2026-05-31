/**
 * 비판적 사용 분석 — 프롬프트 API + 연관성 매칭(웹 검색)
 */
const { aiPostJson } = require('./aiServiceClient');

/** 프롬프트 작성(logged_at) 이후에 웹 검색(visited_at)이 이뤄진 경우만 true */
function isWebSearchAfterPrompt(aiLog, urlLog) {
  if (!aiLog?.logged_at || !urlLog?.visited_at) return false;
  return new Date(urlLog.visited_at).getTime() > new Date(aiLog.logged_at).getTime();
}

function isWebSearchUrl(url) {
  if (!url) return false;
  return /google\.com\/search|bing\.com\/search|search\.naver\.com|duckduckgo\.com\/\?q=/i.test(url);
}

const AI_TOOL_SEARCH_QUERIES = new Set([
  'chatgpt', 'gpt', 'gemini', 'claude', 'copilot', 'perplexity', 'wrtn', 'clova', 'openai',
]);

function getSearchQuery(urlLog) {
  const direct = (urlLog?.search_query || '').trim();
  if (direct) return direct;
  try {
    const u = new URL(urlLog.url);
    return (u.searchParams.get('q') || u.searchParams.get('query') || '').trim();
  } catch {
    return '';
  }
}

/** Google/Naver 등 실제 정보 탐색 검색인지 (AI 도구 재접속용 검색 제외) */
function isValidWebSearchLog(urlLog) {
  if (!urlLog?.url || !isWebSearchUrl(urlLog.url)) return false;
  const q = getSearchQuery(urlLog);
  if (!q || q.length < 2) return false;
  if (AI_TOOL_SEARCH_QUERIES.has(q.toLowerCase())) return false;
  if (/^[A-Za-z0-9_-]{20,}$/.test(q)) return false;
  return true;
}

function getPostPromptWebSearches(aiLog, urlLogs) {
  return (urlLogs || []).filter(
    (u) => isValidWebSearchLog(u) && isWebSearchAfterPrompt(aiLog, u)
  );
}

function getMatchedUrlIdFromMap(relevanceMap, aiLogId) {
  const entry = relevanceMap.get(Number(aiLogId));
  if (entry == null) return null;
  if (typeof entry === 'object') return entry.related_url_log_id ?? null;
  return entry;
}

async function resolvePostPromptWebSearchId(aiLog, urlLogs, relevanceMap) {
  const candidates = getPostPromptWebSearches(aiLog, urlLogs);
  if (!candidates.length) return null;

  const matchedId = getMatchedUrlIdFromMap(relevanceMap, aiLog.id);
  if (
    matchedId != null &&
    candidates.some((u) => Number(u.id) === matchedId)
  ) {
    return matchedId;
  }

  const subMap = await fetchRelevanceByAiLogId([aiLog], candidates);
  const subId = getMatchedUrlIdFromMap(subMap, aiLog.id);
  if (subId != null && candidates.some((u) => Number(u.id) === subId)) {
    return subId;
  }
  return null;
}

function buildRelevanceMapFromDb(aiLogs) {
  const map = new Map();
  for (const log of aiLogs || []) {
    if (log.relevance_score != null || log.related_url_log_id != null) {
      map.set(Number(log.id), {
        related_url_log_id:
          log.related_url_log_id != null ? Number(log.related_url_log_id) : null,
        relevance_score:
          log.relevance_score != null ? Number(log.relevance_score) : null,
      });
    }
  }
  return map;
}

function isCriticalUseResult(data) {
  if (!data || typeof data !== 'object') return false;
  const label = data.label;
  if (label === 1 || label === '1') return true;
  const name = String(data.label_name ?? label ?? '').toLowerCase();
  if (name.includes('non-critical') || name.includes('non critical')) return false;
  if (name.includes('critical')) return true;
  return false;
}

function isCriticalUseFromDbRow(log) {
  if (log?.critical_label == null || log.critical_label === '') return null;
  return isCriticalUseResult({
    label: log.critical_label,
    label_name: log.critical_label_name,
  });
}

async function classifyCriticalUse(prompt, log = null) {
  const fromDb = isCriticalUseFromDbRow(log);
  if (fromDb != null) return fromDb;
  if (!prompt?.trim()) return false;
  const data = await aiPostJson('/analyze-critical-use', { prompt: prompt.trim() }, 30000);
  return isCriticalUseResult(data);
}

async function fetchRelevanceByAiLogId(aiLogs, urlLogs) {
  if (!aiLogs?.length) return new Map();

  const aiPayload = aiLogs.map((l) => ({
    id: l.id,
    participation_id: l.participation_id,
    step_id: l.step_id,
    prompt: l.prompt || '',
    response: l.response || '',
    logged_at: l.logged_at,
    complete_at: l.complete_at ?? l.logged_at,
  }));

  const urlPayload = (urlLogs || []).map((l) => ({
    id: l.id,
    participation_id: l.participation_id,
    step_id: l.step_id,
    search_query: l.search_query || '',
    visited_at: l.visited_at,
    complete_at: l.complete_at,
  }));

  try {
    const rows = await aiPostJson(
      '/match-relevance',
      {
        ai_logs: aiPayload,
        url_logs: urlPayload,
        min_score: 0,
        same_step_only: false,
      },
      120000
    );
    if (!Array.isArray(rows)) return new Map();

    const map = new Map();
    for (const row of rows) {
      if (row.id == null) continue;
      map.set(Number(row.id), {
        related_url_log_id:
          row.related_url_log_id != null ? Number(row.related_url_log_id) : null,
        relevance_score:
          row.relevance_score != null ? Number(row.relevance_score) : null,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * ai_logs에 critical_use_verification, critical_use_web 부여 + summary 집계
 */
async function enrichAiLogsWithCriticalUse(aiLogs, urlLogs) {
  const logs = aiLogs.map((l) => ({ ...l }));
  let relevanceMap = buildRelevanceMapFromDb(logs);

  const needsFetch = logs.some(
    (l) => l.relevance_score == null && l.related_url_log_id == null
  );
  if (needsFetch) {
    const apiMap = await fetchRelevanceByAiLogId(logs, urlLogs);
    for (const [id, val] of apiMap) {
      relevanceMap.set(id, val);
    }
  }

  await Promise.all(
    logs.map(async (log) => {
      const match = relevanceMap.get(Number(log.id));
      if (match && log.relevance_score == null && log.related_url_log_id == null) {
        log.related_url_log_id = match.related_url_log_id;
        log.relevance_score = match.relevance_score;
      }

      const relatedUrlId = await resolvePostPromptWebSearchId(log, urlLogs, relevanceMap);
      const hasWeb = relatedUrlId != null;

      let hasVerification = false;
      if (log.prompt?.trim()) {
        hasVerification = await classifyCriticalUse(log.prompt, log);
      }
      log.critical_use_verification = hasVerification;
      log.critical_use_web = hasWeb;
    })
  );

  const withPrompt = logs.filter((l) => l.prompt?.trim());
  const totalPrompts = withPrompt.length;
  const criticalIds = new Set();
  withPrompt.forEach((l) => {
    if (l.critical_use_verification || l.critical_use_web) {
      criticalIds.add(l.id);
    }
  });

  return {
    aiLogs: logs,
    criticalUseSummary: {
      total_prompts: totalPrompts,
      critical_count: criticalIds.size,
      non_critical_count: Math.max(0, totalPrompts - criticalIds.size),
      verification_count: withPrompt.filter((l) => l.critical_use_verification).length,
      web_search_count: withPrompt.filter((l) => l.critical_use_web).length,
    },
  };
}

function resolvePostPromptWebSearchIdFromDb(aiLog, urlLogs, relevanceMap) {
  const matchedId = getMatchedUrlIdFromMap(relevanceMap, aiLog.id);
  if (matchedId == null) return null;
  const candidates = getPostPromptWebSearches(aiLog, urlLogs);
  return candidates.some((u) => Number(u.id) === matchedId) ? matchedId : null;
}

/** 리포트 조회용 — DB에 저장된 분석 결과만 사용, 모델 호출 없음 */
function enrichAiLogsWithCriticalUseFromDb(aiLogs, urlLogs) {
  const logs = aiLogs.map((l) => ({ ...l }));
  const relevanceMap = buildRelevanceMapFromDb(logs);

  for (const log of logs) {
    const match = relevanceMap.get(Number(log.id));
    if (match && log.relevance_score == null && log.related_url_log_id == null) {
      log.related_url_log_id = match.related_url_log_id;
      log.relevance_score = match.relevance_score;
    }

    const relatedUrlId = resolvePostPromptWebSearchIdFromDb(log, urlLogs, relevanceMap);
    const hasWeb = relatedUrlId != null;
    const fromDb = isCriticalUseFromDbRow(log);
    const hasVerification = fromDb != null ? fromDb : false;

    log.critical_use_verification = hasVerification;
    log.critical_use_web = hasWeb;
  }

  const withPrompt = logs.filter((l) => l.prompt?.trim());
  const totalPrompts = withPrompt.length;
  const criticalIds = new Set();
  withPrompt.forEach((l) => {
    if (l.critical_use_verification || l.critical_use_web) {
      criticalIds.add(l.id);
    }
  });

  return {
    aiLogs: logs,
    criticalUseSummary: {
      total_prompts: totalPrompts,
      critical_count: criticalIds.size,
      non_critical_count: Math.max(0, totalPrompts - criticalIds.size),
      verification_count: withPrompt.filter((l) => l.critical_use_verification).length,
      web_search_count: withPrompt.filter((l) => l.critical_use_web).length,
    },
  };
}

module.exports = {
  isCriticalUseResult,
  isWebSearchAfterPrompt,
  isValidWebSearchLog,
  classifyCriticalUse,
  fetchRelevanceByAiLogId,
  enrichAiLogsWithCriticalUse,
  enrichAiLogsWithCriticalUseFromDb,
};
