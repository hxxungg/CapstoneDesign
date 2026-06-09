const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, requireTeacher, isMaster } = require('../middleware/auth');
const { isGlobalMaster, getActingUserId, getMasterViewMode } = require('../services/masterScope');
const { normalizeStage } = require('../stageNormalize');
const { buildComprehensiveReport } = require('../studentReportBuilder');
const { enrichAiLogsWithCriticalUseFromDb } = require('../services/criticalUseAnalysis');
const { computeClassChartAverages } = require('../services/classChartAverages');
const { toComplianceDto } = require('../services/rubricComplianceService');
const {
  enrichAiLogsPromptFieldsFromDb,
  aggregatePromptStats,
  fallbackPromptType,
} = require('../services/promptClassificationService');

/** teacher_db.evaluations — step_id NULL = 최종 점수 */
async function getFinalEvaluation(participationId) {
  const [rows] = await pool.query(
    `SELECT score, evaluated_at
     FROM teacher_db.evaluations
     WHERE participation_id = ? AND step_id IS NULL
     ORDER BY evaluated_at DESC, id DESC
     LIMIT 1`,
    [participationId]
  );
  return rows[0] ?? null;
}

async function upsertFinalEvaluation(participationId, score) {
  const [existing] = await pool.query(
    `SELECT id FROM teacher_db.evaluations
     WHERE participation_id = ? AND step_id IS NULL
     LIMIT 1`,
    [participationId]
  );
  if (existing.length > 0) {
    await pool.query(
      `UPDATE teacher_db.evaluations
       SET score = ?, evaluated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [score, existing[0].id]
    );
    return;
  }
  await pool.query(
    `INSERT INTO teacher_db.evaluations (participation_id, step_id, score)
     VALUES (?, NULL, ?)`,
    [participationId, score]
  );
}

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
    if (!assignment || Number(assignment.teacher_id) !== Number(getActingUserId(req))) {
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
      const exitCount = 0;

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
    const totalExitAttempts = 0;

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
    if (!assignment || Number(assignment.teacher_id) !== Number(getActingUserId(req))) {
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

    const exitAttempts = [];

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
    let aRows;
    if (isGlobalMaster(req.user)) {
      [aRows] = await pool.query(
        'SELECT * FROM teacher_db.assessments WHERE id = ?',
        [assessmentId]
      );
    } else {
      [aRows] = await pool.query(
        `SELECT a.* FROM teacher_db.assessments a
         JOIN teacher_db.teachers t ON a.teacher_id = t.id
         WHERE a.id = ? AND t.user_id = ?`,
        [assessmentId, getActingUserId(req)]
      );
    }
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

    if (pIds.length > 0) {
      [allAiLogs] = await pool.query(
        `SELECT id, participation_id, prompt, logged_at, step_id, response, complete_at,
                prompt_type, prompt_level,
                critical_label, critical_label_name, critical_confidence,
                related_url_log_id, relevance_score
         FROM log_db.ai_logs WHERE participation_id IN (?)`,
        [pIds]
      );
      [allUrlLogs] = await pool.query(
        `SELECT id, participation_id, url, visited_at, complete_at, step_id, search_query
         FROM log_db.url_logs WHERE participation_id IN (?)`,
        [pIds]
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

    // exit_attempts는 participations 컬럼에서 직접 읽음
    const totalExitAttempts = participations.reduce((sum, p) => sum + (p.exit_attempts || 0), 0);

    const simByP = {};
    if (pIds.length > 0) {
      const [simRows] = await pool.query(
        `SELECT sub.participation_id, ss.originality
         FROM log_db.submissions_step ss
         JOIN log_db.submissions sub ON ss.submission_id = sub.id
         WHERE sub.participation_id IN (?)
           AND ss.originality IS NOT NULL`,
        [pIds]
      );
      simRows.forEach((row) => {
        if (!simByP[row.participation_id]) simByP[row.participation_id] = [];
        simByP[row.participation_id].push(row);
      });
    }

    const classChartAverages = computeClassChartAverages(
      participations,
      aiByP,
      urlByP,
      simByP
    );

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
        exit_attempts: p.exit_attempts || 0,
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
        total_exit_attempts: totalExitAttempts,
        tools_used: summaryTools,
        class_chart_averages: classChartAverages,
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

router.get('/participation/:id', authenticateToken, async (req, res) => {
  const participationId = parseInt(req.params.id);

  try {
    // 참여 레코드 + 수행평가 소유자 확인
    const [pRows] = await pool.query(
      `SELECT p.*, a.teacher_id, a.title AS assessment_title,
              u.name AS student_name, u.email AS student_email
       FROM student_db.participations p
       JOIN teacher_db.assessments a  ON p.assessment_id = a.id
       JOIN student_db.students   st  ON p.student_id    = st.id
       JOIN capstonedesign.users   u  ON st.user_id      = u.id
       WHERE p.id = ?`,
      [participationId]
    );
    if (pRows.length === 0) return res.status(404).json({ error: '참여 기록을 찾을 수 없습니다.' });

    const participation = pRows[0];

    // 권한 확인: 교사(수행평가 소유자) · 학생(본인 참여) · 전역 마스터
    if (isGlobalMaster(req.user)) {
      // 전체 조회 허용
    } else if (req.user.role === 'teacher' || (isMaster(req.user) && getMasterViewMode(req) === 'teacher')) {
      const [teacherRows] = await pool.query(
        'SELECT id FROM teacher_db.teachers WHERE user_id = ?',
        [getActingUserId(req)]
      );
      if (
        teacherRows.length === 0 ||
        Number(participation.teacher_id) !== Number(teacherRows[0].id)
      ) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }
    } else {
      // 학생: 본인 참여인지 확인
      const [sRows] = await pool.query(
        'SELECT id FROM student_db.students WHERE user_id = ?',
        [getActingUserId(req)]
      );
      if (sRows.length === 0 || Number(participation.student_id) !== Number(sRows[0].id)) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }
    }

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

    // 이탈 시도 — participations.exit_attempts 컬럼
    const exitCount = participation.exit_attempts || 0;

    // 단계별 최신 제출 (조건부 AI 웹뷰 해제 스냅샷)
    let unlockByStepId = {};
    try {
      const [unlockRows] = await pool.query(
        `SELECT sub.step_id, sub.content, sub.content_at_unlock, sub.browser_unlocked_at
         FROM log_db.submissions sub
         WHERE sub.participation_id = ?
           AND sub.id = (
             SELECT s2.id FROM log_db.submissions s2
             WHERE s2.participation_id = sub.participation_id AND s2.step_id = sub.step_id
             ORDER BY s2.submitted_at DESC
             LIMIT 1
           )`,
        [participationId]
      );
      unlockByStepId = Object.fromEntries(
        unlockRows.map((r) => [
          Number(r.step_id),
          {
            submission_content: r.content ?? null,
            content_at_unlock: r.content_at_unlock ?? null,
            browser_unlocked_at: r.browser_unlocked_at ?? null,
          },
        ])
      );
    } catch (unlockErr) {
      if (unlockErr.code !== 'ER_BAD_FIELD_ERROR') throw unlockErr;
    }

    // 문장별 유사도 — submissions_step 에서 직접 읽기
    const [simRows] = await pool.query(
      `SELECT ss.segment_order, ss.content AS sentence,
              ss.similarity_score, ss.originality, ss.ai_log_id,
              sub.step_id, sub.submitted_at
       FROM log_db.submissions_step ss
       JOIN log_db.submissions sub ON ss.submission_id = sub.id
       WHERE sub.participation_id = ?
         AND ss.originality IS NOT NULL
       ORDER BY sub.step_id ASC, ss.segment_order ASC`,
      [participationId]
    );

    // step_id 기준으로 그룹핑
    const simByStep = {};
    simRows.forEach(r => {
      const key = r.step_id ?? 0;
      if (!simByStep[key]) simByStep[key] = [];
      simByStep[key].push({
        segment_order:     r.segment_order,
        sentence:          r.sentence,
        similarity_score:  r.similarity_score,
        originality:       r.originality,
        ai_log_id:         r.ai_log_id ?? null,
      });
    });

    // 단계별 루브릭 이행 — DB 저장값만 사용 (조회 시 모델 호출 없음)
    const complianceRows = (
      await pool.query(
        `SELECT scs.*, s.step_order, s.title AS step_title
         FROM log_db.step_compliance_scores scs
         JOIN teacher_db.assessment_steps s ON scs.step_id = s.id
         WHERE scs.participation_id = ?
         ORDER BY s.step_order ASC`,
        [participationId]
      )
    )[0];

    // AI 로그 — DB 저장값 + 규칙 기반 fallback만 (조회 시 모델 호출 없음)
    let enrichedAiLogs = enrichAiLogsPromptFieldsFromDb(aiLogs);
    const { aiLogs: criticalEnriched, criticalUseSummary } = enrichAiLogsWithCriticalUseFromDb(
      enrichedAiLogs,
      urlLogs
    );
    enrichedAiLogs = criticalEnriched;

    const { promptTypes: allPromptTypes, promptLevels: allPromptLevels } =
      aggregatePromptStats(enrichedAiLogs);

    const complianceByStepId = Object.fromEntries(
      complianceRows.map((r) => [Number(r.step_id), r])
    );

    // 단계별 분석
    const byStep = steps.map((step) => {
      const stepUrlLogs = urlLogs.filter((l) => l.step_id === step.id);
      const stepAiLogs  = enrichedAiLogs.filter((l) => l.step_id === step.id);

      const toolsUsed = {};
      stepUrlLogs.forEach((l) => {
        const tool = detectAITool(l.url);
        if (tool) toolsUsed[tool] = (toolsUsed[tool] || 0) + 1;
      });

      const promptTypes = {};
      stepAiLogs.forEach((l) => {
        const t = l.prompt_type || fallbackPromptType(l.prompt);
        promptTypes[t] = (promptTypes[t] || 0) + 1;
      });

      const totalDuration = stepUrlLogs.reduce((sum, l) => {
        if (!l.visited_at || !l.complete_at) return sum;
        const diff = (new Date(l.complete_at) - new Date(l.visited_at)) / 1000;
        return sum + (diff > 0 ? diff : 0);
      }, 0);

      const stepSim = simRows.find(r => r.step_id === step.id);
      const submittedAt = stepSim?.submitted_at ?? null;
      const compliance = complianceByStepId[Number(step.id)];

      const unlockMeta = unlockByStepId[Number(step.id)] ?? null;
      return {
        step_id:        step.id,
        step_title:     step.title,
        step_order:     step.step_order,
        ai_permission:  step.ai_permission,
        submission_content: unlockMeta?.submission_content ?? null,
        content_at_unlock: unlockMeta?.content_at_unlock ?? null,
        browser_unlocked_at: unlockMeta?.browser_unlocked_at ?? null,
        url_count:      stepUrlLogs.length,
        ai_prompt_count: stepAiLogs.length,
        total_duration_seconds: Math.round(totalDuration),
        tools_used:     toolsUsed,
        prompt_types:   promptTypes,
        submitted_at:   submittedAt,
        compliance:     toComplianceDto(compliance),
      };
    });

    // 전체 AI 도구 집계
    const allTools = {};
    urlLogs.forEach((l) => {
      const tool = detectAITool(l.url);
      if (tool) allTools[tool] = (allTools[tool] || 0) + 1;
    });

    // 검색 쿼리: DB search_query 컬럼 우선, 없으면 URL 파싱
    const searchQueries = urlLogs
      .map((l) => {
        if (l.search_query) return l.search_query;
        try {
          const u = new URL(l.url);
          if (/google\./i.test(u.hostname))        return u.searchParams.get('q');
          if (/naver\.com/i.test(u.hostname))      return u.searchParams.get('query') || u.searchParams.get('q');
          if (/bing\.com/i.test(u.hostname))       return u.searchParams.get('q');
          if (/duckduckgo\.com/i.test(u.hostname)) return u.searchParams.get('q');
          if (/daum\.net/i.test(u.hostname))       return u.searchParams.get('q');
        } catch (_) {}
        return null;
      })
      .filter(Boolean);

    const finalEvaluation = await getFinalEvaluation(participationId);

    res.json({
      participation,
      evaluation: finalEvaluation
        ? { score: finalEvaluation.score, evaluated_at: finalEvaluation.evaluated_at }
        : null,
      steps,
      summary: {
        total_url_visits:  urlLogs.length,
        total_ai_prompts:  aiLogs.length,
        total_exit_attempts: exitCount,
        tools_used:        allTools,
        prompt_types:      allPromptTypes,
        prompt_levels:     allPromptLevels,
        search_queries:    [...new Set(searchQueries)],
        critical_use:      criticalUseSummary,
      },
      by_step:  byStep,
      url_logs: urlLogs,
      ai_logs:  enrichedAiLogs.map((l) => ({
        ...l,
        prompt_type: l.prompt_type || fallbackPromptType(l.prompt),
      })),
      similarity_by_step: simByStep,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.patch('/participation/:id/grade', authenticateToken, requireTeacher, async (req, res) => {
  const participationId = parseInt(req.params.id, 10);
  const { final_score } = req.body;

  if (isNaN(participationId)) {
    return res.status(400).json({ error: '잘못된 ID입니다.' });
  }
  if (final_score == null || String(final_score).trim() === '') {
    return res.status(400).json({ error: '최종 점수를 입력해주세요.' });
  }

  try {
    if (!isGlobalMaster(req.user)) {
      const [teacherRows] = await pool.query(
        'SELECT id FROM teacher_db.teachers WHERE user_id = ?',
        [getActingUserId(req)]
      );
      if (teacherRows.length === 0) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }

      const [pRows] = await pool.query(
        `SELECT p.id, a.teacher_id
         FROM student_db.participations p
         JOIN teacher_db.assessments a ON p.assessment_id = a.id
         WHERE p.id = ?`,
        [participationId]
      );
      if (pRows.length === 0) {
        return res.status(404).json({ error: '참여 기록을 찾을 수 없습니다.' });
      }
      if (Number(pRows[0].teacher_id) !== Number(teacherRows[0].id)) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }
    }

    const scoreNum = Number(String(final_score).trim());
    if (!Number.isFinite(scoreNum)) {
      return res.status(400).json({ error: '점수는 숫자로 입력해주세요.' });
    }
    const scoreInt = Math.round(scoreNum);

    await upsertFinalEvaluation(participationId, scoreInt);

    await pool.query(
      `UPDATE student_db.participations
       SET status = CASE WHEN status = 'submitted' THEN 'graded' ELSE status END
       WHERE id = ?`,
      [participationId]
    );

    res.json({ success: true, evaluation: { score: scoreInt } });
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
    let aRows;
    if (isGlobalMaster(req.user)) {
      [aRows] = await pool.query(
        'SELECT id FROM teacher_db.assessments WHERE id = ?',
        [assessmentId]
      );
    } else {
      [aRows] = await pool.query(
        `SELECT a.id FROM teacher_db.assessments a
         JOIN teacher_db.teachers t ON a.teacher_id = t.id
         WHERE a.id = ? AND t.user_id = ?`,
        [assessmentId, getActingUserId(req)]
      );
    }
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
