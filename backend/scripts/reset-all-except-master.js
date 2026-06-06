/**
 * master 계정(master@master.com)만 남기고 전체 DB 데이터 삭제
 * 실행: node scripts/reset-all-except-master.js
 */
require('dotenv').config();
const { pool } = require('../src/database');

const MASTER_EMAIL = 'master@master.com';
const SCHEMAS = ['log_db', 'student_db', 'teacher_db'];

async function listTables(conn, schema) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [schema]
  );
  return rows.map((r) => r.name);
}

async function countRows(conn, schema, table) {
  const [[row]] = await conn.query(`SELECT COUNT(*) AS cnt FROM \`${schema}\`.\`${table}\``);
  return Number(row.cnt);
}

async function main() {
  const conn = await pool.getConnection();
  try {
    const [[master]] = await conn.query(
      'SELECT id, email, name, role FROM capstonedesign.users WHERE email = ?',
      [MASTER_EMAIL]
    );

    if (!master) {
      throw new Error(`마스터 계정(${MASTER_EMAIL})이 없습니다. 먼저 seed-master-user.js를 실행하세요.`);
    }

    console.log('유지할 마스터 계정:', master);
    await conn.beginTransaction();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const schema of SCHEMAS) {
      const tables = await listTables(conn, schema);
      for (const table of tables) {
        const before = await countRows(conn, schema, table);
        await conn.query(`DELETE FROM \`${schema}\`.\`${table}\``);
        console.log(`[${schema}.${table}] ${before}행 삭제`);
      }
    }

    const capTables = await listTables(conn, 'capstonedesign');
    const keepUserTables = new Set(['users']);

    for (const table of capTables) {
      if (keepUserTables.has(table)) continue;

      if (table === 'user_credentials' || table === 'user_consents' || table === 'user_oauth_connections') {
        const before = await countRows(conn, 'capstonedesign', table);
        const [result] = await conn.query(
          `DELETE FROM capstonedesign.\`${table}\` WHERE user_id <> ?`,
          [master.id]
        );
        console.log(`[capstonedesign.${table}] ${result.affectedRows}/${before}행 삭제 (master 제외)`);
        continue;
      }

      const before = await countRows(conn, 'capstonedesign', table);
      await conn.query(`DELETE FROM capstonedesign.\`${table}\``);
      console.log(`[capstonedesign.${table}] ${before}행 삭제`);
    }

    const [userDelete] = await conn.query(
      'DELETE FROM capstonedesign.users WHERE id <> ?',
      [master.id]
    );
    console.log(`[capstonedesign.users] ${userDelete.affectedRows}행 삭제 (master 제외)`);

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.commit();

    console.log('\n=== 삭제 후 확인 ===');
    for (const schema of [...SCHEMAS, 'capstonedesign']) {
      const tables = await listTables(conn, schema);
      for (const table of tables) {
        const cnt = await countRows(conn, schema, table);
        if (cnt > 0) console.log(`${schema}.${table}: ${cnt}행`);
      }
    }

    const [[masterAfter]] = await conn.query(
      'SELECT id, email, name, role FROM capstonedesign.users WHERE email = ?',
      [MASTER_EMAIL]
    );
    console.log('\n남은 마스터:', masterAfter);
  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('실패:', err.message);
  process.exit(1);
});
