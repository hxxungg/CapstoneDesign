import Constants from 'expo-constants';
import { Platform } from 'react-native';

// 웹: localhost. 네이티브(Expo Go): Metro가 붙은 PC IP를 manifest에서 읽음.
// 터널 모드(npx expo start --tunnel)에서는 로컬 API에 못 붙을 수 있음 → .env에 EXPO_PUBLIC_API_HOST=192.168.x.x
const isWeb = typeof document !== 'undefined';

function getDevBackendHost() {
  const fromEnv = process.env.EXPO_PUBLIC_API_HOST?.trim();
  if (fromEnv) {
    return fromEnv.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  }

  const dbg =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (typeof dbg === 'string' && dbg.length > 0) {
    return dbg.split(':')[0];
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (typeof hostUri === 'string' && hostUri.length > 0) {
    return hostUri.split(':')[0];
  }

  return null;
}

function resolveApiBaseUrl() {
  const host = getDevBackendHost();
  if (host) {
    return `http://${host}:3000/api`;
  }

  if (isWeb) {
    return 'http://localhost:3000/api';
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }

  return 'http://localhost:3000/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

/** 인앱 브라우저 기본 시작 페이지 (일반 웹 탐색) */
export const INAPP_BROWSER_HOME = 'https://www.google.com';

/**
 * 폰트 패밀리 상수 (디자인 시스템 기준)
 * - sans*    : Pretendard (로컬 번들)
 * - serif*   : Newsreader (@expo-google-fonts/newsreader)
 * - mono*    : JetBrains Mono (@expo-google-fonts/jetbrains-mono)
 *
 * RN 주의: fontWeight는 fontFamily 이름으로 지정, letterSpacing은 px 단위만 가능
 */
// theme.ts F 토큰과 동일
export const FONTS = {
  sans:           'Pretendard-Regular',
  sansMedium:     'Pretendard-Medium',
  sansSemi:       'Pretendard-SemiBold',
  sansBold:       'Pretendard-Bold',
  serif:          'Pretendard-Regular',
  serifMed:       'Pretendard-Medium',
  serifItalic:    'Pretendard-Regular',
  serifMedItalic: 'Pretendard-Medium',
  mono:           'Pretendard-Regular',
  monoMed:        'Pretendard-Medium',
  serifKo:        'Pretendard-Regular',
  serifKoBold:    'Pretendard-Bold',
};

export const THEME = {
  // sumi design system
  primary:      '#2A5FE0',   // refined blue — 주요 인터랙션
  primaryDark:  '#1E45B3',
  primaryLight: '#E4ECFC',   // accentSoft
  dark:         '#3B82F6',   // blue — 헤더/사이드바
  secondary:    '#B58A3E',   // gold — AI/배지 강조
  success:      '#3B7A57',
  successLight: '#E2EEE6',
  danger:       '#A9402F',
  dangerLight:  '#FDF0EE',
  warning:      '#B5713A',
  warningLight: '#F4E6D6',
  background:   '#F7F4EC',   // warm cream paper
  card:         '#FCFAF4',   // elevated cream card
  cardLo:       '#EDE7D8',   // recessed surface
  text:         '#0F1B2D',   // ink
  textSoft:     '#3B4658',   // inkSoft
  textSecondary:'#6E7585',   // inkMute
  textFaint:    '#A4A496',   // inkFaint
  border:       '#E1D9C6',   // warm line
  borderSoft:   '#EFE9DB',   // lineSoft
  shadow:       'rgba(15,27,45,0.08)',
};
