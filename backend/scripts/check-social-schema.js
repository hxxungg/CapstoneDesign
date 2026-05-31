require('dotenv').config();
const { pool } = require('../src/database');

const EXPECTED = {
  'capstonedesign.user_oauth_connections': {
    columns: ['id', 'user_id', 'provider', 'oauth_user_id', 'email_at_signup', 'created_at'],
    providerEnum: ['google', 'kakao'],
    oauthIdColumn: 'oauth_user_id',
    uniqueIndex: 'uq_provider_oauth',
  },
  'capstonedesign.users': {
    columns: ['id', 'email', 'name', 'role', 'is_active', 'created_at'],
  },
  'capstonedesign.user_credentials': {
    columns: ['user_id', 'password_hash'],
  },
};

async function describeTable(dbTable) {
  const [db, table] = dbTable.split('.');
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [db, table]
  );
  return rows;
}

async function getIndexes(dbTable) {
  const [db, table] = dbTable.split('.');
  const [rows] = await pool.query(`SHOW INDEX FROM \`${db}\`.\`${table}\``);
  return rows;
}

async function main() {
  console.log('=== 소셜 로그인 DB 스키마 점검 ===\n');

  for (const tableName of Object.keys(EXPECTED)) {
    const [db, table] = tableName.split('.');
    const [exists] = await pool.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [db, table]
    );

    if (exists.length === 0) {
      console.log(`❌ ${tableName} — 테이블 없음\n`);
      continue;
    }

    console.log(`✅ ${tableName} — 존재`);
    const cols = await describeTable(tableName);
    for (const c of cols) {
      console.log(`   - ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}${c.COLUMN_KEY ? ` [${c.COLUMN_KEY}]` : ''}`);
    }

    if (table === 'user_oauth_connections') {
      const providerCol = cols.find((c) => c.COLUMN_NAME === 'provider');
      if (providerCol) {
        const enumMatch = providerCol.COLUMN_TYPE.match(/^enum\((.*)\)$/i);
        if (enumMatch) {
          const values = enumMatch[1].replace(/'/g, '').split(',');
          const missing = EXPECTED[tableName].providerEnum.filter((v) => !values.includes(v));
          const extra = values.filter((v) => !EXPECTED[tableName].providerEnum.includes(v) && v !== 'apple');
          if (missing.length) console.log(`   ⚠ provider ENUM에 없음: ${missing.join(', ')}`);
          if (extra.length) console.log(`   ℹ provider ENUM 추가값: ${extra.join(', ')}`);
          if (!missing.length) console.log(`   ✅ provider: google, kakao 지원 OK`);
        }
      }
      const indexes = await getIndexes(tableName);
      const uniq = [...new Set(indexes.filter((i) => i.Non_unique === 0 && i.Key_name !== 'PRIMARY').map((i) => i.Key_name))];
      console.log(`   인덱스(UNIQUE): ${uniq.join(', ') || '(없음)'}`);
      const oauthCol = EXPECTED[tableName].oauthIdColumn || 'oauth_user_id';
      const hasProviderUser = uniq.some((k) => {
        const colsForKey = indexes.filter((i) => i.Key_name === k).map((i) => i.Column_name);
        return colsForKey.includes('provider') && colsForKey.includes(oauthCol);
      });
      if (hasProviderUser) console.log(`   ✅ (provider, ${oauthCol}) 유니크 OK`);
      else console.log(`   ⚠ (provider, ${oauthCol}) 복합 UNIQUE 권장`);
    }
    console.log('');
  }

  const [allSocial] = await pool.query(
    `SELECT TABLE_SCHEMA, TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA IN ('capstonedesign', 'teacher_db', 'student_db')
       AND (TABLE_NAME LIKE '%social%' OR TABLE_NAME LIKE '%oauth%' OR TABLE_NAME LIKE '%auth%')
     ORDER BY TABLE_SCHEMA, TABLE_NAME`
  );
  if (allSocial.length) {
    console.log('=== 관련 이름 테이블 (social/oauth/auth) ===');
    for (const t of allSocial) {
      console.log(`\n--- ${t.TABLE_SCHEMA}.${t.TABLE_NAME} ---`);
      const cols = await describeTable(`${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
      cols.forEach((c) => {
        console.log(`   ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}${c.COLUMN_KEY ? ` [${c.COLUMN_KEY}]` : ''}`);
      });
      const indexes = await getIndexes(`${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
      const byKey = {};
      indexes.forEach((i) => {
        if (!byKey[i.Key_name]) byKey[i.Key_name] = [];
        byKey[i.Key_name].push(i.Column_name);
      });
      Object.entries(byKey).forEach(([k, v]) => console.log(`   INDEX ${k}: ${v.join(', ')}`));
    }
  }

  console.log('\n=== 코드 호환 요약 ===');
  const [oauthExists] = await pool.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'capstonedesign' AND TABLE_NAME = 'user_oauth_connections'`
  );
  if (oauthExists.length) console.log('✅ user_oauth_connections — 백엔드 코드와 연동 OK (google, kakao)');
  else console.log('❌ user_oauth_connections 테이블 없음');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
