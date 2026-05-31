/**
 * 하승연 학생 — 비판적 사용 UI 데이터 검증 (전체 participation)
 * 실행: node scripts/verify-critical-use-student.js [학생이름]
 */
require('dotenv').config();
const { pool } = require('../src/database');
const { enrichAiLogsWithCriticalUse } = require('../src/services/criticalUseAnalysis');

const STUDENT_NAME = process.argv[2] || '하승연_학생test';
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001').replace(/\/$/, '');

async function checkApiHealth() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function resolveStudent(name) {
  const [[student]] = await pool.query(
    `SELECT s.id, u.name, u.email
     FROM student_db.students s
     JOIN capstonedesign.users u ON u.id = s.user_id
     WHERE u.name = ? OR u.name LIKE ? OR u.email = ?`,
    [name, `%${name}%`, name]
  );
  if (!student) throw new Error(`학생을 찾을 수 없음: ${name}`);
  return student;
}

async function loadParticipationLogs(participationId) {
  const [aiLogs] = await pool.query(
    `SELECT id, participation_id, step_id, prompt, response, logged_at, complete_at, prompt_type, prompt_level
     FROM log_db.ai_logs WHERE participation_id = ? ORDER BY logged_at`,
    [participationId]
  );
  const [urlLogs] = await pool.query(
    `SELECT id, participation_id, step_id, search_query, visited_at, complete_at
     FROM log_db.url_logs WHERE participation_id = ? ORDER BY visited_at`,
    [participationId]
  );
  return { aiLogs, urlLogs };
}

async function main() {
  console.log(`\n=== 비판적 사용 UI 검증 — ${STUDENT_NAME} ===`);
  console.log(`AI_SERVICE_URL=${AI_SERVICE_URL}\n`);

  const health = await checkApiHealth();
  if (health.ok) {
    console.log(`[OK] API health — ${JSON.stringify(health.data)}`);
  } else {
    console.log(`[FAIL] API health — ${health.error ?? 'unknown'}`);
    console.log('  → NCP 프록시(101.79.18.104:8001) 및 자체 구축 서버 상태 확인');
    process.exitCode = 1;
    return;
  }

  const student = await resolveStudent(STUDENT_NAME);
  const [participations] = await pool.query(
    `SELECT p.id, p.assessment_id, a.title
     FROM student_db.participations p
     JOIN teacher_db.assessments a ON p.assessment_id = a.id
     WHERE p.student_id = ?
     ORDER BY p.id ASC`,
    [student.id]
  );

  console.log(`학생 ID=${student.id} (${student.name}), participation ${participations.length}건\n`);

  let pass = 0;
  let fail = 0;

  for (const p of participations) {
    console.log(`--- participation=${p.id} (${p.title}) ---`);
    const { aiLogs, urlLogs } = await loadParticipationLogs(p.id);
    console.log(`  AI ${aiLogs.length}건, URL ${urlLogs.length}건`);

    try {
      const t0 = Date.now();
      const { aiLogs: enriched, criticalUseSummary } = await enrichAiLogsWithCriticalUse(aiLogs, urlLogs);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      console.log(`  [OK] enrich ${elapsed}s — summary: ${JSON.stringify(criticalUseSummary)}`);
      enriched.forEach((log) => {
        const tags = [];
        if (log.critical_use_verification) tags.push('검증질문');
        if (log.critical_use_web) tags.push('웹검색');
        const preview = (log.prompt || '').slice(0, 40);
        console.log(
          `    ai_log=${log.id} "${preview}"` +
            (tags.length ? ` → [${tags.join(', ')}]` : ' → (태그 없음)')
        );
      });

      const pie = criticalUseSummary;
      if (pie.total_prompts > 0) {
        const pct = ((pie.critical_count / pie.total_prompts) * 100).toFixed(0);
        console.log(`  파이차트: 비판적 ${pie.critical_count}/${pie.total_prompts} (${pct}%), 기타 ${pie.non_critical_count}`);
      } else {
        console.log('  파이차트: 프롬프트 없음');
      }
      pass++;
    } catch (err) {
      console.log(`  [FAIL] ${err.message}`);
      fail++;
    }
    console.log('');
  }

  console.log(`=== 결과: PASS ${pass} / FAIL ${fail} (총 ${participations.length}건) ===\n`);
  if (fail > 0) process.exitCode = 1;
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
