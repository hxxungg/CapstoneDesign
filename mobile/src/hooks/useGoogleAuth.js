import { useCallback } from 'react';
import { Platform } from 'react-native';

const WEB_REDIRECT_URI = 'http://localhost:8081';

// Authorization Code Flow (웹) — 표준 리디렉션 방식
function buildGoogleAuthUrl(clientId) {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionStorage.setItem('google_oauth_state', state);
  sessionStorage.setItem('oauth_pending_provider', 'google');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: WEB_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// 구글이 ?code=...&state=... 쿼리 파라미터로 리디렉션해서 돌아올 때 파싱
function getCodeFromQuery() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const storedState = sessionStorage.getItem('google_oauth_state');

  if (!code) return null;
  if (state !== storedState) {
    console.warn('[Google OAuth] state mismatch — possible CSRF');
    return null;
  }

  sessionStorage.removeItem('google_oauth_state');
  sessionStorage.removeItem('oauth_pending_provider');
  window.history.replaceState(null, '', window.location.pathname);

  return code;
}

export function useGoogleAuth() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const isWeb = Platform.OS === 'web';

  const getCode = useCallback(() => {
    if (!isWeb) return null;
    return getCodeFromQuery();
  }, [isWeb]);

  const signIn = async () => {
    if (!webClientId) {
      throw new Error('Google 클라이언트 ID가 설정되지 않았습니다. mobile/.env를 확인하세요.');
    }

    // 웹: Authorization Code Flow (리디렉션)
    if (isWeb) {
      const code = getCodeFromQuery();
      if (code) return { type: 'code', code };
      window.location.href = buildGoogleAuthUrl(webClientId);
      return null;
    }

    // 네이티브: 현재 웹에서만 지원
    throw new Error('Google 로그인은 현재 웹에서만 지원됩니다.');
  };

  return {
    signIn,
    isReady: Boolean(webClientId),
    getCode,
  };
}
