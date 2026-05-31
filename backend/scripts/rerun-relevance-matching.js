/**
 * ai_logs 연관성 매칭 재실행 → related_url_log_id, relevance_score 저장
 * 사용: node scripts/rerun-relevance-matching.js [participation_id]
 */
require('dotenv').config();
const { pool } = require('../src/database');
const { runRelevanceMatchingForParticipation } = require('../src/services/relevanceMatchingService');

const participationId = process.argv[2] ? parseInt(process.argv[2], 10) : null;

async function main() {
  let pids;
  if (participationId) {
    pids = [participationId];
  } else {
    const [rows] = await pool.query(`
      SELECT DISTINCT al.participation_id AS id
      FROM log_db.ai_logs al
      ORDER BY al.participation_id
    `);
    pids = rows.map((r) => r.id);
  }

  console.log(`대상 participation ${pids.length}건`);
  let totalUpdated = 0;
  let totalMatched = 0;

  for (const pid of pids) {
    try {
      const { updated, matched } = await runRelevanceMatchingForParticipation(pid);
      totalUpdated += updated;
      totalMatched += matched;
    } catch (err) {
      console.error(`  participation=${pid} FAIL: ${err.message}`);
    }
  }

  await pool.end();
  console.log(`완료 — updated=${totalUpdated} matched=${totalMatched}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
