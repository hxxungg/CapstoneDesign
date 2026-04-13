/**
 * 학생 종합 분석 리포트용 데이터 조립.
 * 독창성 구간은 URL 로그·작성 시점 기반 휴리스틱(데모)이며, 추후 NLP·프롬프트 캡처 연동 시 교체 가능.
 */

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

function isWebSearchUrl(url) {
  if (!url) return false;
  return /google\.com\/search|bing\.com\/search|search\.naver\.com|duckduckgo\.com\/\?q=/i.test(url);
}

function levelLabel(durationSeconds) {
  const s = durationSeconds || 0;
  if (s < 30) return '1수준';
  if (s < 120) return '2수준';
  return '3수준';
}

function promptTypeFromLog(log) {
  const url = log.url || '';
  if (isWebSearchUrl(url)) return '웹 검색형';
  if (detectAITool(url)) {
    if (/gemini|bard/i.test(url)) return '답변·정리 요청형';
    if (/openai|chatgpt|claude/i.test(url)) return '정보 요구형';
    return 'AI 대화형';
  }
  return '기타 방문';
}

function splitIntoSegments(text) {
  if (!text || !String(text).trim()) return [];
  const raw = String(text).trim();
  const parts = raw.split(/(\n{2,}|\n)/);
  const out = [];
  let buf = '';
  for (const p of parts) {
    if (p === '\n' || p === '\n\n') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  if (out.length === 0) return [raw];
  return out.flatMap((chunk) => {
    const sentences = chunk.split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean);
    return sentences.length ? sentences : [chunk];
  });
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function classifySegment(text, stageLogs, writingUpdatedAt) {
  const end = writingUpdatedAt ? new Date(writingUpdatedAt).getTime() : Date.now();
  const relevant = stageLogs.filter((l) => new Date(l.created_at).getTime() <= end);
  const aiVisits = relevant.filter((l) => detectAITool(l.url)).length;
  const webVisits = relevant.filter((l) => isWebSearchUrl(l.url)).length;
  const h = hashStr(text) % 5;
  if (aiVisits >= 3 && h !== 0) return 'borrowed';
  if (aiVisits >= 1 || webVisits >= 2 || h === 1 || h === 2) return 'adapted';
  return 'original';
}

function pickLinkedLogIds(stageLogs, segmentIndex, maxN) {
  const sorted = [...stageLogs].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );
  if (!sorted.length) return [];
  const span = Math.max(1, Math.ceil(sorted.length / 8));
  const start = Math.min(segmentIndex * span, Math.max(0, sorted.length - maxN));
  return sorted.slice(start, start + maxN).map((l) => l.id);
}

function buildTimelineEvents(logsWithStage) {
  return logsWithStage.map((log) => {
    const isAi = Boolean(detectAITool(log.url));
    const isSearch = isWebSearchUrl(log.url);
    let kind = 'visit';
    if (isAi) kind = 'ai_session';
    else if (isSearch) kind = 'web_search';

    return {
      id: log.id,
      at: log.created_at,
      kind,
      stage_title: log.stage_title,
      stage_order: log.stage_order,
      title: log.page_title || (isSearch ? '웹 검색' : isAi ? 'AI 도구 방문' : '페이지 방문'),
      url: log.url,
      tool: detectAITool(log.url),
      prompt_type: promptTypeFromLog(log),
      level: levelLabel(log.duration_seconds),
      duration_seconds: log.duration_seconds || 0,
    };
  });
}

function complianceForStages(stages, writingsByStageId, progress) {
  const cur = progress?.current_stage_order || 1;
  const done = progress?.status === 'completed';
  return stages.map((stage) => {
    const w = writingsByStageId[stage.id];
    const content = (w?.content || '').trim();
    const len = content.length;
    const stagePassedOrder = done || cur > stage.order_num;
    let status = '미제출';
    let criteriaMet = false;
    if (len >= 40 && stagePassedOrder) {
      status = '충족';
      criteriaMet = true;
    } else if (len >= 40) {
      status = '제출·진행중';
      criteriaMet = false;
    } else if (len > 0) {
      status = '부분 제출';
      criteriaMet = false;
    } else if (stagePassedOrder) {
      status = '미제출(단계 통과)';
      criteriaMet = false;
    }
    return {
      stage_id: stage.id,
      stage_title: stage.title,
      order_num: stage.order_num,
      criteria_met: criteriaMet,
      status,
      writing_length: len,
    };
  });
}

function countPromptTypesAndLevels(timeline) {
  const types = {};
  const levels = {};
  timeline.forEach((t) => {
    types[t.prompt_type] = (types[t.prompt_type] || 0) + 1;
    levels[t.level] = (levels[t.level] || 0) + 1;
  });
  return { types, levels };
}

function buildClassOriginalityRatios(db, assignmentId, stages) {
  const sas = db.get('student_assignments').filter({ assignment_id: assignmentId }).value();
  const writings = db.get('student_stage_writings').filter({ assignment_id: assignmentId }).value();
  const logs = db.get('ai_logs').filter({ assignment_id: assignmentId }).value();
  let r = 0;
  let y = 0;
  let g = 0;
  sas.forEach((sa) => {
    stages.forEach((stage) => {
      const w = writings.find(
        (x) => x.student_id === sa.student_id && x.stage_id === stage.id,
      );
      const text = w?.content || '';
      const stageLogs = logs.filter(
        (l) => l.student_id === sa.student_id && l.stage_id === stage.id,
      );
      splitIntoSegments(text).forEach((seg) => {
        const cat = classifySegment(seg, stageLogs, w?.updated_at);
        if (cat === 'borrowed') r += 1;
        else if (cat === 'adapted') y += 1;
        else g += 1;
      });
    });
  });
  const t = r + y + g || 1;
  return { red: r / t, yellow: y / t, green: g / t, student_count: sas.length };
}

function integratedSummary(studentName, orig, complianceRows, classRatios, timelineLen) {
  const passed = complianceRows.filter((c) => c.criteria_met).length;
  const total = complianceRows.length || 1;
  const sRed = orig.red + orig.yellow + orig.green;
  const pr = sRed ? Math.round((orig.red / sRed) * 100) : 0;
  const py = sRed ? Math.round((orig.yellow / sRed) * 100) : 0;
  const pg = sRed ? Math.round((orig.green / sRed) * 100) : 0;

  const studentParagraph =
    `${studentName} 학생은 수행평가 전체에서 독창성 휴리스틱 기준 빨강 ${pr}%, 노랑 ${py}%, 초록 ${pg}% 구간으로 분류되었습니다. ` +
    `단계별 이행은 ${passed}/${total}단계에서 기준 충족으로 표시되었습니다. ` +
    `기록된 AI·웹 활동은 총 ${timelineLen}건입니다.`;

  const classParagraph =
    `동일 수행평가 참여 학생 전체 평균(휴리스틱)은 빨강 약 ${Math.round(classRatios.red * 100)}%, ` +
    `노랑 약 ${Math.round(classRatios.yellow * 100)}%, 초록 약 ${Math.round(classRatios.green * 100)}% 비율입니다. ` +
    `비교 시 ${pr > classRatios.red * 100 ? 'AI 응답 유사 구간 비율이 학급 평균보다 높게' : pr < classRatios.red * 100 ? 'AI 응답 유사 구간 비율이 학급 평균보다 낮게' : 'AI 응답 유사 구간 비율이 학급 평균과 비슷하게'} 나타났습니다.`;

  const bullets = [
    passed >= total ? '모든 단계 산출물 기준을 충족한 것으로 표시됩니다.' : `${total - passed}개 단계에서 추가 확인이 필요할 수 있습니다.`,
    pg >= py && pg >= pr ? '독창적 작성으로 분류된 텍스트 비중이 상대적으로 큽니다.' : 'AI·웹 활동과 연계된 구간 비중이 큽니다. 면담 시 활동 로그와 함께 검토하세요.',
  ];

  return { student_paragraph: studentParagraph, class_paragraph: classParagraph, comparison_bullets: bullets };
}

function buildComprehensiveReport(db, assignmentId, studentId, stages, logsWithStage, progress) {
  const writings = db
    .get('student_stage_writings')
    .filter({ student_id: studentId, assignment_id: assignmentId })
    .value();
  const writingsByStageId = {};
  writings.forEach((w) => {
    writingsByStageId[w.stage_id] = w;
  });

  const timeline = buildTimelineEvents(logsWithStage);
  const { types: prompt_types, levels: prompt_levels } = countPromptTypesAndLevels(timeline);

  const stagesContent = stages.map((stage) => {
    const w = writingsByStageId[stage.id];
    const text = w?.content || '';
    const stageLogs = logsWithStage.filter((l) => l.stage_id === stage.id);
    const pieces = splitIntoSegments(text);
    const segments = pieces.map((seg, idx) => ({
      id: `${stage.id}-${idx}`,
      text: seg,
      category: classifySegment(seg, stageLogs, w?.updated_at),
      linked_log_ids: pickLinkedLogIds(stageLogs, idx, 6),
    }));
    return {
      stage_id: stage.id,
      stage_title: stage.title,
      order_num: stage.order_num,
      writing_updated_at: w?.updated_at || null,
      full_text: text,
      segments,
    };
  });

  let red = 0;
  let yellow = 0;
  let green = 0;
  stagesContent.forEach((sc) => {
    sc.segments.forEach((s) => {
      if (s.category === 'borrowed') red += 1;
      else if (s.category === 'adapted') yellow += 1;
      else green += 1;
    });
  });

  const compliance_rows = complianceForStages(stages, writingsByStageId, progress);
  const classRatios = buildClassOriginalityRatios(db, assignmentId, stages);
  const studentName = db.get('users').find({ id: studentId }).value()?.name || '학생';

  const integrated = integratedSummary(
    studentName,
    { red, yellow, green },
    compliance_rows,
    classRatios,
    timeline.length,
  );

  return {
    legend: {
      borrowed: { label: 'AI 응답을 그대로 수용한 구간', color: '#F87171' },
      adapted: {
        label: 'AI 답변을 기반으로 작성하였으나, 검증과 변형의 흔적이 확인된 구간',
        color: '#FBBF24',
      },
      original: { label: '학생이 독창적으로 작성한 구간', color: '#34D399' },
    },
    compliance_summary: compliance_rows.map((r) => ({
      stage_title: r.stage_title,
      order_num: r.order_num,
      ok: r.criteria_met,
      status: r.status,
    })),
    stages_content: stagesContent,
    timeline,
    charts: {
      originality: { red, yellow, green },
      prompt_types,
      prompt_levels,
    },
    compliance_table: compliance_rows,
    class_originality_ratios: classRatios,
    integrated_summary: integrated,
    disclaimer:
      '독창성 색 구분은 저장된 URL 로그·작성 시점 기반 휴리스틱이며, 실제 표절·AI 사용 판정을 대체하지 않습니다. 추후 모델 연동 시 정밀도를 높일 수 있습니다.',
  };
}

module.exports = {
  buildComprehensiveReport,
  detectAITool,
};
