// 실기기에서 테스트할 경우 localhost를 PC의 실제 IP 주소로 변경하세요
// 예: 'http://192.168.1.100:3000/api'
// 웹 브라우저: localhost, 실기기(Expo Go): Mac의 실제 IP (예: 172.30.1.16)
const isWeb = typeof document !== 'undefined';
export const API_BASE_URL = isWeb
  ? 'http://localhost:3000/api'
  : 'http://172.30.1.16:3000/api';

export const AI_TOOLS = [
  { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖' },
  { name: 'Google Gemini', url: 'https://gemini.google.com', icon: '✨' },
  { name: 'Claude AI', url: 'https://claude.ai', icon: '🧠' },
  { name: 'Perplexity AI', url: 'https://www.perplexity.ai', icon: '🔍' },
  { name: 'Microsoft Copilot', url: 'https://copilot.microsoft.com', icon: '💡' },
  { name: 'WRTN (뤼튼)', url: 'https://wrtn.ai', icon: '🇰🇷' },
];

export const THEME = {
  primary: '#3B82F6',
  primaryDark: '#1D4ED8',
  primaryLight: '#EFF6FF',
  secondary: '#8B5CF6',
  success: '#10B981',
  successLight: '#ECFDF5',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  background: '#F1F5F9',
  card: '#FFFFFF',
  text: '#1E293B',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  shadow: '#00000015',
};
