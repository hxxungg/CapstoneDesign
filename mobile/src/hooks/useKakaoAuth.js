import { useCallback } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const WEB_REDIRECT_URI = 'http://localhost:8081';

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

function getKakaoCodeFromQuery() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code) return null;

  const storedKakaoState = sessionStorage.getItem('kakao_oauth_state');
  const storedGoogleState = sessionStorage.getItem('google_oauth_state');

  if (!storedKakaoState && storedGoogleState) return null;

  if (storedKakaoState && state !== storedKakaoState) {
    console.warn('[Kakao OAuth] state mismatch — possible CSRF');
    return null;
  }

  if (!storedKakaoState) {
    const pendingProvider = sessionStorage.getItem('oauth_pending_provider');
    if (pendingProvider !== 'kakao') return null;
  }

  sessionStorage.removeItem('kakao_oauth_state');
  sessionStorage.removeItem('oauth_pending_provider');
  window.history.replaceState(null, '', window.location.pathname);
  return code;
}

function mapNativeKakaoError(error) {
  const message = error?.message || String(error);
  if (/cancel/i.test(message) || /CANCEL/i.test(message)) return null;
  if (/invalid android_key_hash|AUTHORIZATION_FAILED/i.test(message)) {
    return (
      '카카오 Android 키 해시가 일치하지 않습니다.\n\n' +
      'Kakao Developers → 앱 → 플랫폼 → Android → 키 해시를 등록해야 합니다.\n' +
      '(앱 설치 후 Metro 로그의 getKeyHashAndroid 안내 참고)'
    );
  }
  return message || '카카오 로그인에 실패했습니다.';
}

export function useKakaoAuth() {
  const restApiKey = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
  const nativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  const isWeb = Platform.OS === 'web';
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const isNative = !isWeb && !isExpoGo;

  const getKakaoCode = useCallback(() => {
    if (!isWeb) return null;
    return getKakaoCodeFromQuery();
  }, [isWeb]);

  const signIn = async () => {
    if (!restApiKey) {
      throw new Error('Kakao REST API 키가 설정되지 않았습니다. mobile/.env를 확인해야 합니다.');
    }

    if (isWeb) {
      const code = getKakaoCodeFromQuery();
      if (code) return { type: 'code', code };
      window.location.href = buildKakaoAuthUrl(restApiKey);
      return null;
    }

    if (isExpoGo) {
      throw new Error(
        '카카오 로그인은 Expo Go에서 지원되지 않습니다.\n\n' +
        'expo run:android 또는 APK에서 테스트할 수 있습니다.'
      );
    }

    if (!nativeAppKey) {
      throw new Error(
        'EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY를 mobile/.env에 설정해야 합니다.\n' +
        '(Kakao Developers → 앱 → 앱 키 → 네이티브 앱 키)'
      );
    }

    try {
      const { loginWithKakaoAccount } = require('@react-native-seoul/kakao-login');
      const token = await loginWithKakaoAccount();
      const accessToken = token?.accessToken;
      if (!accessToken) {
        throw new Error('카카오 access_token을 받지 못했습니다.');
      }
      return { type: 'access_token', access_token: accessToken };
    } catch (error) {
      const message = mapNativeKakaoError(error);
      if (message === null) return null;
      throw new Error(message);
    }
  };

  const nativeClientReady = isNative && Boolean(restApiKey && nativeAppKey);

  return {
    signIn,
    isReady: isWeb ? Boolean(restApiKey) : nativeClientReady,
    getKakaoCode,
    isExpoGo,
  };
};
