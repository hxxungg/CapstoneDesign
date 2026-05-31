/**
 * prompt_type / prompt_level NULL인 ai_logs에 프롬프트 분류 모델 재실행
 * 사용: node scripts/rerun-prompt-classification.js [participation_id]
 */
require('dotenv').config();
const { pool } = require('../src/database');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001').replace(/\/$/, '');
const participationId = process.argv[2] ? parseInt(process.argv[2], 10) : null;

async function postJson(path, body, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function main() {
  let sql = `
    SELECT id, prompt FROM log_db.ai_logs
    WHERE prompt IS NOT NULL AND TRIM(prompt) != ''
      AND (prompt_type IS NULL OR prompt_level IS NULL)
  `;
  const params = [];
  if (participationId) {
    sql += ' AND participation_id = ?';
    params.push(participationId);
  }
  sql += ' ORDER BY id';

  const [rows] = await pool.query(sql, params);
  console.log(`대상 ${rows.length}건 (AI: ${AI_SERVICE_URL})`);

  for (const row of rows) {
    try {
      const [typeData, levelData] = await Promise.all([
        postJson('/analyze-prompt-type', { prompt: row.prompt }),
        postJson('/analyze-prompt-level', { prompt: row.prompt }),
      ]);
      const promptType = typeData?.label || 'info';
      const promptLevel = levelData?.level != null ? levelData.level : 1;
      await pool.query(
        'UPDATE log_db.ai_logs SET prompt_type = ?, prompt_level = ? WHERE id = ?',
        [promptType, promptLevel, row.id]
      );
      console.log(`  #${row.id} type=${promptType} level=${promptLevel}`);
    } catch (err) {
      console.error(`  #${row.id} FAIL: ${err.message}`);
    }
  }

  await pool.end();
  console.log('완료');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
