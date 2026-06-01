import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const WEB_REDIRECT_URI = 'http://localhost:8081';

function loadGoogleSigninModule() {
  return require('@react-native-google-signin/google-signin');
}

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

async function signInWithNativeGoogle() {
  const { GoogleSignin, isSuccessResponse } = loadGoogleSigninModule();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (!isSuccessResponse(response)) {
    return null;
  }

  let idToken = response.data?.idToken;
  if (!idToken) {
    const tokens = await GoogleSignin.getTokens();
    idToken = tokens.idToken;
  }
  if (!idToken) {
    throw new Error('Google id_token을 받지 못했습니다.');
  }
  return { type: 'id_token', id_token: idToken };
}

function mapNativeGoogleError(error) {
  const { isErrorWithCode, statusCodes } = loadGoogleSigninModule();
  if (!isErrorWithCode(error)) {
    return error?.message || 'Google 로그인에 실패했습니다.';
  }
  switch (error.code) {
    case statusCodes.SIGN_IN_CANCELLED:
      return null;
    case statusCodes.IN_PROGRESS:
      return 'Google 로그인이 이미 진행 중입니다.';
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return 'Google Play 서비스를 사용할 수 없습니다. 에뮬레이터 이미지에 Play Store가 포함되어 있는지 확인해야 합니다.';
    case statusCodes.DEVELOPER_ERROR:
      return (
        'Google OAuth 설정 오류(DEVELOPER_ERROR)입니다.\n\n' +
        'Google Cloud Console → Android OAuth 클라이언트에서\n' +
        '• 패키지명: com.performanceeval.app\n' +
        '• SHA-1: mobile/android 에서 gradlew signingReport 로 확인한 debug SHA-1\n' +
        '을 등록했는지 확인해야 합니다.'
      );
    default:
      return error.message || 'Google 로그인에 실패했습니다.';
  }
}

export function useGoogleAuth() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const isWeb = Platform.OS === 'web';
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const isNative = !isWeb && !isExpoGo;
  const configuredRef = useRef(false);

  useEffect(() => {
    if (!isNative || !webClientId || configuredRef.current) return;
    const { GoogleSignin } = loadGoogleSigninModule();
    GoogleSignin.configure({
      webClientId,
      iosClientId,
      offlineAccess: false,
    });
    configuredRef.current = true;
  }, [isNative, webClientId, iosClientId]);

  const getCode = useCallback(() => {
    if (!isWeb) return null;
    return getCodeFromQuery();
  }, [isWeb]);

  const signIn = async () => {
    if (isWeb) {
      if (!webClientId) {
        throw new Error('Google 클라이언트 ID가 설정되지 않았습니다. mobile/.env를 확인해야 합니다.');
      }
      const code = getCodeFromQuery();
      if (code) return { type: 'code', code };
      window.location.href = buildGoogleAuthUrl(webClientId);
      return null;
    }

    if (isExpoGo) {
      throw new Error(
        'Google 로그인은 Expo Go에서 지원되지 않습니다.\n\n' +
        '• iPad/iPhone: EAS Build 또는 Mac에서 expo run:ios로 설치한 앱에서 테스트\n' +
        '• Android: expo run:android 또는 APK에서 테스트\n\n' +
        'Expo Go에서는 이메일 로그인을 이용할 수 있습니다.'
      );
    }

    if (!webClientId) {
      throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID를 mobile/.env에 설정해야 합니다.');
    }
    if (Platform.OS === 'android' && !androidClientId) {
      throw new Error('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID를 mobile/.env에 설정해야 합니다.');
    }
    if (Platform.OS === 'ios' && !iosClientId) {
      throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID를 mobile/.env에 설정해야 합니다.');
    }

    if (!configuredRef.current) {
      const { GoogleSignin } = loadGoogleSigninModule();
      GoogleSignin.configure({
        webClientId,
        iosClientId,
        offlineAccess: false,
      });
      configuredRef.current = true;
    }

    try {
      return await signInWithNativeGoogle();
    } catch (error) {
      const message = mapNativeGoogleError(error);
      if (message === null) return null;
      throw new Error(message);
    }
  };

  const nativeClientReady =
    isExpoGo
      ? false
      : isNative
        ? Boolean(webClientId && (Platform.OS === 'android' ? androidClientId : iosClientId))
        : false;

  return {
    signIn,
    isReady: isWeb ? Boolean(webClientId) : nativeClientReady,
    getCode,
    isExpoGo,
  };
}
