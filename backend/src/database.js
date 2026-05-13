const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '10.0.2.6',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'capstone',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

async function initDatabase() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS capstonedesign.users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('teacher', 'student') NOT NULL,
        teacher_code VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS teacher_db.assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        subject VARCHAR(100),
        teacher_id INT NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        assignment_code VARCHAR(50) UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS teacher_db.stages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id INT NOT NULL,
        order_num INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        ai_mode VARCHAR(50) DEFAULT 'disallowed',
        ai_allowed TINYINT(1) DEFAULT 0,
        ai_tools JSON,
        ai_guidance TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS student_db.student_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        assignment_id INT NOT NULL,
        current_stage_order INT DEFAULT 1,
        status VARCHAR(50) DEFAULT 'in_progress',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        UNIQUE KEY uq_student_assignment (student_id, assignment_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS student_db.student_stage_writings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        assignment_id INT NOT NULL,
        stage_id INT NOT NULL,
        content MEDIUMTEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_writing (student_id, assignment_id, stage_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS log_db.ai_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        assignment_id INT NOT NULL,
        stage_id INT,
        stage_order INT,
        action_type VARCHAR(100) NOT NULL,
        url TEXT,
        page_title TEXT,
        duration_seconds INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS log_db.exit_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        assignment_id INT,
        attempt_type VARCHAR(100) DEFAULT 'unknown',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [existing] = await conn.query(
      'SELECT id FROM capstonedesign.users WHERE email = ?',
      ['test1@test.com']
    );

    if (existing.length === 0) {
      const teacherPw = await bcrypt.hash('1234', 10);
      const studentPw = await bcrypt.hash('1234', 10);
      await conn.query(
        'INSERT INTO capstonedesign.users (name, email, password, role, teacher_code) VALUES (?, ?, ?, ?, ?)',
        ['김교사', 'test1@test.com', teacherPw, 'teacher', 'TCH001']
      );
      await conn.query(
        'INSERT INTO capstonedesign.users (name, email, password, role, teacher_code) VALUES (?, ?, ?, ?, ?)',
        ['홍길동', 'test@test.com', studentPw, 'student', 'TCH001']
      );
      console.log('기본 계정 생성 완료 (교사 test1@test.com / 1234, 학생 test@test.com / 1234)');
    }

    console.log('데이터베이스 초기화 완료 (MySQL)');
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDatabase };
