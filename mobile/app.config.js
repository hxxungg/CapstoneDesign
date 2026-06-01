const appJson = require('./app.json');

const nativeSocial = process.env.EXPO_PUBLIC_NATIVE_SOCIAL === 'true';

const basePlugins = [
  'expo-web-browser',
  'expo-font',
  '@react-native-community/datetimepicker',
];

/** APK·expo run:android 소셜 테스트 시에만 포함 (Expo Go / 웹 개발은 제외) */
const nativeSocialPlugins = nativeSocial
  ? [
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
      [
        'expo-build-properties',
        {
          android: {
            extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/'],
            kotlinVersion: '2.1.20',
          },
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
