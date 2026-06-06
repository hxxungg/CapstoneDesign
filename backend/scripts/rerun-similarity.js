/**
 * 기존 submissions에 대해 유사도 분석을 재실행하는 스크립트
 * 실행: node scripts/rerun-similarity.js [participation_id]
 */
require('dotenv').config();
const { pool } = require('../src/database');
const { runSimilarityAnalysis } = require('../src/services/similarityAnalysis');

async function runSimilarityForSubmission(sub) {
  const { id: submissionId, participation_id: participationId, step_id: stepId, content } = sub;

  if (!content?.trim()) {
    console.log(`  [SKIP] submission ${submissionId}: 내용 없음`);
    return;
  }

  console.log(`  [RUN]  submission ${submissionId}: 분석 시작...`);
  await runSimilarityAnalysis(pool, content.trim(), submissionId, participationId, stepId);
}

async function runConcurrent(subs, concurrency = 3) {
  const queue = [...subs];
  let done = 0;

  async function worker() {
    while (queue.length > 0) {
      const sub = queue.shift();
      if (!sub) break;
      console.log(`→ submission #${sub.id} (participation=${sub.participation_id}, step=${sub.step_id})`);
      await runSimilarityForSubmission(sub);
      done++;
      console.log(`   진행: ${done}/${subs.length}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, subs.length) }, worker));
}

async function main() {
  const participationFilter = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  console.log('=== 유사도 재분석 스크립트 시작 ===');
  if (participationFilter) console.log(`participation_id 필터: ${participationFilter}`);

  try {
    let sql = `
      SELECT sub.id, sub.participation_id, sub.step_id, sub.content
       FROM log_db.submissions sub
       WHERE sub.content IS NOT NULL AND TRIM(sub.content) != ''`;
    const params = [];
    if (participationFilter) {
      sql += ' AND sub.participation_id = ?';
      params.push(participationFilter);
    }
    sql += ' ORDER BY sub.id ASC';

    const [subs] = await pool.query(sql, params);

    if (subs.length === 0) {
      console.log('재분석 대상 submissions 없음');
      process.exit(0);
    }

    console.log(`재분석 대상: ${subs.length}개 submissions (동시 처리: 3)\n`);

    await runConcurrent(subs, 3);

    console.log('\n=== 완료 ===');
  } catch (err) {
    console.error('스크립트 오류:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
