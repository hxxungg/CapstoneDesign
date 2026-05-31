/**
 * critical_label NULL인 ai_logs에 비판적 사용 모델 재분류
 * 사용: node scripts/rerun-critical-use-classification.js [participation_id]
 */
require('dotenv').config();
const { pool } = require('../src/database');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001').replace(/\/$/, '');
const participationId = process.argv[2] ? parseInt(process.argv[2], 10) : null;

async function classifyCriticalUseApi(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${AI_SERVICE_URL}/analyze-critical-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim() }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const label = Number(data.label);
    if (Number.isNaN(label)) throw new Error('invalid label');
    return {
      label,
      label_name: String(data.label_name || (label === 1 ? 'Critical Use' : 'Non-Critical Use')).slice(0, 50),
      confidence: data.confidence != null ? Number(data.confidence) : null,
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function main() {
  let sql = `
    SELECT id, prompt FROM log_db.ai_logs
    WHERE critical_label IS NULL AND prompt IS NOT NULL AND TRIM(prompt) != ''
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
      const result = await classifyCriticalUseApi(row.prompt);
      await pool.query(
        `UPDATE log_db.ai_logs
         SET critical_label = ?, critical_label_name = ?, critical_confidence = ?
         WHERE id = ?`,
        [result.label, result.label_name, result.confidence, row.id]
      );
      console.log(`  #${row.id} label=${result.label} conf=${result.confidence}`);
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
