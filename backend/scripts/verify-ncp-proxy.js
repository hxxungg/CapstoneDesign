/**
 * NCP 프록시 + 6모델 API 연결 검증 (DB 불필요 — 다른 PC에서 바로 실행 가능)
 *
 * 실행:
 *   node scripts/verify-ncp-proxy.js
 *   node scripts/verify-ncp-proxy.js http://101.79.18.104:8001
 *
 * 필요: Node.js 18+ (fetch 내장)
 */
const AI_SERVICE_URL = (
  process.argv[2] ||
  process.env.AI_SERVICE_URL ||
  'http://101.79.18.104:8001'
).replace(/\/$/, '');

const TIMEOUT_MS = 120000;

function ok(label, detail) {
  console.log(`  [OK] ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function request(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
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

async function main() {
  console.log('\n=== NCP 프록시 연결 검증 (DB 불필요) ===');
  console.log(`대상: ${AI_SERVICE_URL}\n`);

  const results = { pass: 0, fail: 0 };

  const check = async (name, fn) => {
    try {
      const detail = await fn();
      ok(name, detail);
      results.pass++;
    } catch (err) {
      fail(name, err.message);
      results.fail++;
    }
  };

  await check('health GET /health', async () => {
    const r = await request('GET', '/health');
    if (!r.ok || r.data?.status !== 'ok') {
      throw new Error(JSON.stringify(r.data));
    }
    return r.data.status;
  });

  await check('① 유사도 POST /analyze', async () => {
    const r = await request('POST', '/analyze', {
      content: '인공지능은 교육 분야에서 활용될 수 있다.',
      ai_logs: [{ id: 1, response: 'AI는 교육에 도움이 됩니다.' }],
      submission_id: 0,
      participation_id: 0,
      step_id: 1,
    });
    if (!r.ok || !Array.isArray(r.data)) {
      throw new Error(`status=${r.status} body=${JSON.stringify(r.data).slice(0, 120)}`);
    }
    return `${r.data.length}건`;
  });

  await check('② 프롬프트 유형 POST /analyze-prompt-type', async () => {
    const r = await request('POST', '/analyze-prompt-type', {
      prompt: '이 주제에 대해 더 자세히 설명해줘',
    });
    if (!r.ok || !r.data?.label) {
      throw new Error(JSON.stringify(r.data));
    }
    return r.data.label;
  });

  await check('③ 프롬프트 수준 POST /analyze-prompt-level', async () => {
    const r = await request('POST', '/analyze-prompt-level', {
      prompt: '위 내용을 요약해줘',
    });
    if (!r.ok || (r.data?.level == null && r.data?.label == null)) {
      throw new Error(JSON.stringify(r.data));
    }
    return `level=${r.data.level ?? r.data.label}`;
  });

  await check('④ 루브릭 POST /score-rubric', async () => {
    const r = await request('POST', '/score-rubric', {
      instruction: '주제를 명확히 서술하고 근거를 제시하세요.',
      student_text: '인공지능은 데이터를 학습해 결과를 예측하는 기술이다.',
    });
    if (!r.ok || r.data?.score_classification == null) {
      throw new Error(JSON.stringify(r.data));
    }
    return `class=${r.data.score_classification}`;
  });

  await check('⑤ 비판적 사용 POST /analyze-critical-use', async () => {
    const r = await request('POST', '/analyze-critical-use', {
      prompt: '이 답변이 맞는지 다른 출처와 비교해서 검증해줘',
    });
    if (!r.ok || !r.data?.label_name) {
      throw new Error(JSON.stringify(r.data));
    }
    return r.data.label_name;
  });

  await check('⑥ 연관성 POST /match-relevance', async () => {
    const r = await request('POST', '/match-relevance', {
      ai_logs: [
        {
          id: 1,
          participation_id: 1,
          step_id: 1,
          prompt: '기후변화 원인',
          response: '온실가스 배출이 주요 원인입니다.',
          logged_at: '2025-01-01T10:00:00',
          complete_at: '2025-01-01T10:00:30',
        },
      ],
      url_logs: [
        {
          id: 1,
          participation_id: 1,
          step_id: 1,
          search_query: '기후변화 원인',
          visited_at: '2025-01-01T10:01:00',
          complete_at: '2025-01-01T10:01:30',
        },
      ],
      min_score: 0.0,
      same_step_only: false,
    });
    if (!r.ok || !Array.isArray(r.data)) {
      throw new Error(JSON.stringify(r.data));
    }
    return `${r.data.length}건`;
  });

  console.log(`\n결과: ${results.pass} OK / ${results.fail} FAIL`);
  if (results.fail > 0) {
    console.log('\n확인 사항:');
    console.log('  - NCP 프록시(101.79.18.104:8001) 실행 중인지');
    console.log('  - 자체 구축 서버(100.92.173.86:8001) 실행 중인지');
    console.log('  - NCP ACG/방화벽에서 이 PC IP의 8001 접근 허용 여부');
    process.exit(1);
  }
  console.log('\n다른 PC에서 NCP → 자체 구축 서버 경로가 정상입니다.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
