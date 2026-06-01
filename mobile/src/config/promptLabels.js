/** AI 프롬프트 질문 유형 (분석 화면 공통) */
export const PROMPT_TYPE_LABEL = {
  summary:  '내용 요약',
  compare:  '비교 및 대조',
  predict:  '예측 및 적용',
  evaluate: '판단 및 평가',
  generate: '창안',
  info:     '정보 요구',
};

export function getPromptTypeLabel(key) {
  if (!key) return PROMPT_TYPE_LABEL.info;
  return PROMPT_TYPE_LABEL[key] ?? key;
}
