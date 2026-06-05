const appJson = require('./app.json');

const nativeSocial = process.env.EXPO_PUBLIC_NATIVE_SOCIAL === 'true';

const withTransparentIconBackground = require('./plugins/withTransparentIconBackground');

const basePlugins = [
  withTransparentIconBackground,
  'expo-web-browser',
  'expo-font',
  '@react-native-community/datetimepicker',
  // Release APK: http:// API (NCP) — Android 9+ cleartext 허용
  [
    'expo-build-properties',
    { android: { usesCleartextTraffic: true } },
  ],
];

/** APK·expo run:android 소셜 테스트 시에만 포함 (Expo Go / 웹 개발은 제외) */
const nativeSocialPlugins = nativeSocial
  ? [
      // expo config-plugins: 배열 뒤쪽이 먼저 실행됨 → build-properties를 앞에 두어
      // kakao-login이 넣는 kotlin 1.5.10을 마지막에 2.1.20으로 덮어씀
      [
        'expo-build-properties',
        {
          android: {
            extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/'],
            kotlinVersion: '2.1.20',
          },
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme:
            'com.googleusercontent.apps.228923106472-u69vdjq3c76d9qb91cs68rjki4i8vuvo',
        },
      ],
      [
        '@react-native-seoul/kakao-login',
        {
          kakaoAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,
        },
      ],
    ]
  : [];

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [...basePlugins, ...nativeSocialPlugins],
  },
};
