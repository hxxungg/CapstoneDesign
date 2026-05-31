/**
 * 학생의 모든 participation에 대해 연관성 매칭 검증
 * 실행: node scripts/verify-relevance-all-participations.js [학생이름]
 */
require('dotenv').config();
const { pool } = require('../src/database');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001').replace(/\/$/, '');
const STUDENT_NAME = process.argv[2] || '하승연_학생test';
const TIMEOUT_MS = 180000;

async function postMatchRelevance(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_SERVICE_URL}/match-relevance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveStudent(name) {
  const [[student]] = await pool.query(
    `SELECT s.id, u.name
     FROM student_db.students s
     JOIN capstonedesign.users u ON u.id = s.user_id
     WHERE u.name = ? OR u.name LIKE ?`,
    [name, `%${name}%`]
  );
  if (!student) throw new Error(`학생 없음: ${name}`);
  return student;
}

async function loadParticipationLogs(participationId) {
  const [aiLogs] = await pool.query(
    `SELECT id, participation_id, step_id, prompt, response, logged_at, complete_at
     FROM log_db.ai_logs WHERE participation_id = ? ORDER BY logged_at`,
    [participationId]
  );
  const [urlLogs] = await pool.query(
    `SELECT id, participation_id, step_id, search_query, visited_at, complete_at
     FROM log_db.url_logs WHERE participation_id = ? ORDER BY visited_at`,
    [participationId]
  );
  const [submissions] = await pool.query(
    `SELECT sub.id, s.step_order, s.title
     FROM log_db.submissions sub
     JOIN teacher_db.assessment_steps s ON sub.step_id = s.id
     WHERE sub.participation_id = ? AND TRIM(sub.content) != ''
     ORDER BY s.step_order`,
    [participationId]
  );
  return { aiLogs, urlLogs, submissions };
}

function buildPayload(aiLogs, urlLogs) {
  return {
    ai_logs: aiLogs.map((l) => ({
      id: l.id,
      participation_id: l.participation_id,
      step_id: l.step_id,
      prompt: l.prompt || '',
      response: l.response || '',
      logged_at: l.logged_at,
      complete_at: l.complete_at ?? l.logged_at,
    })),
    url_logs: urlLogs.map((l) => ({
      id: l.id,
      participation_id: l.participation_id,
      step_id: l.step_id,
      search_query: l.search_query || '',
      visited_at: l.visited_at,
      complete_at: l.complete_at,
    })),
    min_score: 0.0,
    same_step_only: false,
  };
}

async function main() {
  console.log(`\n=== 연관성 매칭 — 전체 participation 검증 ===`);
  console.log(`API: ${AI_SERVICE_URL}`);
  console.log(`학생: ${STUDENT_NAME}\n`);

  const student = await resolveStudent(STUDENT_NAME);
  const [participations] = await pool.query(
    `SELECT p.id, a.title
     FROM student_db.participations p
     JOIN teacher_db.assessments a ON p.assessment_id = a.id
     WHERE p.student_id = ?
     ORDER BY p.id ASC`,
    [student.id]
  );

  console.log(`학생 ID=${student.id}, participation ${participations.length}건\n`);

  let pass = 0;
  let fail = 0;
  let skip = 0;

  for (const p of participations) {
    console.log(`--- participation=${p.id} (${p.title}) ---`);
    const { aiLogs, urlLogs, submissions } = await loadParticipationLogs(p.id);
    console.log(`  제출 ${submissions.length}건, AI ${aiLogs.length}건, URL ${urlLogs.length}건`);

    if (aiLogs.length === 0) {
      console.log('  [SKIP] AI 로그 없음\n');
      skip++;
      continue;
    }

    try {
      const r = await postMatchRelevance(buildPayload(aiLogs, urlLogs));
      if (!r.ok || !Array.isArray(r.data)) {
        console.log(`  [FAIL] status=${r.status} ${JSON.stringify(r.data).slice(0, 120)}\n`);
        fail++;
        continue;
      }

      const matched = r.data.filter((row) => row.related_url_log_id != null);
      console.log(`  [OK] API 200 — AI ${r.data.length}건, 매칭 ${matched.length}건`);
      for (const row of r.data) {
        const ai = aiLogs.find((l) => l.id === row.id);
        const prompt = (ai?.prompt || '').slice(0, 30);
        if (row.related_url_log_id != null) {
          const url = urlLogs.find((u) => u.id === row.related_url_log_id);
          console.log(
            `    · AI#${row.id} "${prompt}" → URL#${row.related_url_log_id} ` +
              `"${(url?.search_query || '').slice(0, 40)}" score=${row.relevance_score}`
          );
        } else {
          console.log(`    · AI#${row.id} "${prompt}" → 매칭 없음`);
        }
      }
      console.log('');
      pass++;
    } catch (err) {
      console.log(`  [FAIL] ${err.message}\n`);
      fail++;
    }
  }

  console.log(`=== 결과: PASS ${pass} / FAIL ${fail} / SKIP ${skip} (총 ${participations.length}건) ===\n`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
