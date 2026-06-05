/**
 * log_db.submissions 에 content_at_unlock, browser_unlocked_at 컬럼 추가
 * node backend/scripts/add-submission-browser-unlock-columns.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../src/database');

async function main() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = 'log_db'
       AND TABLE_NAME = 'submissions'
       AND COLUMN_NAME = 'content_at_unlock'`
  );

  if (rows.length > 0) {
    console.log('content_at_unlock 컬럼이 이미 있습니다.');
    return;
  }

  await pool.query(
    `ALTER TABLE log_db.submissions
       ADD COLUMN content_at_unlock TEXT NULL,
       ADD COLUMN browser_unlocked_at DATETIME NULL`
  );
  console.log('content_at_unlock, browser_unlocked_at 컬럼을 추가했습니다.');
}

main()
  .catch((err) => {
    console.error('실패:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
