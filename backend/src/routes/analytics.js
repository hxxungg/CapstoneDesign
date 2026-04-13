const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
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

function buildStudentAnalytics(db, student, assignmentId, stages) {
  const logs = db.get('ai_logs')
    .filter({ student_id: student.id, assignment_id: assignmentId })
    .value()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const exitAttempts = db.get('exit_attempts')
    .filter({ student_id: student.id, assignment_id: assignmentId })
    .size().value();

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
      ai_allowed: stage.ai_allowed,
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
    exit_attempts: exitAttempts,
  };
}

// 수행평가 종합 분석 (교사)
router.get('/assignment/:id', authenticateToken, requireTeacher, (req, res) => {
  const db = getDb();
  const assignmentId = parseInt(req.params.id);

  const assignment = db.get('assignments').find({ id: assignmentId }).value();
  if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
    return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
  }

  const stages = db.get('stages').filter({ assignment_id: assignmentId }).value()
    .sort((a, b) => a.order_num - b.order_num)
    .map(normalizeStage);

  const studentAssignments = db.get('student_assignments').filter({ assignment_id: assignmentId }).value();

  const studentsData = studentAssignments.map(sa => {
    const user = db.get('users').find({ id: sa.student_id }).value();
    const { password: _, ...safeUser } = user || {};
    const studentInfo = {
      id: sa.student_id,
      name: safeUser.name,
      email: safeUser.email,
      current_stage_order: sa.current_stage_order,
      status: sa.status,
      started_at: sa.started_at,
      completed_at: sa.completed_at,
    };
    const analytics = buildStudentAnalytics(db, { id: sa.student_id }, assignmentId, stages);
    return { student: studentInfo, ...analytics };
  });

  // 전체 요약
  const allLogs = db.get('ai_logs').filter({ assignment_id: assignmentId }).value();
  const totalDuration = allLogs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
  const totalExitAttempts = db.get('exit_attempts').filter({ assignment_id: assignmentId }).size().value();
  const completedStudents = studentAssignments.filter(sa => sa.status === 'completed').length;

  const allToolsCount = {};
  allLogs.forEach(log => {
    if (log.url) {
      const tool = detectAITool(log.url);
      if (tool) allToolsCount[tool] = (allToolsCount[tool] || 0) + 1;
    }
  });

  res.json({
    assignment,
    stages,
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
});

// 특정 학생의 수행평가 상세 분석
router.get('/assignment/:assignmentId/student/:studentId', authenticateToken, requireTeacher, (req, res) => {
  const db = getDb();
  const assignmentId = parseInt(req.params.assignmentId);
  const studentId = parseInt(req.params.studentId);

  const assignment = db.get('assignments').find({ id: assignmentId }).value();
  if (!assignment || Number(assignment.teacher_id) !== Number(req.user.id)) {
    return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
  }

  const student = db.get('users').find({ id: studentId }).value();
  if (!student) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });

  const stages = db.get('stages').filter({ assignment_id: assignmentId }).value()
    .sort((a, b) => a.order_num - b.order_num)
    .map(normalizeStage);

  const progress = db.get('student_assignments')
    .find({ student_id: studentId, assignment_id: assignmentId })
    .value();

  const logs = db.get('ai_logs')
    .filter({ student_id: studentId, assignment_id: assignmentId })
    .value()
    .map(log => {
      const stage = stages.find(s => s.id === log.stage_id);
      return { ...log, stage_title: stage?.title || null };
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const exitAttempts = db.get('exit_attempts')
    .filter({ student_id: studentId, assignment_id: assignmentId })
    .value()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const timeline = logs.map(log => ({
    time: log.created_at,
    type: log.action_type,
    stage: log.stage_title || `단계 ${log.stage_order}`,
    url: log.url,
    page_title: log.page_title,
    duration: log.duration_seconds,
    tool: detectAITool(log.url),
  }));

  const { password: _, ...safeStudent } = student;

  const comprehensive_report = buildComprehensiveReport(
    db,
    assignmentId,
    studentId,
    stages,
    logs,
    progress,
  );

  res.json({
    student: safeStudent,
    assignment,
    progress,
    stages,
    logs,
    exitAttempts,
    timeline,
    comprehensive_report,
  });
});

module.exports = router;
