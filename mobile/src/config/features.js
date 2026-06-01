/** APK / expo run:android 네이티브 소셜 테스트 시 .env에서 true */
export const NATIVE_SOCIAL_ENABLED =
  process.env.EXPO_PUBLIC_NATIVE_SOCIAL === 'true';

/** 웹은 항상 브라우저 OAuth. Expo Go·일반 개발에서는 false 권장 */
export const WEB_SOCIAL_ENABLED =
  process.env.EXPO_PUBLIC_WEB_SOCIAL !== 'false';
