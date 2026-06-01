import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config/api';
import { appAlert } from '../utils/appAlert';
import { VALIDATION } from '../utils/uiCopy';
import PolicyModal from '../components/PolicyModal';

const GRADES = ['1학년', '2학년', '3학년'];

export default function SocialRegisterScreen({ navigation, route }) {
  const { socialRegister } = useAuth();
  const { provider, id_token, access_token, code, social_session_token, profile } = route.params;
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
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

  const providerLabel = provider === 'kakao' ? 'Kakao' : 'Google';

  const handleSubmit = async () => {
    if (role === 'student' && !inviteCode.trim()) {
      appAlert('입력 오류', VALIDATION.inviteCode, null, { type: 'warning' });
      return;
    }
    if (!termsAgreed) { appAlert('동의 필요', VALIDATION.terms, null, { type: 'warning' }); return; }
    if (!privacyAgreed) { appAlert('동의 필요', VALIDATION.privacy, null, { type: 'warning' }); return; }

    const payload = {
      provider,
      // social_session_token 우선 사용 (코드 재사용 방지), 없으면 id_token/access_token fallback
      ...(social_session_token
        ? { social_session_token }
        : code
          ? { code }
          : { id_token, access_token }),
      role,
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
    try {
      await socialRegister(payload);
    } catch (err) {
      appAlert('가입 실패', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.appName}>{providerLabel} 계정 연동</Text>
          <Text style={styles.subtitle}>역할과 추가 정보를 입력하면 가입이 완료됩니다.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.profileBox}>
            <Text style={styles.profileName}>{profile?.name}</Text>
            <Text style={styles.profileEmail}>{profile?.email}</Text>
          </View>

          <View style={styles.roleSelector}>
            <TouchableOpacity
              style={[styles.roleButton, role === 'student' && styles.roleButtonActive]}
              onPress={() => setRole('student')}
            >
              <Text style={[styles.roleButtonText, role === 'student' && styles.roleButtonTextActive]}>학생</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, role === 'teacher' && styles.roleButtonActive]}
              onPress={() => setRole('teacher')}
            >
              <Text style={[styles.roleButtonText, role === 'teacher' && styles.roleButtonTextActive]}>교사</Text>
            </TouchableOpacity>
          </View>

          <Field label="학교명" value={school} onChangeText={setSchool} placeholder="소속 학교명 (선택)" />

          {role === 'teacher' && (
            <Field label="담당 과목" value={subject} onChangeText={setSubject} placeholder="담당 과목 (선택)" />
          )}

          {role === 'student' && (
            <>
              <Field
                label="초대 코드 *"
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="교사에게 받은 초대 코드"
                autoCapitalize="characters"
              />
              <View style={styles.inputGroup}>
                <Text style={styles.label}>학년</Text>
                <View style={styles.gradeSelector}>
                  {GRADES.map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.gradeButton, grade === g && styles.gradeButtonActive]}
                      onPress={() => setGrade(g)}
                    >
                      <Text style={[styles.gradeButtonText, grade === g && styles.gradeButtonTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <Field label="반" value={classNum} onChangeText={setClassNum} placeholder="반 (예: 3)" keyboardType="numeric" />
            </>
          )}

          {/* 동의 항목 */}
          <View style={styles.consentBox}>
            <Pressable style={styles.consentRow} onPress={toggleAll}>
              <View style={[styles.consentCheck, allChecked && styles.consentCheckOn]}>
                {allChecked && <Text style={styles.consentMark}>{'✓'}</Text>}
              </View>
              <Text style={styles.consentAllLabel}>전체 동의</Text>
            </Pressable>
            <View style={styles.consentDivider} />
            <SConsentRow checked={termsAgreed} onToggle={() => setTermsAgreed(v => !v)} label="[필수] 서비스 이용약관 동의" onView={() => setPolicyModal('terms')} />
            <SConsentRow checked={privacyAgreed} onToggle={() => setPrivacyAgreed(v => !v)} label="[필수] 개인정보 수집·이용 동의" onView={() => setPolicyModal('privacy')} />
            <SConsentRow checked={marketingAgreed} onToggle={() => setMarketingAgreed(v => !v)} label="[선택] 마케팅 정보 수신 동의" onView={() => setPolicyModal('marketing')} />
          </View>
          <PolicyModal visible={!!policyModal} type={policyModal} onClose={() => setPolicyModal(null)} />

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>가입 완료</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={styles.backLinkText}>취소</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SConsentRow({ checked, onToggle, label, onView }) {
  return (
    <View style={styles.consentRow}>
      <Pressable onPress={onToggle} style={[styles.consentCheck, checked && styles.consentCheckOn]}>
        {checked && <Text style={styles.consentMark}>{'✓'}</Text>}
      </Pressable>
      <Pressable onPress={onToggle} style={{ flex: 1 }}>
        <Text style={styles.consentLabel}>{label}</Text>
      </Pressable>
      <Pressable onPress={onView} style={styles.consentViewBtn}>
        <Text style={styles.consentViewBtnText}>보기</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={THEME.textSecondary} autoCorrect={false} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.primary },
  scrollContent: { flexGrow: 1 },
  header: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  appName: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, lineHeight: 24, color: 'rgba(255,255,255,0.8)' },
  form: { backgroundColor: THEME.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, flex: 1 },
  profileBox: { backgroundColor: THEME.primaryLight, borderRadius: 12, padding: 16, marginBottom: 20 },
  profileName: { fontSize: 16, fontWeight: '700', color: THEME.text },
  profileEmail: { fontSize: 14, color: THEME.textSecondary, marginTop: 4 },
  roleSelector: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  roleButton: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: THEME.border, alignItems: 'center' },
  roleButtonActive: { borderColor: THEME.primary, backgroundColor: THEME.primaryLight },
  roleButtonText: { fontSize: 15, color: THEME.textSecondary, fontWeight: '600' },
  roleButtonTextActive: { color: THEME.primary },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: THEME.text, marginBottom: 6 },
  input: { backgroundColor: THEME.background, borderRadius: 12, padding: 14, fontSize: 16, color: THEME.text, borderWidth: 1, borderColor: THEME.border },
  gradeSelector: { flexDirection: 'row', gap: 10 },
  gradeButton: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: THEME.border, alignItems: 'center' },
  gradeButtonActive: { borderColor: THEME.primary, backgroundColor: THEME.primaryLight },
  gradeButtonText: { fontSize: 14, color: THEME.textSecondary, fontWeight: '600' },
  gradeButtonTextActive: { color: THEME.primary },
  submitButton: { backgroundColor: THEME.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  backLink: { alignItems: 'center', marginTop: 20 },
  backLinkText: { color: THEME.textSecondary, fontSize: 14 },
  consentViewBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: THEME.border },
  consentViewBtnText: { fontSize: 11, color: THEME.textSecondary },
  consentBox: { gap: 10, padding: 16, backgroundColor: THEME.background, borderRadius: 12, borderWidth: 1, borderColor: THEME.border, marginBottom: 16 },
  consentDivider: { height: 1, backgroundColor: THEME.border },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  consentCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: THEME.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  consentCheckOn: { backgroundColor: THEME.dark || '#1a2640', borderColor: THEME.dark || '#1a2640' },
  consentMark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  consentAllLabel: { fontSize: 13.5, fontWeight: '700', color: THEME.text },
  consentLabel: { fontSize: 13, color: THEME.textSoft || THEME.textSecondary, flex: 1 },
});
