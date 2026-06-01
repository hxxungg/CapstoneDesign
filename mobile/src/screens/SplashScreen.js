import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { THEME, FONTS } from '../config/api';
import BrandMark from '../components/BrandMark';

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('code')) {
        navigation.replace('Login');
      }
    }
  }, []);

  return (
    <View style={s.screen}>
      <LinearGradient
        colors={[THEME.card, THEME.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Center column */}
      <View style={s.center}>
        <BrandMark size={104} />

        <View style={s.titleWrap}>
          <Text style={s.appName}>AI 나침반</Text>
          <Text style={s.appSub}>생성형 AI의 교육적 활용을 위한{'\n'}과정 중심 평가 시스템</Text>
        </View>

        <View style={s.btnWrap}>
          <TouchableOpacity
            style={s.startBtn}
            onPress={() => navigation.replace('Login')}
            activeOpacity={0.85}
          >
            <Text style={s.startBtnText}>시작하기</Text>
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: THEME.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingTop: Platform.OS === 'ios' ? 8 : 8,
  },
  titleWrap: { alignItems: 'center', gap: 0 },
  appName: {
    fontFamily: FONTS.serifKoBold,
    fontSize: 52,
    color: THEME.text,
    letterSpacing: -1,
    lineHeight: 60,
    includeFontPadding: false,
  },
  appSub: {
    marginTop: 14,
    fontFamily: FONTS.sans,
    fontSize: 14.5,
    color: THEME.textSoft,
    textAlign: 'center',
    lineHeight: 22,
  },
  appTag: {
    marginTop: 4,
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: THEME.textSecondary,
    letterSpacing: 2,
    textAlign: 'center',
  },
  btnWrap: { marginTop: 20, width: 280, gap: 10 },
  startBtn: {
    height: 52,
    backgroundColor: THEME.dark,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: {
    color: '#fff',
    fontFamily: FONTS.sansMedium,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  footer: { paddingVertical: 18, alignItems: 'center' },
  footerText: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: THEME.textFaint,
    letterSpacing: 1,
  },
});
