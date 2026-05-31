/**
 * 학생 모델 결과 초기화 후 6모델 재실행 (제출 본문 유지)
 * 사용: node scripts/rerun-student-models.js [학생이름] [--skip-reset]
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');
const { pool } = require('../src/database');

const studentArg = process.argv[2] || '하승연';
const skipReset = process.argv.includes('--skip-reset');
const scriptsDir = __dirname;

function runNode(scriptName, args = []) {
  console.log(`\n>>> node scripts/${scriptName} ${args.join(' ')}\n`);
  const result = spawnSync(process.execPath, [path.join(scriptsDir, scriptName), ...args], {
    stdio: 'inherit',
    cwd: path.join(scriptsDir, '..'),
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} 실패 (exit ${result.status})`);
  }
}

async function resolveStudent(name) {
  const [rows] = await pool.query(
    `SELECT s.id, u.name FROM student_db.students s
     JOIN capstonedesign.users u ON u.id = s.user_id
     WHERE u.name = ? OR u.name LIKE ?`,
    [name, `%${name}%`]
  );
  if (rows.length === 0) throw new Error(`학생을 찾을 수 없음: ${name}`);
  if (rows.length > 1) {
    console.log('여러 명 매칭:', rows.map((r) => `${r.name}(id=${r.id})`).join(', '));
    throw new Error('학생 이름을 더 구체적으로 지정하세요.');
  }
  return rows[0];
}

async function main() {
  const student = await resolveStudent(studentArg);
  console.log(`=== ${student.name} (student_id=${student.id}) 모델 재실행 ===`);

  const [parts] = await pool.query(
    'SELECT id, assessment_id FROM student_db.participations WHERE student_id = ? ORDER BY id',
    [student.id]
  );
  if (parts.length === 0) throw new Error('participation 없음');

  await pool.end();

  if (!skipReset) {
    runNode('reset-student-model-results.js', [studentArg]);
  }

  for (const p of parts) {
    console.log(`\n--- participation #${p.id} ---`);
    runNode('rerun-similarity.js', [String(p.id)]);
    runNode('rerun-rubric-scoring.js', [String(p.id)]);
    runNode('rerun-prompt-classification.js', [String(p.id)]);
    runNode('rerun-critical-use-classification.js', [String(p.id)]);
    runNode('rerun-relevance-matching.js', [String(p.id)]);
  }

  console.log('\n>>> node scripts/verify-6models-student.js\n');
  const verify = spawnSync(
    process.execPath,
    [path.join(scriptsDir, 'verify-6models-student.js'), studentArg],
    { stdio: 'inherit', cwd: path.join(scriptsDir, '..'), env: process.env }
  );
  process.exit(verify.status ?? 1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
