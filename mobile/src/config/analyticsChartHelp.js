/** 유사도 — 그래프·형광펜 범례 공통 정의 (설명 동일, 표시 라벨은 용도별 분리) */
export const ORIGINALITY_LEGEND_DEF = [
  {
    pieColor: '#E53935',
    highlightColor: '#FFCDD2',
    label: 'AI 의존',
    similarityLabel: 'AI 의존 (70%+)',
    description:
      'AI가 생성한 문장과 70% 이상 유사합니다. AI 결과를 그대로 옮겨 썼을 가능성이 높아 주의가 필요합니다.',
  },
  {
    pieColor: '#F9A825',
    highlightColor: '#FFF9C4',
    label: '주의',
    similarityLabel: '주의 (40–69%)',
    description:
      'AI 답변과 중간 수준으로 유사합니다. 참고는 했으나 스스로 재구성·검증했는지 교사가 함께 확인하는 것이 좋습니다.',
  },
  {
    pieColor: '#43A047',
    highlightColor: '#E8F5E9',
    label: '독창적',
    similarityLabel: '독창적 (~39%)',
    description:
      'AI 답변과 유사도가 낮습니다. 학생이 직접 생각하고 표현한 내용일 가능성이 큽니다.',
    border: true,
  },
];

/** 프롬프트 유형 — 교육과정 기준 정의 (분석 모달용, 표 순서) */
const PROMPT_TYPE_HELP_ITEMS = [
  {
    label: '정보 요구',
    description:
      '특정 정보에 대한 정의나 설명, 개인의 인지역량만으로 해결하기 어려운 정보를 요구함.',
  },
  {
    label: '내용 요약',
    description: '답변의 분량과 형식의 제한을 요구함.',
  },
  {
    label: '비교 및 대조',
    description: '둘 이상의 대상을 견주어 공통점과 차이점 분석을 요구함.',
  },
  {
    label: '예측 및 적용',
    description:
      '특정 상황에 대한 예측이나 특정 법칙 및 지식을 다른 맥락에 적용하는 것을 요구함.',
  },
  {
    label: '판단 및 평가',
    description: '필자의 의사 결정을 보류한 채 주제에 대한 판단과 평가를 요구함.',
  },
  {
    label: '창안',
    description:
      '어휘나 문장 차원의 표현, 특정 형식을 지켜 완결된 글을 쓰도록 요구함.',
  },
];

/** 프롬프트 수준 — 교육과정 기준 정의 (분석 모달용) */
const PROMPT_LEVEL_HELP_ITEMS = [
  {
    label: '1 수준',
    description: '지시하는 내용이 명확하지 않음',
  },
  {
    label: '2 수준',
    description:
      '지시하는 내용은 명확하나 구체적인 사례가 포함되지 않거나 구체적인 사례는 있으나 지시하는 내용이 명확하지 않음',
  },
  {
    label: '3 수준',
    description: '지시하는 내용이 명확하고 구체적인 사례가 포함되어 있음',
  },
  {
    label: '4 수준',
    description: '지시하는 내용이 구체적이고 AI의 응답과 연결하여 질문함',
  },
];

/** 파이 차트 제목·범례 개수 단위 (helpKey 기준) */
export const CHART_COUNT_UNITS = {
  originality: '문장',
  prompt_type: '질문',
  prompt_level: '질문',
  critical_use: '질문',
};

/** 분석 화면 파이 차트 · 유사도 범례 설명 (교사/학생 공통) */
export const CHART_HELP = {
  originality: {
    title: '유사도 분포',
    subtitle: '제출 문장과 AI 답변의 문장 유사도 기준입니다. (그래프: 비율, 형광펜: 문장 배경색)',
    items: ORIGINALITY_LEGEND_DEF.map(({ pieColor, label, description }) => ({
      color: pieColor,
      label,
      description,
    })),
  },
  prompt_type: {
    title: '질문 유형',
    subtitle: 'AI에게 한 질문이 어떤 프롬프트 유형에 해당하는지 분류한 결과입니다.',
    items: PROMPT_TYPE_HELP_ITEMS,
  },
  prompt_level: {
    title: '질문 수준',
    subtitle: '프롬프트 수준(1~4) — 지시 내용의 명확성·구체성·AI 응답 연계 정도입니다.',
    items: PROMPT_LEVEL_HELP_ITEMS,
  },
  critical_use: {
    title: '비판적 사용',
    subtitle: 'AI 답변을 검증·확장하려는 질문인지 구분합니다.',
    items: [
      {
        color: '#7B1FA2',
        label: '비판적 사용',
        description:
          'AI 답변을 그대로 받아들이지 않고, 검증 질문·웹 검색 등으로 내용을 확인·비판하는 활동입니다.',
      },
      {
        color: '#BDBDBD',
        label: '기타',
        description: '요약·정보 요청 등 일반적인 AI 활용 질문입니다.',
      },
    ],
  },
};

/** AI 분석 요약 범례 (그래프와 동일한 진한 색, 유사도 구간 라벨 포함) */
export function getSimilarityLegendRows() {
  return ORIGINALITY_LEGEND_DEF.map(({ pieColor, label, similarityLabel }) => ({
    color: pieColor,
    label: similarityLabel ?? label,
  }));
}

export function getChartHelp(key) {
  return CHART_HELP[key] ?? null;
}

export function getChartHelpSingleItem(key, itemIndex) {
  const base = CHART_HELP[key];
  if (!base?.items?.[itemIndex]) return null;
  const item = base.items[itemIndex];
  return {
    title: item.label,
    subtitle: base.subtitle,
    items: [item],
  };
}
