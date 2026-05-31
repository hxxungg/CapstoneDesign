require('dotenv').config();
const jwt = require('jsonwebtoken');
const { pool } = require('../src/database');
const { JWT_SECRET } = require('../src/middleware/auth');

const STUDENT_NAME = process.argv[2] || '하승연_학생test';
const BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

async function main() {
  const [[user]] = await pool.query(
    `SELECT u.id, u.name, u.email, u.role
     FROM capstonedesign.users u
     JOIN student_db.students s ON s.user_id = u.id
     WHERE u.name LIKE ? LIMIT 1`,
    [`%${STUDENT_NAME.replace(/_학생test$/, '')}%`]
  );
  if (!user) throw new Error('학생 없음');

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  const [parts] = await pool.query(
    'SELECT id, assessment_id FROM student_db.participations WHERE student_id = (SELECT id FROM student_db.students WHERE user_id = ?) ORDER BY id',
    [user.id]
  );

  console.log(`HTTP analytics — ${user.name}, ${parts.length}건\n`);

  for (const p of parts) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/analytics/participation/${p.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const ms = Date.now() - t0;
    console.log(`participation=${p.id} status=${res.status} ${ms}ms`);
    if (!res.ok) {
      console.log('  error:', data.error);
      continue;
    }
    console.log('  critical_use:', JSON.stringify(data.summary?.critical_use));
    (data.ai_logs || []).forEach((l) => {
      const tags = [];
      if (l.critical_use_verification) tags.push('검증질문');
      if (l.critical_use_web) tags.push('웹검색');
      if (tags.length) console.log(`  ai_log=${l.id} → ${tags.join(', ')}`);
    });
    console.log('');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
