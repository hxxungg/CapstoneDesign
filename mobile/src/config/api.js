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
  if (isWeb) {
    return 'http://localhost:3000/api';
  }

  const host = getDevBackendHost();
  if (host) {
    return `http://${host}:3000/api`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }

  return 'http://localhost:3000/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

/** 인앱 브라우저 기본 시작 페이지 (일반 웹 탐색) */
export const INAPP_BROWSER_HOME = 'https://www.google.com';

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
