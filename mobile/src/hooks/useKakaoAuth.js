import { useCallback } from 'react';
import { Platform } from 'react-native';

const WEB_REDIRECT_URI = 'http://localhost:8081';

// 카카오 Authorization Code Flow (웹 전용 — 리디렉션 방식)
function buildKakaoAuthUrl(restApiKey) {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionStorage.setItem('kakao_oauth_state', state);
  sessionStorage.setItem('oauth_pending_provider', 'kakao');

  const params = new URLSearchParams({
    client_id: restApiKey,
    redirect_uri: WEB_REDIRECT_URI,
    response_type: 'code',
    state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

// ?code=... 쿼리 파라미터에서 카카오 코드 파싱
function getKakaoCodeFromQuery() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code) return null;

  const storedKakaoState = sessionStorage.getItem('kakao_oauth_state');
  const storedGoogleState = sessionStorage.getItem('google_oauth_state');

  // Google 리디렉션 코드인 경우 무시
  if (!storedKakaoState && storedGoogleState) return null;

  // state 검증 (storedState가 있을 때만)
  if (storedKakaoState && state !== storedKakaoState) {
    console.warn('[Kakao OAuth] state mismatch — possible CSRF');
    return null;
  }

  // storedState가 없으면 oauth_pending_provider로 확인
  if (!storedKakaoState) {
    const pendingProvider = sessionStorage.getItem('oauth_pending_provider');
    if (pendingProvider !== 'kakao') return null;
  }

  sessionStorage.removeItem('kakao_oauth_state');
  sessionStorage.removeItem('oauth_pending_provider');
  window.history.replaceState(null, '', window.location.pathname);
  return code;
}

export function useKakaoAuth() {
  const restApiKey = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
  const isWeb = Platform.OS === 'web';

  const getKakaoCode = useCallback(() => {
    if (!isWeb) return null;
    return getKakaoCodeFromQuery();
  }, [isWeb]);

  const signIn = async () => {
    if (!restApiKey) {
      throw new Error('Kakao REST API 키가 설정되지 않았습니다. mobile/.env를 확인하세요.');
    }

    if (isWeb) {
      const code = getKakaoCodeFromQuery();
      if (code) return { type: 'code', code };
      window.location.href = buildKakaoAuthUrl(restApiKey);
      return null;
    }

    // 네이티브: 현재 웹에서만 지원
    throw new Error('카카오 로그인은 현재 웹에서만 지원됩니다.');
  };

  return {
    signIn,
    isReady: Boolean(restApiKey),
    getKakaoCode,
  };
}
