import React, { useCallback } from 'react';
import { View, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreenAPI from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import GlobalModal from './src/components/GlobalModal';
import { THEME } from './src/config/api';

SplashScreenAPI.preventAutoHideAsync().catch(() => {});

const FONT_SOURCES = Platform.OS === 'web'
  ? {
      'Pretendard-Regular': require('./assets/fonts/Pretendard-Regular.ttf'),
      'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.ttf'),
      'Pretendard-SemiBold': require('./assets/fonts/Pretendard-SemiBold.ttf'),
      'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.ttf'),
    }
  : {
      'Pretendard-Regular': require('./assets/fonts/Pretendard-Regular.otf'),
      'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
      'Pretendard-SemiBold': require('./assets/fonts/Pretendard-SemiBold.otf'),
      'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.otf'),
    };

export default function App() {
  const [fontsLoaded] = useFonts(FONT_SOURCES);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) await SplashScreenAPI.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background }}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

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
