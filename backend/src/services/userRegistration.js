const crypto = require('crypto');

const generateInviteCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

async function createUserWithRole(conn, {
  email,
  name,
  role,
  school,
  subject,
  grade,
  class_num,
  invite_code,
}) {
  const [existing] = await conn.query(
    'SELECT id FROM capstonedesign.users WHERE email = ?',
    [email]
  );
  if (existing.length > 0) {
    const err = new Error('이미 사용 중인 이메일입니다.');
    err.status = 409;
    throw err;
  }

  let teacherId = null;
  if (role === 'student') {
    const [teacherRows] = await conn.query(
      'SELECT id FROM teacher_db.teachers WHERE invite_code = ?',
      [invite_code.toUpperCase()]
    );
    if (teacherRows.length === 0) {
      const err = new Error('유효하지 않은 초대 코드입니다.');
      err.status = 400;
      throw err;
    }
    teacherId = teacherRows[0].id;
  }

  const [userResult] = await conn.query(
    'INSERT INTO capstonedesign.users (email, name, role) VALUES (?, ?, ?)',
    [email, name, role]
  );
  const userId = userResult.insertId;

  if (role === 'teacher') {
    let inviteCode;
    let attempts = 0;
    while (attempts < 10) {
      inviteCode = generateInviteCode();
      const [dup] = await conn.query(
        'SELECT id FROM teacher_db.teachers WHERE invite_code = ?',
        [inviteCode]
      );
      if (dup.length === 0) break;
      attempts++;
    }
    await conn.query(
      'INSERT INTO teacher_db.teachers (user_id, school, subject, invite_code) VALUES (?, ?, ?, ?)',
      [userId, school || null, subject || null, inviteCode]
    );
  } else {
    await conn.query(
      'INSERT INTO student_db.students (user_id, teacher_id, school, grade, class_num) VALUES (?, ?, ?, ?, ?)',
      [userId, teacherId, school || null, grade || null, class_num || null]
    );
  }

  const extractNum = (val) => { if (val == null) return null; const n = String(val).replace(/[^0-9]/g, ''); return n || null; };
  return { userId, email, name, role, school: school || null, subject: subject || null, grade: extractNum(grade), class_num: extractNum(class_num) };
}

async function linkSocialAccount(conn, userId, provider, oauthUserId, emailAtSignup) {
  await conn.query(
    `INSERT INTO capstonedesign.user_oauth_connections
       (user_id, provider, oauth_user_id, email_at_signup, last_login_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [userId, provider, oauthUserId, emailAtSignup || null]
  );
}

module.exports = { createUserWithRole, linkSocialAccount };
