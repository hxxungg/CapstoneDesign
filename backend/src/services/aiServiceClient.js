/**
 * 모델 API URL — .env 우선, 기본값 NCP 프록시(101.79.18.104:8001)
 */
function getAiServiceCandidates() {
  const fromEnv = (process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001').replace(/\/$/, '');
  return [fromEnv];
}

async function aiPostJson(path, body, timeoutMs = 120000) {
  const errors = [];
  for (const base of getAiServiceCandidates()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        errors.push(`${base}${path} → ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      errors.push(`${base}${path} → ${err.message}`);
    }
  }
  console.warn(`[aiServiceClient] ${path} 실패:`, errors.join('; '));
  return null;
}

module.exports = { getAiServiceCandidates, aiPostJson };
