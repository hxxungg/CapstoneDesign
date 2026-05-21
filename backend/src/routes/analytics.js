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
        'SELECT * FROM log_db.activity_logs WHERE student_id = ? AND assignment_id = ? ORDER BY created_at',
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
      'SELECT * FROM log_db.activity_logs WHERE assignment_id = ?',
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
      'SELECT * FROM log_db.activity_logs WHERE student_id = ? AND assignment_id = ? ORDER BY created_at',
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
      'SELECT * FROM log_db.activity_logs WHERE assignment_id = ?',
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

// ────────────────────────────────────────────────────────────────────────────
// 신규 assessments 시스템 — 수행평가 전체(클래스 레벨) 분석
// ────────────────────────────────────────────────────────────────────────────

router.get('/assessment/:id', authenticateToken, requireTeacher, async (req, res) => {
  const assessmentId = parseInt(req.params.id);

  try {
    // 소유자 확인
    const [aRows] = await pool.query(
      `SELECT a.* FROM teacher_db.assessments a
       JOIN teacher_db.teachers t ON a.teacher_id = t.id
       WHERE a.id = ? AND t.user_id = ?`,
      [assessmentId, req.user.id]
    );
    if (aRows.length === 0) {
      return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    }
    const assessment = aRows[0];

    // 단계 목록 (order_num 으로 정규화)
    const [steps] = await pool.query(
      'SELECT * FROM teacher_db.assessment_steps WHERE assessment_id = ? ORDER BY step_order',
      [assessmentId]
    );
    const normalizedStages = steps.map(s => ({
      ...s,
      order_num: s.step_order,
      ai_mode: s.ai_permission === 'denied' ? 'disallowed' : s.ai_permission,
      ai_allowed: s.ai_permission !== 'denied',
    }));

    // 참여 목록 + 학생 정보 (participations.student_id → students.id → users.id)
    const [participations] = await pool.query(
      `SELECT p.*, s.user_id, u.name, u.email
       FROM student_db.participations p
       JOIN student_db.students s ON p.student_id = s.id
       JOIN capstonedesign.users u ON s.user_id = u.id
       WHERE p.assessment_id = ?`,
      [assessmentId]
    );

    const totalStudents = participations.length;
    const completedStudents = participations.filter(
      p => p.status === 'submitted' || p.status === 'graded'
    ).length;

    // 참여 ID 목록
    const pIds = participations.map(p => p.id);

    let allAiLogs = [];
    let allUrlLogs = [];
    let allExitAttempts = [];

    if (pIds.length > 0) {
      [allAiLogs] = await pool.query(
        'SELECT participation_id, prompt, logged_at FROM log_db.ai_logs WHERE participation_id IN (?)',
        [pIds]
      );
      [allUrlLogs] = await pool.query(
        'SELECT participation_id, url FROM log_db.url_logs WHERE participation_id IN (?)',
        [pIds]
      );
    }

    // 전체 이탈 시도 (exit_attempts.student_id = users.id)
    const userIds = participations.map(p => p.user_id);
    if (userIds.length > 0) {
      [allExitAttempts] = await pool.query(
        'SELECT student_id FROM log_db.exit_attempts WHERE student_id IN (?)',
        [userIds]
      );
    }

    // 전체 AI 도구 집계
    const summaryTools = {};
    allUrlLogs.forEach(l => {
      const tool = detectAITool(l.url);
      if (tool) summaryTools[tool] = (summaryTools[tool] || 0) + 1;
    });

    // 참여별 그룹핑
    const aiByP  = {};
    const urlByP = {};
    allAiLogs.forEach(l => {
      if (!aiByP[l.participation_id]) aiByP[l.participation_id] = [];
      aiByP[l.participation_id].push(l);
    });
    allUrlLogs.forEach(l => {
      if (!urlByP[l.participation_id]) urlByP[l.participation_id] = [];
      urlByP[l.participation_id].push(l);
    });

    const exitByUser = {};
    allExitAttempts.forEach(e => {
      exitByUser[e.student_id] = (exitByUser[e.student_id] || 0) + 1;
    });

    const studentsData = participations.map(p => {
      const aiLogs  = aiByP[p.id]  || [];
      const urlLogs = urlByP[p.id] || [];
      const toolsUsed = {};
      urlLogs.forEach(l => {
        const tool = detectAITool(l.url);
        if (tool) toolsUsed[tool] = (toolsUsed[tool] || 0) + 1;
      });

      return {
        student: {
          id: p.user_id,          // users.id (StudentLogs 등에서 사용)
          name: p.name,
          email: p.email,
          status: p.status,
          current_stage_order: p.current_step || 1,
        },
        participation_id: p.id,
        ai_usage: {
          total_log_count: aiLogs.length + urlLogs.length,
          total_duration_seconds: 0,
          tools_used: toolsUsed,
          by_stage: [],
        },
        exit_attempts: exitByUser[p.user_id] || 0,
      };
    });

    res.json({
      assignment: { ...assessment, is_active: assessment.status === 'active' },
      stages: normalizedStages,
      summary: {
        total_students: totalStudents,
        completed_students: completedStudents,
        in_progress_students: totalStudents - completedStudents,
        total_log_count: allAiLogs.length + allUrlLogs.length,
        total_duration_seconds: 0,
        total_exit_attempts: allExitAttempts.length,
        tools_used: summaryTools,
      },
      students: studentsData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 신규 assessments 시스템 — 참여(participation)별 분석
// ────────────────────────────────────────────────────────────────────────────

function classifyPromptType(prompt) {
  if (!prompt) return 'info';
  const p = prompt.toLowerCase();
  if (/요약|정리|summarize|summary/.test(p))                        return 'summary';
  if (/비교|차이|compare|versus|vs\.?/.test(p))                     return 'compare';
  if (/예측|전망|예상|predict|forecast/.test(p))                    return 'predict';
  if (/평가|분석|evaluate|assess|critique|장단점|pros|cons/.test(p)) return 'evaluate';
  if (/작성|생성|써줘|만들어|write|create|generate/.test(p))        return 'generate';
  return 'info';
}

router.get('/participation/:id', authenticateToken, requireTeacher, async (req, res) => {
  const participationId = parseInt(req.params.id);

  try {
    // 참여 레코드 + 수행평가 소유자 확인
    const [pRows] = await pool.query(
      `SELECT p.*, a.teacher_id, a.title AS assessment_title,
              u.name AS student_name, u.email AS student_email
       FROM student_db.participations p
       JOIN teacher_db.assessments a ON p.assessment_id = a.id
       JOIN capstonedesign.users u   ON p.student_id    = u.id
       WHERE p.id = ?`,
      [participationId]
    );
    if (pRows.length === 0) return res.status(404).json({ error: '참여 기록을 찾을 수 없습니다.' });

    const [teacherRows] = await pool.query(
      'SELECT id FROM teacher_db.teachers WHERE user_id = ?',
      [req.user.id]
    );
    if (
      teacherRows.length === 0 ||
      Number(pRows[0].teacher_id) !== Number(teacherRows[0].id)
    ) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const participation = pRows[0];

    // 단계 목록
    const [steps] = await pool.query(
      `SELECT * FROM teacher_db.assessment_steps
       WHERE assessment_id = ?
       ORDER BY step_order`,
      [participation.assessment_id]
    );

    // URL 로그
    const [urlLogs] = await pool.query(
      `SELECT ul.*, s.title AS step_title, s.step_order
       FROM log_db.url_logs ul
       LEFT JOIN teacher_db.assessment_steps s ON ul.step_id = s.id
       WHERE ul.participation_id = ?
       ORDER BY ul.visited_at`,
      [participationId]
    );

    // AI 로그
    const [aiLogs] = await pool.query(
      `SELECT al.*, s.title AS step_title, s.step_order
       FROM log_db.ai_logs al
       LEFT JOIN teacher_db.assessment_steps s ON al.step_id = s.id
       WHERE al.participation_id = ?
       ORDER BY al.logged_at`,
      [participationId]
    );

    // 이탈 시도
    const [[{ exitCount }]] = await pool.query(
      'SELECT COUNT(*) AS exitCount FROM log_db.exit_attempts WHERE student_id = ?',
      [participation.student_id]
    );

    // 단계별 분석
    const byStep = steps.map((step) => {
      const stepUrlLogs = urlLogs.filter((l) => l.step_id === step.id);
      const stepAiLogs  = aiLogs.filter((l) => l.step_id === step.id);

      const toolsUsed = {};
      stepUrlLogs.forEach((l) => {
        const tool = detectAITool(l.url);
        if (tool) toolsUsed[tool] = (toolsUsed[tool] || 0) + 1;
      });

      const promptTypes = {};
      stepAiLogs.forEach((l) => {
        const t = l.prompt_type || classifyPromptType(l.prompt);
        promptTypes[t] = (promptTypes[t] || 0) + 1;
      });

      // URL 체류 시간: complete_at - visited_at
      const totalDuration = stepUrlLogs.reduce((sum, l) => {
        if (!l.visited_at || !l.complete_at) return sum;
        const diff = (new Date(l.complete_at) - new Date(l.visited_at)) / 1000;
        return sum + (diff > 0 ? diff : 0);
      }, 0);

      return {
        step_id:        step.id,
        step_title:     step.title,
        step_order:     step.step_order,
        ai_permission:  step.ai_permission,
        url_count:      stepUrlLogs.length,
        ai_prompt_count: stepAiLogs.length,
        total_duration_seconds: Math.round(totalDuration),
        tools_used:     toolsUsed,
        prompt_types:   promptTypes,
      };
    });

    // 전체 프롬프트 유형/수준 집계
    const allPromptTypes  = {};
    const allPromptLevels = {};
    aiLogs.forEach((l) => {
      const t = l.prompt_type || classifyPromptType(l.prompt);
      allPromptTypes[t]  = (allPromptTypes[t]  || 0) + 1;
      const lv = String(l.prompt_level || 1);
      allPromptLevels[lv] = (allPromptLevels[lv] || 0) + 1;
    });

    // 전체 AI 도구 집계
    const allTools = {};
    urlLogs.forEach((l) => {
      const tool = detectAITool(l.url);
      if (tool) allTools[tool] = (allTools[tool] || 0) + 1;
    });

    // 검색 쿼리 추출 (Google/Naver 등)
    const searchQueries = urlLogs
      .filter((l) => /google\.com\/search|search\.naver\.com|bing\.com\/search/.test(l.url))
      .map((l) => {
        try {
          const u = new URL(l.url);
          return u.searchParams.get('q') || u.searchParams.get('query') || null;
        } catch (e) { return null; }
      })
      .filter(Boolean);

    res.json({
      participation,
      steps,
      summary: {
        total_url_visits:  urlLogs.length,
        total_ai_prompts:  aiLogs.length,
        total_exit_attempts: exitCount,
        tools_used:        allTools,
        prompt_types:      allPromptTypes,
        prompt_levels:     allPromptLevels,
        search_queries:    [...new Set(searchQueries)],
      },
      by_step:  byStep,
      url_logs: urlLogs,
      ai_logs:  aiLogs.map((l) => ({
        ...l,
        prompt_type: l.prompt_type || classifyPromptType(l.prompt),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// AI 대화 로그 분석 (통계 기반 — 의존도·키워드·시간대)
// ────────────────────────────────────────────────────────────────────────────

const KO_STOP_WORDS = new Set([
  '을','를','이','가','은','는','에','의','로','으로','에서','에게','한테',
  '도','만','까지','부터','것','수','등','및','또한','그리고','하지만','그러나',
  '근데','어떻게','무엇','어떤','왜','언제','어디','누가','뭐','좀','더','잘',
  '하다','이다','있다','없다','되다','같다','않다','위해','통해','대해','관해',
  '입니다','합니다','됩니다','인가요','인지','인데','해줘','알려줘','설명해',
  '해주세요','알려주세요','설명해줘','주세요','해줘요','있나요','없나요','할까요',
  '할수있나요','해도되나요',
]);

const EN_STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'i','you','he','she','it','we','they','me','my','your','his','her','its',
  'our','their','this','that','these','those','what','how','why','when',
  'where','who','which','in','on','at','to','for','of','and','or','but',
  'not','with','from','by','as','if','then','than','so','up','out','can',
  'about','just','use','get','make','need','want','help','please','tell',
  'explain','give','show','write','create','generate','find','know',
]);

function extractKeywords(prompts, topN = 20) {
  const freq = {};
  for (const prompt of prompts) {
    if (!prompt) continue;
    const words = prompt
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    for (const w of words) {
      if (KO_STOP_WORDS.has(w) || EN_STOP_WORDS.has(w)) continue;
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

function dependencyLevel(promptCount) {
  if (promptCount <= 2) return 'low';
  if (promptCount <= 7) return 'medium';
  return 'high';
}

router.get('/assessment/:id/ai-analysis', authenticateToken, requireTeacher, async (req, res) => {
  const assessmentId = parseInt(req.params.id);

  try {
    // 소유자 확인
    const [aRows] = await pool.query(
      `SELECT a.id FROM teacher_db.assessments a
       JOIN teacher_db.teachers t ON a.teacher_id = t.id
       WHERE a.id = ? AND t.user_id = ?`,
      [assessmentId, req.user.id]
    );
    if (aRows.length === 0) {
      return res.status(404).json({ error: '수행평가를 찾을 수 없습니다.' });
    }

    // 참여 목록 + 학생 이름 (participations.student_id → students.id → users.id)
    const [participations] = await pool.query(
      `SELECT p.id AS participation_id, s.user_id, u.name
       FROM student_db.participations p
       JOIN student_db.students s ON p.student_id = s.id
       JOIN capstonedesign.users u ON s.user_id = u.id
       WHERE p.assessment_id = ?`,
      [assessmentId]
    );

    if (participations.length === 0) {
      return res.json({
        per_student: [],
        class_summary: {
          dependency_distribution: { low: 0, medium: 0, high: 0 },
          top_keywords: [],
          hourly_distribution: {},
        },
      });
    }

    const participationIds = participations.map((p) => p.participation_id);

    // 전체 ai_logs 조회
    const [aiLogs] = await pool.query(
      `SELECT participation_id, prompt, logged_at
       FROM log_db.ai_logs
       WHERE participation_id IN (?)`,
      [participationIds]
    );

    // 참여별 그룹핑
    const logsByParticipation = {};
    for (const log of aiLogs) {
      const pid = log.participation_id;
      if (!logsByParticipation[pid]) logsByParticipation[pid] = [];
      logsByParticipation[pid].push(log);
    }

    // 학생별 통계
    const perStudent = participations.map((p) => {
      const logs = logsByParticipation[p.participation_id] || [];
      const promptCount = logs.length;
      const avgPromptLength = promptCount > 0
        ? Math.round(logs.reduce((s, l) => s + (l.prompt?.length || 0), 0) / promptCount)
        : 0;
      return {
        student_id: p.user_id,
        name: p.name,
        prompt_count: promptCount,
        avg_prompt_length: avgPromptLength,
        dependency_level: dependencyLevel(promptCount),
      };
    });

    // 전체 키워드
    const allPrompts = aiLogs.map((l) => l.prompt);
    const topKeywords = extractKeywords(allPrompts, 20);

    // 시간대별 분포
    const hourlyDistribution = {};
    for (const log of aiLogs) {
      if (!log.logged_at) continue;
      const hour = new Date(log.logged_at).getHours();
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    }

    // 의존도 분포
    const depDist = { low: 0, medium: 0, high: 0 };
    for (const s of perStudent) {
      depDist[s.dependency_level]++;
    }

    res.json({
      per_student: perStudent,
      class_summary: {
        dependency_distribution: depDist,
        top_keywords: topKeywords,
        hourly_distribution: hourlyDistribution,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
