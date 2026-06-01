import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useKakaoAuth } from '../hooks/useKakaoAuth';
import { THEME, FONTS } from '../config/api';
import { NATIVE_SOCIAL_ENABLED, WEB_SOCIAL_ENABLED } from '../config/features';
import { appAlert } from '../utils/appAlert';
import { VALIDATION } from '../utils/uiCopy';
import BrandMark from '../components/BrandMark';

const C = THEME;
const F = FONTS;
const KAKAO_YELLOW = '#FEE500';
const KAKAO_BROWN  = '#1A1A1A';

// ── AuthShell (디자인 파일 AuthShell.tsx 기반) ──────────────────────────────
function AuthShell({ title, subtitle, children, footer }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;   // 태블릿/landscape → split, 폰 → 폼만

  if (!isWide) {
    // 폰: 상단 네이비 헤더 + 하단 크림 폼
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.dark }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* 네이비 브랜드 헤더 */}
        <View style={sh.phoneHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BrandMark size={36} />
            <Text style={sh.phoneHeaderName}>AI 나침반</Text>
          </View>
        </View>
        {/* 크림 폼 영역 */}
        <ScrollView
          style={{ flex: 1, backgroundColor: C.background }}
          contentContainerStyle={sh.phoneFormContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={sh.formBox}>
            <View style={{ gap: 4, marginBottom: 28 }}>
              {title ? <Text style={sh.formTitle}>{title}</Text> : null}
              {subtitle ? <Text style={sh.formSub}>{subtitle}</Text> : null}
            </View>
            <View style={{ gap: 20 }}>
              {children}
            </View>
            {footer ? (
              <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 18, marginTop: 8 }}>
                {footer}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // 태블릿: 좌우 split (디자인 파일 그대로)
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.background }}>
      {/* Left — brand panel */}
      <View style={sh.leftPanel}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BrandMark size={36} />
          <Text style={sh.leftBrandName}>AI 나침반</Text>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', maxWidth: 360 }}>
          <Text style={sh.tagline}>AI 활용, 과정이 중요합니다.</Text>
          <Text style={sh.taglineBold}>AI 나침반</Text>
          <Text style={sh.taglineSub}>
            생성형 AI를 안전하고 교육적으로 활용하도록{'\n'}
            수행평가 설계·진행·평가 전 과정에서 그 방향을 잡아드립니다.
          </Text>
        </View>

        <Text style={sh.leftFooter}>© 2026 AI 나침반</Text>
      </View>

      {/* Right — form */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: 380, gap: 28 }}>
          <View>
            {title ? <Text style={sh.formTitle}>{title}</Text> : null}
            {subtitle ? <Text style={sh.formSub}>{subtitle}</Text> : null}
          </View>
          <View style={{ gap: 20 }}>{children}</View>
          {footer ? (
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 18 }}>
              {footer}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const sh = StyleSheet.create({
  // 폰 헤더
  phoneHeader: {
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 28,
    paddingHorizontal: 28,
    backgroundColor: C.dark,
  },
  phoneHeaderName: { fontFamily: F.sansBold, fontSize: 20, color: '#fff', letterSpacing: -0.3 },
  phoneFormContent: { flexGrow: 1, padding: 28, paddingBottom: 48 },
  formBox: { maxWidth: 400, width: '100%', alignSelf: 'center', gap: 0 },

  // 공통 폼 타이틀 — 한글 세리프
  formTitle: {
    fontFamily: F.serifKo,
    fontSize: 28, color: C.text,
    letterSpacing: -0.4, lineHeight: 36,
    marginBottom: 8,
  },
  formSub: {
    fontFamily: F.sans, fontSize: 16, color: C.textSoft, lineHeight: 24,
  },

  // 태블릿 왼쪽 패널
  leftPanel: {
    width: 420,
    backgroundColor: C.dark,
    paddingHorizontal: 44,
    paddingTop: 52,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  leftBrandName: { fontFamily: F.sansBold, fontSize: 20, color: '#fff', letterSpacing: -0.3 },
  tagline: {
    fontFamily: F.serifKo, fontSize: 30, color: '#fff',
    letterSpacing: -0.6, lineHeight: 42,
  },
  taglineBold: {
    marginTop: 10,
    fontFamily: F.serifKoBold,
    fontSize: 38,
    color: '#fff',
    letterSpacing: -0.8,
    lineHeight: 48,
  },
  taglineSub: {
    marginTop: 22, fontFamily: F.sans, fontSize: 13.5,
    color: 'rgba(255,255,255,0.7)', lineHeight: 22,
  },
  featureNum: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  featureNumText: { fontFamily: F.mono, fontSize: 11, color: C.primary },
  featureTitle:   { fontFamily: F.sansMedium, fontSize: 13.5, color: '#fff' },
  featureDesc:    { marginTop: 2, fontFamily: F.sans, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' },
  leftFooter: {
    marginTop: 12,
    marginLeft: -28,
    paddingHorizontal: 12,
    fontFamily: F.mono,
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
  },
});

// ── Field + Input (디자인 파일 Input.tsx 기반) ──────────────────────────────
function Field({ label, hint, children }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={fi.label}>{label}</Text>
      {children}
      {hint ? <Text style={fi.hint}>{hint}</Text> : null}
    </View>
  );
}
function FInput({ focus: _f, ...props }) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={C.textSecondary}
      autoCapitalize="none"
      {...props}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={[fi.input, focus && fi.inputFocus]}
    />
  );
}
const fi = StyleSheet.create({
  label: { fontFamily: F.sansMedium, fontSize: 12.5, color: C.textSoft, letterSpacing: 0.2 },
  hint:  { fontFamily: F.sans, fontSize: 12, color: C.textSecondary },
  input: {
    height: 46, paddingHorizontal: 14,
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 10,
    fontFamily: F.sans, fontSize: 15, color: C.text,
  },
  inputFocus: { borderColor: C.text },
});

// ── Button (디자인 파일 Button.tsx 기반) ────────────────────────────────────
function Btn({ children, variant = 'primary', size = 'md', full, disabled, onPress, loading }) {
  const sizes = { sm: { h: 36, fs: 14, px: 14 }, md: { h: 44, fs: 14.5, px: 18 }, lg: { h: 52, fs: 16, px: 22 } };
  const styles = {
    primary: { bg: C.dark,    fg: C.background, pressed: '#1E2B44' },
    ghost:   { bg: 'transparent', fg: C.text,   bd: C.border, pressed: C.card },
    light:   { bg: C.card,    fg: C.text,   bd: C.border, pressed: '#fff' },
  };
  const sz = sizes[size]; const st = styles[variant] || styles.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        height: sz.h, paddingHorizontal: sz.px,
        backgroundColor: pressed ? st.pressed : st.bg,
        borderWidth: st.bd ? 1 : 0, borderColor: st.bd || 'transparent',
        borderRadius: 12,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: (disabled || loading) ? 0.5 : 1,
        alignSelf: full ? 'stretch' : 'auto',
      })}
    >
      {loading
        ? <ActivityIndicator color={st.fg} />
        : <Text style={{ color: st.fg, fontFamily: F.sansMedium, fontSize: sz.fs, letterSpacing: -0.2 }}>{children}</Text>
      }
    </Pressable>
  );
}

// ── LoginScreen ─────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }) {
  const { login, socialLogin } = useAuth();
  const { signIn: signInWithGoogle, isReady: googleReady, getCode } = useGoogleAuth();
  const { signIn: signInWithKakao, isReady: kakaoReady, getKakaoCode } = useKakaoAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [pwVisible, setPwVisible] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [socialLoading, setSocialLoading] = useState(null);
  const busy = loading || socialLoading !== null;
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const showWebSocial = Platform.OS === 'web' && WEB_SOCIAL_ENABLED;
  const showNativeSocial = Platform.OS !== 'web' && NATIVE_SOCIAL_ENABLED && !isExpoGo;
  const showSocialLogin = showWebSocial || showNativeSocial;

  useEffect(() => {
    if (!showWebSocial) return;
    const googleCode = getCode();
    const kakaoCode  = getKakaoCode();
    const handleCode = (provider, code) => {
      setSocialLoading(provider);
      window.history.replaceState({}, document.title, window.location.pathname);
      socialLogin({ provider, code })
        .then(r => {
          if (r?.needsRegistration) {
            navigation.navigate('SocialRegister', {
              provider, social_session_token: r.social_session_token, profile: r.profile,
            });
          }
        })
        .catch(err => appAlert(`${provider === 'google' ? 'Google' : '카카오'} 로그인 실패`, err.message, null, { type: 'error' }))
        .finally(() => setSocialLoading(null));
    };
    if (googleCode) handleCode('google', googleCode);
    else if (kakaoCode) handleCode('kakao', kakaoCode);
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      appAlert('입력 오류', VALIDATION.emailPassword, null, { type: 'warning' });
      return;
    }
    setLoading(true);
    try { await login(email.trim(), password); }
    catch (err) { appAlert('로그인 실패', err.message, null, { type: 'error' }); }
    finally { setLoading(false); }
  };

  const handleSocial = async (provider, getToken) => {
    setSocialLoading(provider);
    try {
      const t = await getToken();
      if (!t) return;
      let payload;
      if (provider === 'google') {
        payload = t.type === 'code' ? { provider, code: t.code } : { provider, id_token: t.id_token };
      } else {
        payload = t?.type === 'code'
          ? { provider, code: t.code }
          : { provider, access_token: t.access_token };
      }
      const r = await socialLogin(payload);
      if (r?.needsRegistration) {
        navigation.navigate('SocialRegister', {
          provider,
          social_session_token: r.social_session_token,
          ...(!r.social_session_token && payload.id_token ? { id_token: payload.id_token } : {}),
          profile: r.profile,
        });
      }
    } catch (err) {
      appAlert(
        provider === 'google' ? 'Google 로그인 실패' : '카카오 로그인 실패',
        err.message, null, { type: 'error' }
      );
    } finally { setSocialLoading(null); }
  };

  return (
    <AuthShell
      subtitle={showSocialLogin
        ? '이메일 또는 소셜 계정으로 로그인할 수 있습니다.'
        : '이메일로 로그인할 수 있습니다.'}
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.textSoft }}>아직 계정이 없습니다.</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={busy}>
            <Text style={{ fontFamily: F.sansMedium, fontSize: 13.5, color: C.primary }}>회원가입 →</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {/* 이메일/비밀번호 */}
      <View style={{ gap: 14 }}>
        <Field label="이메일">
          <FInput value={email} onChangeText={setEmail} placeholder="name@school.kr" keyboardType="email-address" autoCapitalize="none" />
        </Field>
        <Field label="비밀번호" hint="">
          <View style={{ position: 'relative' }}>
            <FInput value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry={!pwVisible} />
            <TouchableOpacity onPress={() => setPwVisible(v => !v)} style={ls.eyeBtn}>
              <Ionicons name={pwVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
        </Field>

        <Btn variant="primary" size="lg" full onPress={handleLogin} loading={loading} disabled={busy}>
          로그인
        </Btn>
      </View>

      {showSocialLogin && (
        <>
      {/* 소셜 구분선 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.textSecondary }}>또는 소셜 계정으로</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
      </View>

      {/* 소셜 버튼 */}
      <View style={{ gap: 10 }}>
        <Pressable
          onPress={() => {
            if (!googleReady) { appAlert('설정 필요', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID를 mobile/.env에 설정해야 합니다.', null, { type: 'warning' }); return; }
            handleSocial('google', signInWithGoogle);
          }}
          disabled={busy}
          style={({ pressed }) => [ls.socialBtn, { backgroundColor: pressed ? C.card : '#fff', borderColor: C.border }]}
        >
          {socialLoading === 'google'
            ? <ActivityIndicator color={C.text} />
            : <>
                <View style={ls.gIcon}><Text style={{ fontSize: 13, fontFamily: F.sansBold, color: '#4285F4' }}>G</Text></View>
                <Text style={ls.socialBtnText}>Google로 계속하기</Text>
              </>
          }
        </Pressable>

        <Pressable
          onPress={() => {
            if (!kakaoReady) {
              appAlert(
                '설정 필요',
                showWebSocial
                  ? 'EXPO_PUBLIC_KAKAO_REST_API_KEY를 mobile/.env에 설정해야 합니다.'
                  : 'EXPO_PUBLIC_KAKAO_REST_API_KEY와 EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY를 mobile/.env에 설정해야 합니다.',
                null,
                { type: 'warning' }
              );
              return;
            }
            handleSocial('kakao', signInWithKakao);
          }}
          disabled={busy}
          style={({ pressed }) => [ls.socialBtn, { backgroundColor: pressed ? '#F5DC4A' : KAKAO_YELLOW, borderColor: '#FBE34A' }]}
        >
          {socialLoading === 'kakao'
            ? <ActivityIndicator color={KAKAO_BROWN} />
            : <>
                <View style={ls.kIcon}><Text style={{ fontSize: 11, fontFamily: F.sansBold, color: KAKAO_YELLOW }}>k</Text></View>
                <Text style={[ls.socialBtnText, { color: KAKAO_BROWN }]}>카카오로 계속하기</Text>
              </>
          }
        </Pressable>
      </View>
        </>
      )}
    </AuthShell>
  );
}

const ls = StyleSheet.create({
  eyeBtn: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  socialBtn: {
    height: 50, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  socialBtnText: { fontFamily: FONTS.sansMedium, fontSize: 14.5, color: THEME.text },
  gIcon: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  kIcon: {
    width: 20, height: 20, borderRadius: 5, backgroundColor: '#3C1E1E',
    alignItems: 'center', justifyContent: 'center',
  },
});
