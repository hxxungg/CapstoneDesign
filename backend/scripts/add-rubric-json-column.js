require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../src/database');

async function main() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = 'teacher_db'
       AND TABLE_NAME = 'assessments'
       AND COLUMN_NAME = 'rubric_json'`
  );

  if (rows.length > 0) {
    console.log('rubric_json 컬럼이 이미 있습니다.');
    return;
  }

  await pool.query(
    `ALTER TABLE teacher_db.assessments
     ADD COLUMN rubric_json JSON NULL
     COMMENT '평가 설계 전체 (GradingRubricTable rubric 객체)'
     AFTER description`
  );
  console.log('rubric_json 컬럼을 추가했습니다.');
}

main()
  .catch((err) => {
    console.error('실패:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
