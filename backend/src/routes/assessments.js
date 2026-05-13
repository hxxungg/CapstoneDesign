const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

// 교사 본인의 invite_code 조회
router.get('/invite-codes', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT invite_code FROM teacher_db.teachers WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '교사 정보를 찾을 수 없습니다.' });
    }
    res.json({ invite_code: rows[0].invite_code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
