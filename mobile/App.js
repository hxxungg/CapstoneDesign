import React, { useCallback, useEffect } from 'react';
import { View, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreenAPI from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import GlobalModal from './src/components/GlobalModal';
SplashScreenAPI.preventAutoHideAsync().catch(() => {});

/** Release APK에서 .otf 로딩이 멈추는 경우가 있어 .ttf만 사용 */
const FONT_SOURCES = {
  'Pretendard-Regular': require('./assets/fonts/Pretendard-Regular.ttf'),
  'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.ttf'),
  'Pretendard-SemiBold': require('./assets/fonts/Pretendard-SemiBold.ttf'),
  'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.ttf'),
};

export default function App() {
  const [fontsLoaded] = useFonts(FONT_SOURCES);

  useEffect(() => {
    SplashScreenAPI.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreenAPI.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  const onLayoutRootView = useCallback(async () => {
    await SplashScreenAPI.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <AuthProvider>
          <AppNavigator />
          <GlobalModal />
        </AuthProvider>
      </SafeAreaProvider>
    </View>
  );
}
