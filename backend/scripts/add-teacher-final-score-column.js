require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../src/database');

async function main() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = 'student_db'
       AND TABLE_NAME = 'participations'
       AND COLUMN_NAME = 'teacher_final_score'`
  );

  if (rows.length > 0) {
    console.log('teacher_final_score 컬럼이 이미 있습니다.');
    return;
  }

  await pool.query(
    `ALTER TABLE student_db.participations
     ADD COLUMN teacher_final_score VARCHAR(32) NULL
     COMMENT '교사 입력 최종 점수'
     AFTER status`
  );
  console.log('teacher_final_score 컬럼을 추가했습니다.');
}

main()
  .catch((err) => {
    console.error('실패:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
