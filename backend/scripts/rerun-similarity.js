/**
 * 기존 submissions에 대해 유사도 분석을 재실행하는 스크립트
 * 실행: node scripts/rerun-similarity.js
 */
require('dotenv').config();
const { pool } = require('../src/database');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001';

function toOriginality(pct) {
  if (pct >= 70) return 'red';
  if (pct >= 40) return 'yellow';
  return 'green';
}

async function runSimilarityForSubmission(sub) {
  const { id: submissionId, participation_id: participationId, step_id: stepId, content } = sub;

  if (!content?.trim()) {
    console.log(`  [SKIP] submission ${submissionId}: 내용 없음`);
    return;
  }

  // 현재 단계 + 이전 모든 단계의 AI 응답 로그 조회
  let aiLogs = [];
  if (stepId) {
    const [[currentStep]] = await pool.query(
      `SELECT step_order FROM teacher_db.assessment_steps WHERE id = ?`, [stepId]
    );
    if (currentStep) {
      const [prevStepIds] = await pool.query(
        `SELECT s.id FROM teacher_db.assessment_steps s
         JOIN teacher_db.assessment_steps cur ON cur.id = ?
         WHERE s.assessment_id = cur.assessment_id AND s.step_order <= cur.step_order`,
        [stepId]
      );
      const ids = prevStepIds.map(r => r.id);
      [aiLogs] = await pool.query(
        `SELECT id, response, step_id FROM log_db.ai_logs
         WHERE participation_id = ? AND step_id IN (?)
           AND response IS NOT NULL AND response != ''
         ORDER BY logged_at ASC`,
        [participationId, ids]
      );
    } else {
      [aiLogs] = await pool.query(
        `SELECT id, response, step_id FROM log_db.ai_logs
         WHERE participation_id = ? AND step_id = ?
           AND response IS NOT NULL AND response != ''`,
        [participationId, stepId]
      );
    }
  } else {
    [aiLogs] = await pool.query(
      `SELECT id, response, step_id FROM log_db.ai_logs
       WHERE participation_id = ? AND response IS NOT NULL AND response != ''
       ORDER BY logged_at ASC`,
      [participationId]
    );
  }

  if (aiLogs.length === 0) {
    console.log(`  [SKIP] submission ${submissionId}: AI 응답 로그 없음 (step_id=${stepId})`);
    return;
  }

  console.log(`  [RUN]  submission ${submissionId}: AI 로그 ${aiLogs.length}개로 분석 시작...`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300000); // 5분

  try {
    const res = await fetch(`${AI_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content.trim(),
        ai_logs: aiLogs,
        submission_id: submissionId,
        participation_id: participationId,
        step_id: stepId || 0,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.log(`  [FAIL] submission ${submissionId}: AI 서비스 응답 오류 (${res.status})`);
      return;
    }

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) {
      console.log(`  [FAIL] submission ${submissionId}: 분석 결과 없음`);
      return;
    }

    // 기존 임시 행 삭제 후 모델 문장으로 교체
    await pool.query(`DELETE FROM log_db.submissions_step WHERE submission_id = ?`, [submissionId]);

    const rows = results.map(r => [
      submissionId,
      r.sentence_index,
      r.sentence,
      r.best_ai_log_id ?? null,
      r.similarity_percent,
      toOriginality(r.similarity_percent),
    ]);
    const [ins] = await pool.query(
      `INSERT INTO log_db.submissions_step
       (submission_id, segment_order, content, ai_log_id, similarity_score, originality)
       VALUES ?`,
      [rows]
    );
    let updated = ins.affectedRows;
    console.log(`  [OK]   submission ${submissionId}: ${results.length}문장 분석, ${updated}행 업데이트`);
  } catch (err) {
    clearTimeout(timer);
    console.log(`  [ERR]  submission ${submissionId}: ${err.message}`);
  }
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
  console.log(`AI_SERVICE_URL: ${AI_SERVICE_URL}`);
  if (participationFilter) console.log(`participation_id 필터: ${participationFilter}`);

  try {
    let sql = `
      SELECT sub.id, sub.participation_id, sub.step_id, ss_agg.content
       FROM log_db.submissions sub
       JOIN (
         SELECT submission_id, GROUP_CONCAT(content ORDER BY segment_order SEPARATOR ' ') AS content
         FROM log_db.submissions_step
         WHERE similarity_score IS NULL
         GROUP BY submission_id
       ) ss_agg ON sub.id = ss_agg.submission_id`;
    const params = [];
    if (participationFilter) {
      sql += ' WHERE sub.participation_id = ?';
      params.push(participationFilter);
    }
    sql += ' ORDER BY sub.id ASC';

    const [subs] = await pool.query(sql, params);

    if (subs.length === 0) {
      console.log('재분석 대상 submissions 없음 (이미 모두 분석됨)');
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
