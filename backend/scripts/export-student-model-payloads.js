/**
 * 하승연 학생 검증용 API 페이로드 JSON 내보내기
 * (모델 서버에서 curl/스크립트로 재사용)
 * 실행: node scripts/export-student-model-payloads.js [학생이름]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/database');
const { buildStepScoringPlan } = require('../src/utils/rubricScoring');

const STUDENT_NAME = process.argv[2] || '하승연_학생test';
const OUT = path.join(__dirname, 'ha-seungyeon-model-payloads.json');

async function resolveStudent(name) {
  const [[student]] = await pool.query(
    `SELECT s.id, u.name, u.email
     FROM student_db.students s
     JOIN capstonedesign.users u ON u.id = s.user_id
     WHERE u.name = ? OR u.name LIKE ?`,
    [name, `%${name}%`]
  );
  if (!student) throw new Error(`학생 없음: ${name}`);
  return student;
}

async function main() {
  const student = await resolveStudent(STUDENT_NAME);
  const [parts] = await pool.query(
    `SELECT p.id, p.assessment_id, a.title
     FROM student_db.participations p
     JOIN teacher_db.assessments a ON p.assessment_id = a.id
     WHERE p.student_id = ? ORDER BY p.id DESC`,
    [student.id]
  );
  const participationId = parts[0].id;

  const [submissions] = await pool.query(
    `SELECT sub.id, sub.participation_id, sub.step_id, sub.content, s.step_order
     FROM log_db.submissions sub
     JOIN teacher_db.assessment_steps s ON sub.step_id = s.id
     WHERE sub.participation_id = ? AND TRIM(sub.content) != ''
     ORDER BY s.step_order LIMIT 1`,
    [participationId]
  );
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
  const [steps] = await pool.query(
    `SELECT id, step_order, title, description FROM teacher_db.assessment_steps
     WHERE assessment_id = ? ORDER BY step_order`,
    [parts[0].assessment_id]
  );
  const sub = submissions[0];
  const promptLog = aiLogs.find((l) => l.prompt?.trim());
  const samplePrompt = promptLog?.prompt?.trim() || '인공지능의 윤리적 사용에 대해 설명해줘';
  const stepPlan = buildStepScoringPlan(steps);
  const firstPlan = stepPlan?.[0];
  const criteria = firstPlan?.criteria ?? ['수행 기준을 충족했는지 평가합니다.'];

  const out = {
    student,
    participation: parts[0],
    endpoints: {
      health: { method: 'GET', path: '/health' },
      analyze: {
        method: 'POST',
        path: '/analyze',
        body: sub
          ? {
              content: sub.content.trim(),
              ai_logs: aiLogs.filter((l) => l.response?.trim()).map((l) => ({
                id: l.id,
                response: l.response,
                step_id: l.step_id,
              })),
              submission_id: sub.id,
              participation_id: sub.participation_id,
              step_id: sub.step_id,
            }
          : null,
      },
      analyze_prompt_type: { method: 'POST', path: '/analyze-prompt-type', body: { prompt: samplePrompt } },
      analyze_prompt_level: { method: 'POST', path: '/analyze-prompt-level', body: { prompt: samplePrompt } },
      score_step: {
        method: 'POST',
        path: '/score-step',
        body: sub
          ? {
              submission: sub.content.trim(),
              criteria,
              threshold: 3,
            }
          : null,
      },
      analyze_critical_use: {
        method: 'POST',
        path: '/analyze-critical-use',
        body: { prompt: samplePrompt },
      },
      match_relevance: {
        method: 'POST',
        path: '/match-relevance',
        body: {
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
          min_score: 0,
          same_step_only: false,
        },
      },
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`저장: ${OUT}`);
  console.log(`학생 id=${student.id} participation=${participationId}`);
  console.log(`AI ${aiLogs.length}건, URL ${urlLogs.length}건, 제출 ${submissions.length}건`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
