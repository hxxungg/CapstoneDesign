import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, Modal,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, useWindowDimensions,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { THEME, FONTS } from '../config/api';
import { appAlert } from '../utils/appAlert';
import { VALIDATION } from '../utils/uiCopy';
import PolicyModal from '../components/PolicyModal';
import BrandMark from '../components/BrandMark';

const C = THEME;
const F = FONTS;
const GRADES = ['1학년', '2학년', '3학년'];

// ── Field + Input ───────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={fi.label}>{label}</Text>
      {children}
      {hint ? <Text style={fi.hint}>{hint}</Text> : null}
    </View>
  );
}
function FInput(props) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={C.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
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
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    fontFamily: F.sans, fontSize: 15, color: C.text,
  },
  inputFocus: { borderColor: C.text },
});

// ── AuthShell (LoginScreen과 동일) ──────────────────────────────────────────
function AuthShell({ title, subtitle, children, footer }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;

  if (!isWide) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.dark }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={sh.phoneHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BrandMark size={36} />
            <Text style={sh.phoneHeaderName}>AI 나침반</Text>
          </View>
        </View>
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
            <View style={{ gap: 16 }}>{children}</View>
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

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.background }}>
      <View style={sh.leftPanel}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BrandMark size={36} />
          <Text style={sh.leftBrandName}>AI 나침반</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={sh.tagline}>올바른 AI 사용을 위하여</Text>
          <Text style={sh.taglineSub}>
            AI 나침반은 학생이 AI를 올바르게 사용할 수 있도록 돕는 도구입니다.{'\n'}
            교사는 학생의 사고 흐름을 한눈에 확인합니다.
          </Text>

        </View>
        
        <Text style={sh.leftFooter}>© 2026 AI 나침반</Text>
      </View>

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
          <View style={{ gap: 16 }}>{children}</View>
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
  phoneHeader: {
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 28, paddingHorizontal: 28,
    backgroundColor: C.dark,
  },
  phoneHeaderName: { fontFamily: F.sansBold, fontSize: 20, color: '#fff', letterSpacing: -0.3 },
  phoneFormContent: { flexGrow: 1, padding: 28, paddingBottom: 48 },
  formBox: { maxWidth: 400, width: '100%', alignSelf: 'center' },
  formTitle: {
    fontFamily: F.serifKo, fontSize: 28, color: C.text,
    letterSpacing: -0.4, lineHeight: 36, marginBottom: 8,
  },
  formSub: { fontFamily: F.sans, fontSize: 16, color: C.textSoft, lineHeight: 24 },
  leftPanel: {
    width: 420, backgroundColor: C.dark,
    paddingHorizontal: 44, paddingVertical: 52, overflow: 'hidden',
  },
  leftBrandName: { fontFamily: F.sansBold, fontSize: 20, color: '#fff', letterSpacing: -0.3 },
  tagline: { fontFamily: F.serifKo, fontSize: 30, color: '#fff', letterSpacing: -0.6, lineHeight: 42 },
  taglineSub: {
    marginTop: 22, fontFamily: F.sans, fontSize: 13.5,
    color: 'rgba(255,255,255,0.7)', lineHeight: 22,
  },
  leftFooter: { fontFamily: F.mono, fontSize: 10.5, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 },
  featureNum: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  featureNumText: { fontFamily: F.mono, fontSize: 11, color: C.primary },
  featureTitle:   { fontFamily: F.sansMedium, fontSize: 13.5, color: '#fff' },
  featureDesc:    { marginTop: 2, fontFamily: F.sans, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' },
});

function ConsentRow({ checked, onToggle, label, onView }) {
  return (
    <View style={cs.row}>
      <Pressable onPress={onToggle} style={[cs.check, checked && cs.checkOn]}>
        {checked && <Text style={cs.checkMark}>{'✓'}</Text>}
      </Pressable>
      <Pressable onPress={onToggle} style={{ flex: 1 }}>
        <Text style={cs.itemLabel}>{label}</Text>
      </Pressable>
      <Pressable onPress={onView} style={cs.viewBtn}>
        <Text style={cs.viewBtnText}>보기</Text>
      </Pressable>
    </View>
  );
}

const cs = StyleSheet.create({
  box: { gap: 10, padding: 16, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  divider: { height: 1, backgroundColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.background,
  },
  checkOn: { backgroundColor: C.dark, borderColor: C.dark },
  checkMark: { color: '#fff', fontSize: 12, fontFamily: F.sansBold },
  allLabel: { fontFamily: F.sansSemi, fontSize: 13.5, color: C.text },
  itemLabel: { fontFamily: F.sans, fontSize: 13, color: C.textSoft, flex: 1 },
  viewBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  viewBtnText: { fontFamily: F.sans, fontSize: 11, color: C.textSecondary },
});

// ── RegisterScreen ──────────────────────────────────────────────────────────
export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [school, setSchool] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [classNum, setClassNum] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [marketingAgreed, setMarketingAgreed] = useState(false);

  const [policyModal, setPolicyModal] = useState(null);

  const allChecked = termsAgreed && privacyAgreed && marketingAgreed;
  const toggleAll = () => {
    const next = !allChecked;
    setTermsAgreed(next); setPrivacyAgreed(next); setMarketingAgreed(next);
  };

  const validate = () => {
    if (!name.trim()) return VALIDATION.name;
    if (!email.trim()) return VALIDATION.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return VALIDATION.emailFormat;
    if (!password) return VALIDATION.password;
    if (password.length < 6) return '비밀번호는 6자 이상이어야 합니다.';
    if (password !== passwordConfirm) return '비밀번호가 일치하지 않습니다.';
    if (!termsAgreed) return VALIDATION.terms;
    if (!privacyAgreed) return VALIDATION.privacy;
    return null;
  };

  const handleRegister = async () => {
    const error = validate();
    if (error) { appAlert('입력 오류', error, null, { type: 'warning' }); return; }
    if (role === 'student' && !inviteCode.trim()) {
      appAlert('입력 오류', VALIDATION.inviteCode, null, { type: 'warning' });
      return;
    }
    const payload = {
      name: name.trim(), email: email.trim(), password, role,
      school: school.trim() || undefined,
      terms_agreed: termsAgreed,
      privacy_agreed: privacyAgreed,
      marketing_agreed: marketingAgreed,
    };
    if (role === 'teacher') {
      payload.subject = subject.trim() || undefined;
    } else {
      payload.grade = grade || undefined;
      payload.class_num = classNum.trim() || undefined;
      payload.invite_code = inviteCode.trim().toUpperCase();
    }
    setLoading(true);
    try { await register(payload); }
    catch (err) { appAlert('회원가입 실패', err.message, null, { type: 'error' }); }
    finally { setLoading(false); }
  };

  return (
    <AuthShell
      subtitle="이메일로 새 계정을 만들 수 있습니다."
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.textSoft }}>이미 계정이 있습니다.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={loading}>
            <Text style={{ fontFamily: F.sansMedium, fontSize: 13.5, color: C.primary }}>로그인 →</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {/* 역할 선택 */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          ['student', '학생', '수행평가에 참여합니다'],
          ['teacher', '교사', '수행평가를 만들고 봅니다'],
        ].map(([id, label, desc]) => {
          const active = role === id;
          return (
            <Pressable key={id} onPress={() => setRole(id)} style={{
              flex: 1, padding: 14, borderRadius: 12,
              backgroundColor: active ? C.dark : C.card,
              borderWidth: 1, borderColor: active ? C.dark : C.border,
            }}>
              <Text style={{ fontFamily: F.sansSemi, fontSize: 14, color: active ? C.background : C.text }}>{label}</Text>
              <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: active ? 'rgba(255,255,255,0.6)' : C.textSecondary }}>{desc}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 입력 필드 */}
      <Field label="이름 *">
        <FInput value={name} onChangeText={setName} placeholder="홍길동" autoCapitalize="words" />
      </Field>
      <Field label="이메일 *">
        <FInput value={email} onChangeText={setEmail} placeholder="name@school.kr" keyboardType="email-address" />
      </Field>
      <Field label="비밀번호 * (6자 이상)">
        <FInput value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
      </Field>
      <Field label="비밀번호 확인 *">
        <FInput value={passwordConfirm} onChangeText={setPasswordConfirm} placeholder="비밀번호 재입력" secureTextEntry />
      </Field>
      <Field label="학교명">
        <FInput value={school} onChangeText={setSchool} placeholder="○○고등학교 (선택)" />
      </Field>

      {role === 'teacher' && (
        <Field label="담당 과목">
          <FInput value={subject} onChangeText={setSubject} placeholder="국어 (선택)" />
        </Field>
      )}

      {role === 'student' && (
        <>
          <Field label="초대 코드 *">
            <FInput value={inviteCode} onChangeText={setInviteCode} placeholder="교사에게 받은 초대 코드" autoCapitalize="characters" />
          </Field>
          <Field label="학년">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {GRADES.map(g => {
                const active = grade === g;
                return (
                  <Pressable key={g} onPress={() => setGrade(g)} style={{
                    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: active ? C.primary : C.border,
                    backgroundColor: active ? C.primaryLight : C.card,
                  }}>
                    <Text style={{ fontFamily: F.sansSemi, fontSize: 13, color: active ? C.primary : C.textSecondary }}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <Field label="반">
            <FInput value={classNum} onChangeText={setClassNum} placeholder="예: 3" keyboardType="numeric" />
          </Field>
        </>
      )}

      {/* 동의 항목 */}
      <View style={cs.box}>
        <Pressable style={cs.row} onPress={toggleAll}>
          <View style={[cs.check, allChecked && cs.checkOn]}>
            {allChecked && <Text style={cs.checkMark}>{'✓'}</Text>}
          </View>
          <Text style={cs.allLabel}>전체 동의</Text>
        </Pressable>
        <View style={cs.divider} />
        <ConsentRow checked={termsAgreed} onToggle={() => setTermsAgreed(v => !v)}
          label="[필수] 서비스 이용약관 동의" onView={() => setPolicyModal('terms')} />
        <ConsentRow checked={privacyAgreed} onToggle={() => setPrivacyAgreed(v => !v)}
          label="[필수] 개인정보 수집·이용 동의" onView={() => setPolicyModal('privacy')} />
        <ConsentRow checked={marketingAgreed} onToggle={() => setMarketingAgreed(v => !v)}
          label="[선택] 마케팅 정보 수신 동의" onView={() => setPolicyModal('marketing')} />
      </View>
      <PolicyModal visible={!!policyModal} type={policyModal} onClose={() => setPolicyModal(null)} />

      {/* 가입 버튼 */}
      <Pressable
        onPress={handleRegister}
        disabled={loading}
        style={({ pressed }) => ({
          height: 52, borderRadius: 12,
          backgroundColor: pressed ? '#1E2B44' : C.dark,
          alignItems: 'center', justifyContent: 'center',
          opacity: loading ? 0.5 : 1,
        })}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontFamily: F.sansMedium, fontSize: 16, letterSpacing: -0.2 }}>계정 만들기</Text>
        }
      </Pressable>

    </AuthShell>
  );
}
