export const LEGAL_POLICIES = {
  terms: {
    title: '서비스 이용약관',
    body: '제1조 (목적)\n본 약관은 AI 나침반 서비스의 이용 조건에 관한 사항을 규정합니다.\n\n제2조 (서비스 이용)\n학생의 AI 사용 학습을 지원하고 교사가 학습 과정을 모니터링할 수 있도록 돕는 에듀테크 플랫폼입니다.\n\n제3조 (이용자 의무)\n타인의 권리를 침해하거나 법령을 위반하는 행위를 해서는 안 됩니다.\n\n제4조 (면송)\n천재지변 등 불가항력적 사유로 인한 서비스 중단에 대해 접뢰를 지지 않습니다.',
  },
  privacy: {
    title: '개인정보 수집·이용 동의',
    body: '■ 수집 항목\n- 필수: 이름, 이메일 주소, 역할(교사/학생)\n- 선택: 학교명, 학년, 반, 담당 과목\n\n■ 수집 목적\n- 회원 식별 및 서비스 제공\n- 학습 진도 관리 및 AI 사용 분석\n- 수행평가 참여 기록 보관\n\n■ 보유 기간\n회원 탈퇴 시 즉시 파기\n\n※ 동의를 거부할 권리가 있으나, 거부 시 서비스 이용이 제한됩니다.',
  },
  marketing: {
    title: '마케팅 정보 수신 동의',
    body: '■ 수신 목적\n서비스 업데이트, 새로운 기능 안내, 교육 관련 정보 등을 이메일로 수신합니다.\n\n■ 보유 기간\n동의 철회 시까지\n\n※ 미동의 시에도 서비스 이용에 제한이 없습니다.',
  },
};

export const LEGAL_POLICY_KEYS = ['terms', 'privacy', 'marketing'];

/** 설정 화면 — 마케팅 동의한 사용자에게만 마케팅 약관 표시 */
export function getVisiblePolicyKeys(marketingAgreed) {
  const keys = ['terms', 'privacy'];
  if (marketingAgreed) keys.push('marketing');
  return keys;
}
