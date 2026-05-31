require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/database');

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../sql/step_compliance_scores.sql'),
    'utf8',
  );
  await pool.query(sql);
  console.log('step_compliance_scores 테이블 준비 완료');
}

main()
  .catch((err) => {
    console.error('실패:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
