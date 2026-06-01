const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const { verifySocialToken } = require('../services/socialProviders');
const { createUserWithRole, linkSocialAccount } = require('../services/userRegistration');
const { deleteAssessmentCascade, deleteParticipationLogs } = require('../services/assessmentCleanup');

function signUserToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// "3학년" → "3", "3반" → "3", "3" → "3"
function extractNum(val) {
  if (val == null) return null;
  const n = String(val).replace(/[^0-9]/g, '');
  return n || null;
}

function formatUser(row) {
  return {
    id: row.id, name: row.name, email: row.email, role: row.role,
    school: row.school || null,
    subject: row.subject || null,
    grade: extractNum(row.grade),
    class_num: extractNum(row.class_num),
    marketing_agreed: !!row.marketing_agreed,
  };
}

// 회원가입
router.post('/register', async (req, res) => {
  const { email, name, password, role, school, subject, grade, class_num, invite_code,
          terms_agreed, privacy_agreed, marketing_agreed } = req.body;

  if (!email || !name || !password || !role) {
    return res.status(400).json({ error: '필수 정보를 입력해주세요.' });
  }
  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: '역할은 teacher 또는 student여야 합니다.' });
  }
  if (role === 'student' && !invite_code) {
    return res.status(400).json({ error: '교사에게 받은 초대 코드를 입력해주세요.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const created = await createUserWithRole(conn, {
      email,
      name,
      role,
      school,
      subject,
      grade,
      class_num,
      invite_code,
    });

    const passwordHash = await bcrypt.hash(password, 10);
    await conn.query(
      'INSERT INTO capstonedesign.user_credentials (user_id, password_hash) VALUES (?, ?)',
      [created.userId, passwordHash]
    );

    const ipAddr = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
    await conn.query(
      `INSERT INTO capstonedesign.user_consents
         (user_id, terms_agreed, privacy_agreed, marketing_agreed, ip_address)
       VALUES (?, ?, ?, ?, ?)`,
      [created.userId, terms_agreed ? 1 : 0, privacy_agreed ? 1 : 0, marketing_agreed ? 1 : 0, ipAddr]
    );

    await conn.commit();

    const user = formatUser({
      ...created,
      id: created.userId,
      marketing_agreed: marketing_agreed ? 1 : 0,
    });
    res.status(201).json({ token: signUserToken(user), user });
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 소셜 로그인 / 가입
router.post('/social', async (req, res) => {
  const {
    provider,
    id_token,
    access_token,
    code,
    redirect_uri,
    social_session_token,
    role,
    school,
    subject,
    grade,
    class_num,
    invite_code,
    terms_agreed,
    privacy_agreed,
    marketing_agreed,
  } = req.body;

  if (!provider) {
    return res.status(400).json({ error: '소셜 제공자(provider)가 필요합니다.' });
  }

  let profile;
  try {
    profile = await verifySocialToken(provider, { id_token, access_token, code, redirect_uri, social_session_token });
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ error: err.message });
  }

  const conn = await pool.getConnection();
  try {
    const [socialRows] = await conn.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active,
              COALESCE(tc.school, st.school) AS school,
              tc.subject,
              st.grade,
              COALESCE(tc.class_num, st.class_num) AS class_num,
              oa.id AS oauth_id,
              c.marketing_agreed
       FROM capstonedesign.user_oauth_connections oa
       JOIN capstonedesign.users u ON u.id = oa.user_id
       LEFT JOIN teacher_db.teachers tc ON tc.user_id = u.id
       LEFT JOIN student_db.students st ON st.user_id = u.id
       LEFT JOIN capstonedesign.user_consents c ON c.user_id = u.id
       WHERE oa.provider = ? AND oa.oauth_user_id = ? AND oa.revoked_at IS NULL`,
      [provider, profile.providerUserId]
    );

    if (socialRows.length > 0) {
      const user = socialRows[0];
      if (!user.is_active) {
        return res.status(403).json({ error: '비활성화된 계정입니다.' });
      }
      await conn.query(
        'UPDATE capstonedesign.user_oauth_connections SET last_login_at = NOW() WHERE id = ?',
        [user.oauth_id]
      );
      return res.json({
        token: signUserToken(user),
        user: formatUser(user),
      });
    }

    if (!role) {
      // 코드는 1회용이므로 검증된 신원을 단기 JWT로 보관 (5분 유효)
      const socialSessionToken = jwt.sign(
        {
          type: 'social_session',
          provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
          name: profile.name,
        },
        JWT_SECRET,
        { expiresIn: '30m' }
      );
      return res.status(422).json({
        needs_registration: true,
        provider,
        social_session_token: socialSessionToken,
        profile: {
          email: profile.email,
          name: profile.name,
        },
        error: '추가 가입 정보가 필요합니다.',
      });
    }

    if (!['teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: '역할은 teacher 또는 student여야 합니다.' });
    }
    if (role === 'student' && !invite_code) {
      return res.status(400).json({ error: '교사에게 받은 초대 코드를 입력해주세요.' });
    }

    const email = profile.email;

    await conn.beginTransaction();

    const [emailExisting] = await conn.query(
      'SELECT id FROM capstonedesign.users WHERE email = ?',
      [email]
    );
    if (emailExisting.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        error: '이미 같은 이메일로 가입된 계정이 있습니다. 이메일 로그인을 이용해 주세요.',
      });
    }

    const created = await createUserWithRole(conn, {
      email,
      name: profile.name,
      role,
      school,
      subject,
      grade,
      class_num,
      invite_code,
    });

    await linkSocialAccount(conn, created.userId, provider, profile.providerUserId, email);
    const ipAddr2 = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
    await conn.query(
      `INSERT INTO capstonedesign.user_consents
         (user_id, terms_agreed, privacy_agreed, marketing_agreed, ip_address)
       VALUES (?, ?, ?, ?, ?)`,
      [created.userId, terms_agreed ? 1 : 0, privacy_agreed ? 1 : 0, marketing_agreed ? 1 : 0, ipAddr2]
    );

    await conn.commit();

    const user = formatUser({
      ...created,
      id: created.userId,
      marketing_agreed: marketing_agreed ? 1 : 0,
    });
    res.status(201).json({ token: signUserToken(user), user });
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        error: 'user_oauth_connections 테이블이 없습니다. DB 스키마를 확인해 주세요.',
      });
    }
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 로그인
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active,
              COALESCE(tc.school, st.school) AS school,
              tc.subject,
              st.grade,
              COALESCE(tc.class_num, st.class_num) AS class_num,
              uc.password_hash,
              c.marketing_agreed
       FROM capstonedesign.users u
       JOIN capstonedesign.user_credentials uc ON uc.user_id = u.id
       LEFT JOIN teacher_db.teachers tc ON tc.user_id = u.id
       LEFT JOIN student_db.students st ON st.user_id = u.id
       LEFT JOIN capstonedesign.user_consents c ON c.user_id = u.id
       WHERE u.email = ?`,
      [email]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: '비활성화된 계정입니다.' });
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    res.json({
      token: signUserToken(user),
      user: formatUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 비밀번호 변경
router.put('/password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: '새 비밀번호는 6자 이상이어야 합니다.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT password_hash FROM capstonedesign.user_credentials WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: '소셜 로그인 계정은 비밀번호가 없습니다.' });
    }
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }
    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE capstonedesign.user_credentials SET password_hash = ? WHERE user_id = ?',
      [newHash, req.user.id]
    );
    // users.updated_at 갱신 (비밀번호 변경 시각 반영)
    await pool.query(
      'UPDATE capstonedesign.users SET updated_at = NOW() WHERE id = ?',
      [req.user.id]
    );
    res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 회원탈퇴 — 역할에 따라 관련 데이터 전체 삭제
router.delete('/account', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const role   = req.user.role;
  const conn   = await pool.getConnection();

  try {
    await conn.beginTransaction();

    if (role === 'teacher') {
      // 1. 이 교사의 수행평가 ID 목록
      const [assessments] = await conn.query(
        'SELECT id FROM teacher_db.assessments WHERE teacher_id = ?',
        [userId]
      );
      const assessmentIds = assessments.map(a => a.id);

      if (assessmentIds.length > 0) {
        for (const assessmentId of assessmentIds) {
          await deleteAssessmentCascade(conn, assessmentId);
        }
      }
      // 5. 교사 레코드 삭제
      await conn.query('DELETE FROM teacher_db.teachers WHERE user_id = ?', [userId]);

    } else {
      // 학생: 본인 참여/제출 데이터 삭제
      const [studentRows] = await conn.query('SELECT id FROM student_db.students WHERE user_id = ?', [userId]);
      if (studentRows.length > 0) {
        const studentId = studentRows[0].id;
        const [parts] = await conn.query('SELECT id FROM student_db.participations WHERE student_id = ?', [studentId]);
        const partIds = parts.map(p => p.id);
        if (partIds.length > 0) {
          await deleteParticipationLogs(conn, partIds);
          await conn.query('DELETE FROM student_db.participations WHERE student_id = ?', [studentId]);
        }
        await conn.query('DELETE FROM student_db.students WHERE user_id = ?', [userId]);
      }
    }

    // 인증 정보 삭제 (FK 제약 때문에 users 삭제 전에)
    await conn.query('DELETE FROM capstonedesign.user_consents WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM capstonedesign.user_credentials WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM capstonedesign.user_oauth_connections WHERE user_id = ?', [userId]);
    // 최종 계정 삭제
    await conn.query('DELETE FROM capstonedesign.users WHERE id = ?', [userId]);

    await conn.commit();
    res.json({ message: '회원탈퇴가 완료되었습니다.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 내 정보 조회
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
              COALESCE(tc.school, st.school) AS school,
              tc.subject,
              st.grade,
              COALESCE(tc.class_num, st.class_num) AS class_num,
              c.marketing_agreed
       FROM capstonedesign.users u
       LEFT JOIN teacher_db.teachers tc ON tc.user_id = u.id
       LEFT JOIN student_db.students st ON st.user_id = u.id
       LEFT JOIN capstonedesign.user_consents c ON c.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(formatUser(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
