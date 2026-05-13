const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const { normalizeStage } = require('../stageNormalize');
const { buildComprehensiveReport } = require('../studentReportBuilder');

function detectAITool(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('chat.openai.com') || u.includes('chatgpt.com')) return 'ChatGPT';
  if (u.includes('gemini.google.com') || u.includes('bard.google.com')) return 'Google Gemini';
  if (u.includes('claude.ai')) return 'Claude AI';
  if (u.includes('perplexity.ai')) return 'Perplexity AI';
  if (u.includes('copilot.microsoft.com') || u.includes('bing.com/chat')) return 'Microsoft Copilot';
  if (u.includes('wrtn.ai')) return 'WRTN';
  if (u.includes('clova.ai') || u.includes('clova.naver.com')) return 'CLOVA';
  return null;
}

function buildStudentAnalytics(studentId, assignmentId, stages, logs, exitAttemptCount) {
  const byStage = stages.map(stage => {
    const stageLogs = logs.filter(l => l.stage_id === stage.id || l.stage_order === stage.order_num);
    const totalDuration = stageLogs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
    const urlSet = new Set();
    const toolsUsed = {};

    stageLogs.forEach(log => {
      if (log.url) {
        urlSet.add(log.url);
        const toolName = detectAITool(log.url);
        if (toolName) toolsUsed[toolName] = (toolsUsed[toolName] || 0) + 1;
      }
    });

    return {
      stage_id: stage.id,
      stage_title: stage.title,
      stage_order: stage.order_num,
      ai_allowed: !!stage.ai_allowed,
      total_sessions: stageLogs.filter(l => l.action_type === 'page_visit').length,
      total_duration_seconds: totalDuration,
      unique_urls: Array.from(urlSet),
      tools_used: toolsUsed,
      log_count: stageLogs.length,
    };
  });

  const allToolsUsed = {};
  logs.forEach(log => {
    if (log.url) {
      const toolName = detectAITool(log.url);
      if (toolName) allToolsUsed[toolName] = (allToolsUsed[toolName] || 0) + 1;
    }
  });

  const totalDuration = logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);

  return {
    ai_usage: {
      total_log_count: logs.length,
      total_duration_seconds: totalDuration,
      tools_used: allToolsUsed,
      by_stage: byStage,
    },
    exit_attempts: exitAttemptCount,
  };
}

router.get('/assignment/:id', authenticateToken, requireTeacher, async (req, res) => {
  const assignmentId = parseInt(req.params.id);

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [assignmentId]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    }

    const [stages] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE assignment_id = ? ORDER BY order_num',
      [assignmentId]
    );
    const normalizedStages = stages.map(normalizeStage);

    const [studentAssignments] = await pool.query(
      'SELECT * FROM student_db.student_assignments WHERE assignment_id = ?',
      [assignmentId]
    );

    const studentsData = await Promise.all(studentAssignments.map(async (sa) => {
      const [userRows] = await pool.query(
        'SELECT id, name, email FROM capstonedesign.users WHERE id = ?',
        [sa.student_id]
      );
      const user = userRows[0] || {};

      const [logs] = await pool.query(
        'SELECT * FROM log_db.ai_logs WHERE student_id = ? AND assignment_id = ? ORDER BY created_at',
        [sa.student_id, assignmentId]
      );
      const [[{ exitCount }]] = await pool.query(
        'SELECT COUNT(*) as exitCount FROM log_db.exit_attempts WHERE student_id = ? AND assignment_id = ?',
        [sa.student_id, assignmentId]
      );

      const studentInfo = {
        id: sa.student_id,
        name: user.name,
        email: user.email,
        current_stage_order: sa.current_stage_order,
        status: sa.status,
        started_at: sa.started_at,
        completed_at: sa.completed_at,
      };
      const analytics = buildStudentAnalytics(sa.student_id, assignmentId, normalizedStages, logs, exitCount);
      return { student: studentInfo, ...analytics };
    }));

    const [allLogs] = await pool.query(
      'SELECT * FROM log_db.ai_logs WHERE assignment_id = ?',
      [assignmentId]
    );
    const [[{ totalExitAttempts }]] = await pool.query(
      'SELECT COUNT(*) as totalExitAttempts FROM log_db.exit_attempts WHERE assignment_id = ?',
      [assignmentId]
    );

    const totalDuration = allLogs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
    const completedStudents = studentAssignments.filter(sa => sa.status === 'completed').length;

    const allToolsCount = {};
    allLogs.forEach(log => {
      if (log.url) {
        const tool = detectAITool(log.url);
        if (tool) allToolsCount[tool] = (allToolsCount[tool] || 0) + 1;
      }
    });

    res.json({
      assignment: { ...assignment, is_active: !!assignment.is_active },
      stages: normalizedStages,
      summary: {
        total_students: studentAssignments.length,
        completed_students: completedStudents,
        in_progress_students: studentAssignments.length - completedStudents,
        total_log_count: allLogs.length,
        total_duration_seconds: totalDuration,
        total_exit_attempts: totalExitAttempts,
        tools_used: allToolsCount,
      },
      students: studentsData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/assignment/:assignmentId/student/:studentId', authenticateToken, requireTeacher, async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  const studentId = parseInt(req.params.studentId);

  try {
    const [aRows] = await pool.query(
      'SELECT * FROM teacher_db.assignments WHERE id = ?',
      [assignmentId]
    );
    const assignment = aRows[0];
    if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    }

    const [userRows] = await pool.query(
      'SELECT id, name, email, role, teacher_code, created_at FROM capstonedesign.users WHERE id = ?',
      [studentId]
    );
    if (userRows.length === 0) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });

    const [stages] = await pool.query(
      'SELECT * FROM teacher_db.stages WHERE assignment_id = ? ORDER BY order_num',
      [assignmentId]
    );
    const normalizedStages = stages.map(normalizeStage);

    const [progressRows] = await pool.query(
      'SELECT * FROM student_db.student_assignments WHERE student_id = ? AND assignment_id = ?',
      [studentId, assignmentId]
    );

    const [logsRaw] = await pool.query(
      'SELECT * FROM log_db.ai_logs WHERE student_id = ? AND assignment_id = ? ORDER BY created_at',
      [studentId, assignmentId]
    );
    const logs = logsRaw.map(log => {
      const stage = normalizedStages.find(s => s.id === log.stage_id);
      return { ...log, stage_title: stage?.title || null };
    });

    const [exitAttempts] = await pool.query(
      'SELECT * FROM log_db.exit_attempts WHERE student_id = ? AND assignment_id = ? ORDER BY created_at',
      [studentId, assignmentId]
    );

    const timeline = logs.map(log => ({
      time: log.created_at,
      type: log.action_type,
      stage: log.stage_title || `단계 ${log.stage_order}`,
      url: log.url,
      page_title: log.page_title,
      duration: log.duration_seconds,
      tool: detectAITool(log.url),
    }));

    const [studentAssignments] = await pool.query(
      'SELECT * FROM student_db.student_assignments WHERE assignment_id = ?',
      [assignmentId]
    );
    const [allWritings] = await pool.query(
      'SELECT * FROM student_db.student_stage_writings WHERE assignment_id = ?',
      [assignmentId]
    );
    const [allLogs] = await pool.query(
      'SELECT * FROM log_db.ai_logs WHERE assignment_id = ?',
      [assignmentId]
    );
    const [studentWritings] = await pool.query(
      'SELECT * FROM student_db.student_stage_writings WHERE student_id = ? AND assignment_id = ?',
      [studentId, assignmentId]
    );

    const comprehensive_report = buildComprehensiveReport(
      userRows[0]?.name || '학생',
      normalizedStages,
      logs,
      progressRows[0] || null,
      studentWritings,
      { studentAssignments, allWritings, allLogs },
    );

    res.json({
      student: userRows[0],
      assignment: { ...assignment, is_active: !!assignment.is_active },
      progress: progressRows[0] || null,
      stages: normalizedStages,
      logs,
      exitAttempts,
      timeline,
      comprehensive_report,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
