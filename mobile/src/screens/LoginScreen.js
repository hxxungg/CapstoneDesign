import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useKakaoAuth } from '../hooks/useKakaoAuth';
import { THEME } from '../config/api';
import { appAlert } from '../utils/appAlert';

const KAKAO_YELLOW = '#FEE500';
const KAKAO_BROWN = '#3C1E1E';

function GoogleIcon() {
  return (
    <View style={iconStyles.googleWrap}>
      <Text style={iconStyles.googleG}>G</Text>
    </View>
  );
}

function KakaoIcon() {
  return (
    <View style={iconStyles.kakaoBubble}>
      <Text style={iconStyles.kakaoK}>k</Text>
    </View>
  );
}

function IconInput({ label, icon, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={20} color={THEME.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholderTextColor="#94A3B8"
          autoCorrect={false}
          {...inputProps}
        />
      </View>
    </View>
  );
}

export default function LoginScreen({ navigation }) {
  const { login, socialLogin } = useAuth();
  const { signIn: signInWithGoogle, isReady: googleReady, getCode } = useGoogleAuth();
  const { signIn: signInWithKakao, isReady: kakaoReady, getKakaoCode } = useKakaoAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null);

  const busy = loading || socialLoading !== null;

  // 웹에서 Google/카카오 OAuth 리디렉션 복귀 시 자동 처리
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    console.log('[OAuth] URL search:', window.location.search);
    console.log('[OAuth] sessionStorage google_oauth_state:', sessionStorage.getItem('google_oauth_state'));
    console.log('[OAuth] sessionStorage kakao_oauth_state:', sessionStorage.getItem('kakao_oauth_state'));

    const googleCode = getCode();
    const kakaoCode = getKakaoCode();

    console.log('[OAuth] googleCode:', googleCode);
    console.log('[OAuth] kakaoCode:', kakaoCode);

    const handleCode = (provider, code) => {
      setSocialLoading(provider);
      // URL 파라미터 정리 (중복 실행 방지)
      window.history.replaceState({}, document.title, window.location.pathname);
      socialLogin({ provider, code })
        .then((result) => {
          if (result?.needsRegistration) {
            navigation.navigate('SocialRegister', {
              provider,
              social_session_token: result.social_session_token,
              profile: result.profile,
            });
          }
        })
        .catch((err) => {
          console.error(`[OAuth] ${provider} 로그인 오류:`, err);
          appAlert(`${provider === 'google' ? 'Google' : '카카오'} 로그인 실패`, err.message, null, { type: 'error' });
        })
        .finally(() => setSocialLoading(null));
    };

    if (googleCode) handleCode('google', googleCode);
    else if (kakaoCode) handleCode('kakao', kakaoCode);
  }, []);


  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      appAlert('입력 오류', '이메일과 비밀번호를 입력해주세요.', null, { type: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      appAlert('로그인 실패', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider, getToken) => {
    setSocialLoading(provider);
    try {
      const tokenResult = await getToken();
      if (!tokenResult) return; // 리디렉션 중이거나 취소

      let payload;
      if (provider === 'google') {
        if (tokenResult.type === 'code') {
          payload = { provider: 'google', code: tokenResult.code };
        } else {
          payload = { provider: 'google', id_token: tokenResult.id_token };
        }
      } else if (provider === 'kakao') {
        if (tokenResult?.type === 'code') {
          payload = { provider: 'kakao', code: tokenResult.code };
        } else {
          payload = { provider: 'kakao', access_token: tokenResult };
        }
      }

      const result = await socialLogin(payload);
      if (result?.needsRegistration) {
        navigation.navigate('SocialRegister', {
          provider,
          social_session_token: result.social_session_token,
          // 네이티브용 fallback (id_token 방식)
          ...(!result.social_session_token && payload.id_token ? { id_token: payload.id_token } : {}),
          profile: result.profile,
        });
      }
    } catch (err) {
      const title = provider === 'google' ? 'Google 로그인 실패' : '카카오 로그인 실패';
      appAlert(title, err.message, null, { type: 'error' });
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.appTitle}>AI나침반</Text>
          <Text style={styles.appSubtitle}>올바른 AI 사용을 위한 스마트 학습 플랫폼</Text>
        </View>

        <View style={styles.card}>
          <IconInput
            label="이메일"
            icon="mail-outline"
            placeholder="example@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <IconInput
            label="비밀번호"
            icon="lock-closed-outline"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={busy}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>로그인</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>또는</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.socialBtn, styles.googleBtn, busy && styles.btnDisabled]}
            onPress={() => {
              if (!googleReady) {
                appAlert('설정 필요', 'mobile/.env에 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID를 추가해 주세요.', null, { type: 'warning' });
                return;
              }
              handleSocial('google', signInWithGoogle);
            }}
            disabled={busy}
            activeOpacity={0.85}
          >
            {socialLoading === 'google' ? (
              <ActivityIndicator color={THEME.text} />
            ) : (
              <>
                <GoogleIcon />
                <Text style={styles.googleBtnText}>Google로 로그인</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.socialBtn, styles.kakaoBtn, busy && styles.btnDisabled]}
            onPress={() => {
              if (!kakaoReady) {
                appAlert('설정 필요', 'mobile/.env에 EXPO_PUBLIC_KAKAO_REST_API_KEY를 추가해 주세요.', null, { type: 'warning' });
                return;
              }
              handleSocial('kakao', signInWithKakao);
            }}
            disabled={busy}
            activeOpacity={0.85}
          >
            {socialLoading === 'kakao' ? (
              <ActivityIndicator color={KAKAO_BROWN} />
            ) : (
              <>
                <KakaoIcon />
                <Text style={styles.kakaoBtnText}>카카오로 로그인</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signupRow}
            onPress={() => navigation.navigate('Register')}
            disabled={busy}
          >
            <Text style={styles.signupMuted}>아직 계정이 없으신가요? </Text>
            <Text style={styles.signupLink}>회원가입</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const iconStyles = StyleSheet.create({
  googleWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  googleG: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4285F4',
  },
  kakaoBubble: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: KAKAO_BROWN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoK: {
    fontSize: 12,
    fontWeight: '800',
    color: KAKAO_YELLOW,
    marginTop: -1,
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.primary,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    paddingBottom: 28,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  appSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 32,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: THEME.text,
  },
  primaryBtn: {
    backgroundColor: THEME.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.65,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 14,
    fontSize: 13,
    color: '#94A3B8',
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 15,
    gap: 10,
    marginBottom: 12,
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  kakaoBtn: {
    backgroundColor: KAKAO_YELLOW,
    marginBottom: 0,
  },
  kakaoBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: KAKAO_BROWN,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
    flexWrap: 'wrap',
  },
  signupMuted: {
    fontSize: 14,
    color: '#64748B',
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.primary,
  },
});
