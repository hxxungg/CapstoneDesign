/**
 * 김교사 / 진로 글쓰기 수행평가 조회
 * node scripts/find-career-assessment.js
 */
require('dotenv').config();
const { pool } = require('../src/database');

async function main() {
  const [assessments] = await pool.query(
    `SELECT a.id AS assessment_id, a.title, a.status, a.invite_code, a.deadline,
            u.name AS teacher_name, t.id AS teacher_id
     FROM teacher_db.assessments a
     JOIN teacher_db.teachers t ON a.teacher_id = t.id
     JOIN capstonedesign.users u ON t.user_id = u.id
     WHERE u.name LIKE '%김%' OR a.title LIKE '%진로%'
     ORDER BY a.id DESC`
  );

  console.log('=== 수행평가 ===');
  console.table(assessments);

  if (assessments.length === 0) {
    process.exit(0);
  }

  const ids = assessments.map((a) => a.assessment_id);
  const [parts] = await pool.query(
    `SELECT p.id AS participation_id, p.assessment_id, u.name AS student_name,
            p.status, p.current_step, p.consent_given
     FROM student_db.participations p
     JOIN student_db.students s ON p.student_id = s.id
     JOIN capstonedesign.users u ON s.user_id = u.id
     WHERE p.assessment_id IN (?)
     ORDER BY p.id DESC`,
    [ids]
  );

  console.log('\n=== 참여(participation) ===');
  console.table(parts);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
