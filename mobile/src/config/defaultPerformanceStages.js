/** 수행평가 단계별 AI 허용 기본값 (교사가 단계 추가·변경 시 수정 가능) */

export const AI_MODE = {
  DISALLOWED: 'disallowed',
  CONDITIONAL: 'conditional',
  ALLOWED: 'allowed',
};

/** 조건부 허용 단계 기본 지침 (교사가 편집 가능) */
export const DEFAULT_CONDITIONAL_GUIDANCE =
  '교사 지침에 따라 AI를 보조 수단으로만 활용하세요. 생성 문장을 그대로 제출하지 말고 반드시 검토·수정하며, 인용 시 출처를 표기하세요.';

export const AI_MODE_LABELS = {
  [AI_MODE.DISALLOWED]: '비허용',
  [AI_MODE.CONDITIONAL]: '조건부 허용',
  [AI_MODE.ALLOWED]: '허용',
};

/**
 * 새 수행평가 작성 시 단계 초안 (표준 6단계 + AI 허용 기본값)
 * @returns {{ title: string, description: string, ai_mode: string, ai_guidance: string }[]}
 */
export function getDefaultStagesForNewAssignment() {
  return [
    {
      title: '문제 인식',
      description: '다루게 될 문제의 본질을 파악하고, 왜 이 주제가 중요한지 정리합니다.',
      ai_mode: AI_MODE.DISALLOWED,
      ai_guidance: '',
    },
    {
      title: '탐구 계획',
      description: '무엇을 어떻게 조사·분석할지 단계와 방법을 설계합니다.',
      ai_mode: AI_MODE.CONDITIONAL,
      ai_guidance: DEFAULT_CONDITIONAL_GUIDANCE,
    },
    {
      title: '자료 수집',
      description: '계획에 따라 신뢰할 수 있는 자료를 수집하고 근거를 정리합니다.',
      ai_mode: AI_MODE.ALLOWED,
      ai_guidance: '',
    },
    {
      title: '결과 통합',
      description: '수집한 정보를 바탕으로 결론·해석·산출물 초안을 통합합니다.',
      ai_mode: AI_MODE.CONDITIONAL,
      ai_guidance: DEFAULT_CONDITIONAL_GUIDANCE,
    },
    {
      title: '발표/제출',
      description: '최종 산출물을 완성하고 발표하거나 제출 형식에 맞게 마무리합니다.',
      ai_mode: AI_MODE.DISALLOWED,
      ai_guidance: '',
    },
    {
      title: '성찰',
      description: '과정과 결과를 돌아보며 배운 점과 개선점을 기록합니다.',
      ai_mode: AI_MODE.CONDITIONAL,
      ai_guidance: DEFAULT_CONDITIONAL_GUIDANCE,
    },
  ];
}

export function getResolvedAiMode(stage) {
  if (!stage) return AI_MODE.DISALLOWED;
  if (Object.values(AI_MODE).includes(stage.ai_mode)) return stage.ai_mode;
  return stage.ai_allowed ? AI_MODE.ALLOWED : AI_MODE.DISALLOWED;
}

export function getAiModeLabel(stage) {
  return AI_MODE_LABELS[getResolvedAiMode(stage)] || '';
}

/** 학생·교사 화면: 이 단계에서 인앱 브라우저(AI·웹) 패널을 켤지 */
export function stageAllowsAiBrowser(stage) {
  return getResolvedAiMode(stage) !== AI_MODE.DISALLOWED;
}

/** 학생 수행 화면 헤더 배지 */
export function getStudentAiBadgeText(stage) {
  const m = getResolvedAiMode(stage);
  if (m === AI_MODE.DISALLOWED) return '🚫 AI·웹 비허용';
  if (m === AI_MODE.CONDITIONAL) return '📋 AI·웹 조건부';
  return '🌐 AI·웹 허용';
}

/** 배경색 (THEME 객체 전달) */
export function getStudentAiBadgeColor(theme, stage) {
  const m = getResolvedAiMode(stage);
  if (m === AI_MODE.DISALLOWED) return theme.danger;
  if (m === AI_MODE.CONDITIONAL) return theme.warning;
  return theme.success;
}

/** 교사용 배지 (연한 배경 + 글자색) */
export function getTeacherAiModeStyle(theme, stage) {
  const m = getResolvedAiMode(stage);
  if (m === AI_MODE.DISALLOWED) {
    return { bg: theme.dangerLight, color: theme.danger, label: AI_MODE_LABELS[m] };
  }
  if (m === AI_MODE.CONDITIONAL) {
    return { bg: theme.warningLight, color: theme.warning, label: AI_MODE_LABELS[m] };
  }
  return { bg: theme.successLight, color: theme.success, label: AI_MODE_LABELS[m] };
}
