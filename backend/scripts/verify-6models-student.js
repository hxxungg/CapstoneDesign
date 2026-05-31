/**
 * 6개 모델 API를 특정 학생 데이터로 검증
 * 실행: node scripts/verify-6models-student.js [학생이름]
 */
require('dotenv').config();
const { pool } = require('../src/database');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://101.79.18.104:8001').replace(/\/$/, '');
const STUDENT_NAME = process.argv[2] || '하승연_학생test';
const TIMEOUT_MS = 180000;

async function postJson(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function getHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: controller.signal });
    const data = await res.json();
    return { ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

function ok(label, detail) {
  console.log(`  [OK] ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function fetchStudentContext(name) {
  const [[student]] = await pool.query(
    `SELECT s.id, u.name, u.email
     FROM student_db.students s
     JOIN capstonedesign.users u ON u.id = s.user_id
     WHERE u.name = ? OR u.name LIKE ? OR u.email = ?`,
    [name, `%${name}%`, name]
  );
  if (!student) throw new Error(`학생을 찾을 수 없음: ${name}`);

  const [participations] = await pool.query(
    `SELECT p.id, p.assessment_id, a.title
     FROM student_db.participations p
     JOIN teacher_db.assessments a ON p.assessment_id = a.id
     WHERE p.student_id = ?
     ORDER BY p.id DESC`,
    [student.id]
  );
  if (!participations.length) throw new Error('참여 기록 없음');

  const participationId = participations[0].id;

  const [submissions] = await pool.query(
    `SELECT sub.id, sub.participation_id, sub.step_id, sub.content, s.step_order
     FROM log_db.submissions sub
     JOIN teacher_db.assessment_steps s ON sub.step_id = s.id
     WHERE sub.participation_id = ?
       AND sub.content IS NOT NULL AND TRIM(sub.content) != ''
     ORDER BY s.step_order ASC
     LIMIT 1`,
    [participationId]
  );

  const [aiLogs] = await pool.query(
    `SELECT id, participation_id, step_id, prompt, response, logged_at, complete_at
     FROM log_db.ai_logs
     WHERE participation_id = ?
     ORDER BY logged_at ASC`,
    [participationId]
  );

  const [urlLogs] = await pool.query(
    `SELECT id, participation_id, step_id, search_query, visited_at, complete_at
     FROM log_db.url_logs
     WHERE participation_id = ?
     ORDER BY visited_at ASC`,
    [participationId]
  );

  const [[assessment]] = await pool.query(
    `SELECT rubric_json FROM teacher_db.assessments WHERE id = ?`,
    [participations[0].assessment_id]
  );

  const [steps] = await pool.query(
    `SELECT id, step_order, title, description
     FROM teacher_db.assessment_steps
     WHERE assessment_id = ?
     ORDER BY step_order ASC`,
    [participations[0].assessment_id]
  );

  return {
    student,
    participation: participations[0],
    allParticipations: participations,
    submission: submissions[0] || null,
    aiLogs,
    urlLogs,
    rubricJson: assessment?.rubric_json ?? null,
    steps,
  };
}

function buildRubricInstruction(steps, rubricJson) {
  const step = steps[0];
  if (!step) return null;
  let instruction = [step.title, step.description].filter(Boolean).join('\n');
  if (rubricJson) {
    try {
      const rubric = typeof rubricJson === 'string' ? JSON.parse(rubricJson) : rubricJson;
      if (rubric?.criteria?.length) {
        instruction += '\n\n' + rubric.criteria.map((c) => `- ${c.name}: ${c.description || ''}`).join('\n');
      }
    } catch {
      /* ignore */
    }
  }
  return instruction.trim() || null;
}

async function main() {
  console.log(`\n=== 6모델 API 검증 ===`);
  console.log(`API: ${AI_SERVICE_URL}`);
  console.log(`학생: ${STUDENT_NAME}\n`);

  let ctx;
  try {
    ctx = await fetchStudentContext(STUDENT_NAME);
  } catch (err) {
    console.error('DB 조회 실패:', err.message);
    process.exit(1);
  }

  console.log(`학생 ID=${ctx.student.id} (${ctx.student.name || STUDENT_NAME})`);
  console.log(`참여 ${ctx.allParticipations.length}건 — 검증 대상 participation=${ctx.participation.id} (${ctx.participation.title})`);
  console.log(`제출 ${ctx.submission ? 1 : 0}건, AI로그 ${ctx.aiLogs.length}건, URL로그 ${ctx.urlLogs.length}건\n`);

  const results = { pass: 0, fail: 0, skip: 0 };

  // 0. health
  try {
    const h = await getHealth();
    if (h.ok && h.data?.status === 'ok') {
      ok('health', h.data.status);
      results.pass++;
    } else {
      fail('health', JSON.stringify(h.data));
      results.fail++;
    }
  } catch (err) {
    fail('health', err.message);
    results.fail++;
  }

  // 1. 유사도 /analyze
  if (ctx.submission && ctx.aiLogs.some((l) => l.response?.trim())) {
    const aiForSim = ctx.aiLogs.filter((l) => l.response?.trim()).map((l) => ({
      id: l.id,
      response: l.response,
      step_id: l.step_id,
    }));
    try {
      const r = await postJson('/analyze', {
        content: ctx.submission.content.trim(),
        ai_logs: aiForSim,
        submission_id: ctx.submission.id,
        participation_id: ctx.submission.participation_id,
        step_id: ctx.submission.step_id,
      });
      if (r.ok && Array.isArray(r.data) && r.data.length > 0) {
        const sample = r.data[0];
        ok(
          '① 유사도 /analyze',
          `${r.data.length}문장, 첫 문장 sim=${sample.similarity_percent ?? sample.similarity_score ?? '?'}%`
        );
        results.pass++;
      } else {
        fail('① 유사도 /analyze', `status=${r.status} body=${JSON.stringify(r.data).slice(0, 200)}`);
        results.fail++;
      }
    } catch (err) {
      fail('① 유사도 /analyze', err.message);
      results.fail++;
    }
  } else {
    console.log('  [SKIP] ① 유사도 — 제출 또는 AI 응답 없음');
    results.skip++;
  }

  const promptLog = ctx.aiLogs.find((l) => l.prompt?.trim());
  const samplePrompt = promptLog?.prompt?.trim() || '인공지능의 윤리적 사용에 대해 설명해줘';

  // 2. 프롬프트 유형
  try {
    const r = await postJson('/analyze-prompt-type', { prompt: samplePrompt });
    if (r.ok && r.data?.label != null) {
      ok('② 프롬프트 유형 /analyze-prompt-type', `label=${r.data.label} conf=${r.data.confidence}`);
      results.pass++;
    } else {
      fail('② 프롬프트 유형', `status=${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
      results.fail++;
    }
  } catch (err) {
    fail('② 프롬프트 유형', err.message);
    results.fail++;
  }

  // 3. 프롬프트 수준
  try {
    const r = await postJson('/analyze-prompt-level', { prompt: samplePrompt });
    const level = r.data?.level ?? r.data?.label;
    if (r.ok && level != null) {
      ok('③ 프롬프트 수준 /analyze-prompt-level', `level=${level} conf=${r.data.confidence}`);
      results.pass++;
    } else {
      fail('③ 프롬프트 수준', `status=${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
      results.fail++;
    }
  } catch (err) {
    fail('③ 프롬프트 수준', err.message);
    results.fail++;
  }

  // 4. 루브릭 채점
  const instruction = buildRubricInstruction(ctx.steps, ctx.rubricJson);
  const studentText = ctx.submission?.content?.trim();
  if (instruction && studentText) {
    try {
      const r = await postJson('/score-rubric', { instruction, student_text: studentText });
      if (r.ok && (r.data?.score_classification != null || r.data?.score_regression != null)) {
        ok(
          '④ 루브릭 /score-rubric',
          `class=${r.data.score_classification} reg=${r.data.score_regression}`
        );
        results.pass++;
      } else {
        fail('④ 루브릭', `status=${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
        results.fail++;
      }
    } catch (err) {
      fail('④ 루브릭', err.message);
      results.fail++;
    }
  } else {
    console.log('  [SKIP] ④ 루브릭 — instruction 또는 제출 없음');
    results.skip++;
  }

  // 5. 비판적 사용
  try {
    const r = await postJson('/analyze-critical-use', { prompt: samplePrompt });
    if (r.ok && (r.data?.label_name != null || r.data?.label != null)) {
      ok(
        '⑤ 비판적 사용 /analyze-critical-use',
        `label=${r.data.label_name ?? r.data.label} conf=${r.data.confidence}`
      );
      results.pass++;
    } else if (r.status === 404) {
      fail('⑤ 비판적 사용', '엔드포인트 없음 (404) — 모델 API app.py 확인 필요');
      results.fail++;
    } else {
      fail('⑤ 비판적 사용', `status=${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
      results.fail++;
    }
  } catch (err) {
    fail('⑤ 비판적 사용', err.message);
    results.fail++;
  }

  // 6. 연관성 매칭
  if (ctx.aiLogs.length > 0) {
    const aiPayload = ctx.aiLogs.map((l) => ({
      id: l.id,
      participation_id: l.participation_id,
      step_id: l.step_id,
      prompt: l.prompt || '',
      response: l.response || '',
      logged_at: l.logged_at,
      complete_at: l.complete_at ?? l.logged_at,
    }));
    const urlPayload = ctx.urlLogs.map((l) => ({
      id: l.id,
      participation_id: l.participation_id,
      step_id: l.step_id,
      search_query: l.search_query || '',
      visited_at: l.visited_at,
      complete_at: l.complete_at,
    }));
    try {
      const r = await postJson('/match-relevance', {
        ai_logs: aiPayload,
        url_logs: urlPayload,
        min_score: 0.0,
        same_step_only: false,
      });
      if (r.ok && Array.isArray(r.data)) {
        const matched = r.data.filter((row) => row.related_url_log_id != null).length;
        ok('⑥ 연관성 /match-relevance', `${r.data.length}건 AI로그, 매칭 ${matched}건`);
        results.pass++;
      } else if (r.status === 404) {
        fail('⑥ 연관성', '엔드포인트 없음 (404) — 모델 API app.py 확인 필요');
        results.fail++;
      } else {
        fail('⑥ 연관성', `status=${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
        results.fail++;
      }
    } catch (err) {
      fail('⑥ 연관성', err.message);
      results.fail++;
    }
  } else {
    console.log('  [SKIP] ⑥ 연관성 — AI 로그 없음');
    results.skip++;
  }

  console.log(`\n=== 결과: PASS ${results.pass} / FAIL ${results.fail} / SKIP ${results.skip} ===\n`);
  await pool.end();
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
