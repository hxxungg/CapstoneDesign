const AI_MODES = new Set(['disallowed', 'conditional', 'allowed']);

function resolveAiMode(stage) {
  if (stage && AI_MODES.has(stage.ai_mode)) return stage.ai_mode;
  return stage?.ai_allowed ? 'allowed' : 'disallowed';
}

/** API 응답용: ai_mode 보정 + ai_allowed 동기화 */
function normalizeStage(stage) {
  if (!stage) return stage;
  const ai_mode = resolveAiMode(stage);
  return { ...stage, ai_mode, ai_allowed: ai_mode !== 'disallowed', ai_tools: [] };
}

function normalizeAiModeFromBody(body) {
  if (body && AI_MODES.has(body.ai_mode)) return body.ai_mode;
  if (body && body.ai_allowed !== undefined) return body.ai_allowed ? 'allowed' : 'disallowed';
  return 'disallowed';
}

module.exports = { normalizeStage, normalizeAiModeFromBody, resolveAiMode };
