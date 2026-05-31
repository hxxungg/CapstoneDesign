/**
 * 프롬프트 유형·수준 — DB 읽기 + 모델 호출만 (INSERT/UPDATE 없음)
 */
const { aiPostJson } = require('./aiServiceClient');

function fallbackPromptType(prompt) {
  if (!prompt) return 'info';
  const p = prompt.toLowerCase();
  if (/요약|정리|summarize|summary/.test(p)) return 'summary';
  if (/비교|차이|compare|versus|vs\.?/.test(p)) return 'compare';
  if (/예측|전망|예상|predict|forecast/.test(p)) return 'predict';
  if (/평가|분석|evaluate|assess|critique|장단점|pros|cons/.test(p)) return 'evaluate';
  if (/작성|생성|써줘|만들어|write|create|generate/.test(p)) return 'generate';
  return 'info';
}

function fallbackPromptLevel(prompt) {
  if (!prompt) return 1;
  const len = prompt.trim().length;
  if (len < 30) return 1;
  if (len < 100) return 2;
  if (len < 200) return 3;
  return 4;
}

async function classifyPromptTypeApi(prompt) {
  const data = await aiPostJson('/analyze-prompt-type', { prompt }, 30000);
  if (data?.label) return data.label;
  return fallbackPromptType(prompt);
}

async function classifyPromptLevelApi(prompt) {
  const data = await aiPostJson('/analyze-prompt-level', { prompt }, 30000);
  if (data?.level != null) return data.level;
  return fallbackPromptLevel(prompt);
}

async function enrichAiLogsPromptFields(aiLogs) {
  const logs = aiLogs.map((l) => ({ ...l }));

  await Promise.all(
    logs.map(async (log) => {
      if (!log.prompt?.trim()) return;

      if (!log.prompt_type) {
        log.prompt_type = await classifyPromptTypeApi(log.prompt);
      }
      if (log.prompt_level == null || log.prompt_level === '') {
        log.prompt_level = await classifyPromptLevelApi(log.prompt);
      }
    })
  );

  return logs;
}

/** 리포트 조회용 — DB 값만 사용, 모델 호출 없음 */
function enrichAiLogsPromptFieldsFromDb(aiLogs) {
  return aiLogs.map((log) => ({
    ...log,
    prompt_type: log.prompt_type || fallbackPromptType(log.prompt),
    prompt_level:
      log.prompt_level != null && log.prompt_level !== ''
        ? log.prompt_level
        : fallbackPromptLevel(log.prompt),
  }));
}

function aggregatePromptStats(aiLogs) {
  const types = {};
  const levels = {};
  aiLogs.forEach((l) => {
    if (!l.prompt?.trim()) return;
    const t = l.prompt_type || fallbackPromptType(l.prompt);
    types[t] = (types[t] || 0) + 1;
    const lv = String(l.prompt_level ?? 1);
    levels[lv] = (levels[lv] || 0) + 1;
  });
  return { promptTypes: types, promptLevels: levels };
}

module.exports = {
  enrichAiLogsPromptFields,
  enrichAiLogsPromptFieldsFromDb,
  aggregatePromptStats,
  fallbackPromptType,
  fallbackPromptLevel,
};
