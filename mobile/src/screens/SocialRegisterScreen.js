import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, Modal, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config/api';
import { appAlert } from '../utils/appAlert';

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
      appAlert('입력 오류', '교사에게 받은 초대 코드를 입력해주세요.', null, { type: 'warning' });
      return;
    }
    if (!termsAgreed) { appAlert('동의 필요', '서비스 이용약관에 동의해주세요.', null, { type: 'warning' }); return; }
    if (!privacyAgreed) { appAlert('동의 필요', '개인정보 수집·이용에 동의해주세요.', null, { type: 'warning' }); return; }

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
          <Text style={styles.subtitle}>역할과 추가 정보를 입력해 주세요</Text>
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
          <SPolicyModal visible={!!policyModal} type={policyModal} onClose={() => setPolicyModal(null)} />

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

const S_POLICY = {
  terms:    { title: '서비스 이용약관',           body: "제1조 (목적)\n본 약관은 AI나침반 서비스의 이용 조건에 관한 사항을 규정합니다.\n\n제2조 (서비스 이용)\n학생의 AI 사용 학습을 지원하고 교사가 학습 과정을 모니터링할 수 있도록 돕는 에듀테크 플랫폼입니다.\n\n제3조 (이용자 의무)\n타인의 권리를 침해하거나 법령을 위반하는 행위를 해서는 안 됩니다.\n\n제4조 (면송)\n천재지변 등 불가항력적 사유로 인한 서비스 중단에 대해 접뢰를 지지 않습니다." },
  privacy:  { title: '개인정보 수집·이용 동의',  body: "■ 수집 항목\n- 필수: 이름, 이메일 주소, 역할(교사/학생)\n- 선택: 학교명, 학년, 반, 담당 과목\n\n■ 수집 목적\n- 회원 식별 및 서비스 제공\n- 학습 진도 관리 및 AI 사용 분석\n- 수행평가 참여 기록 보관\n\n■ 보유 기간\n회원 탈퇴 시 즉시 파기\n\n※ 동의를 거부할 권리가 있으나, 거부 시 서비스 이용이 제한됩니다." },
  marketing:{ title: '마케팅 정보 수신 동의 (선택)', body: "■ 수신 목적\n서비스 업데이트, 새로운 기능 안내, 교육 관련 정보 등을 이메일로 수신합니다.\n\n■ 보유 기간\n동의 철회 시까지\n\n※ 미동의 시에도 서비스 이용에 제한이 없습니다." },
};

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

function SPolicyModal({ visible, type, onClose }) {
  const content = type ? S_POLICY[type] : null;
  if (!content) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.policySheet}>
          <View style={styles.policyHeader}>
            <Text style={styles.policyTitle}>{content.title}</Text>
            <Pressable onPress={onClose} style={styles.policyClose}>
              <Text style={styles.policyCloseText}>닫기</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.policyScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.policyBody}>{content.body}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
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
  policySheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 40 },
  policyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: THEME.border },
  policyTitle: { fontSize: 16, fontWeight: '700', color: THEME.text },
  policyClose: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: THEME.background, borderRadius: 8 },
  policyCloseText: { fontSize: 13, color: THEME.textSecondary },
  policyScroll: { padding: 20 },
  policyBody: { fontSize: 13.5, lineHeight: 22, color: THEME.textSoft || THEME.textSecondary },
  consentBox: { gap: 10, padding: 16, backgroundColor: THEME.background, borderRadius: 12, borderWidth: 1, borderColor: THEME.border, marginBottom: 16 },
  consentDivider: { height: 1, backgroundColor: THEME.border },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  consentCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: THEME.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  consentCheckOn: { backgroundColor: THEME.dark || '#1a2640', borderColor: THEME.dark || '#1a2640' },
  consentMark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  consentAllLabel: { fontSize: 13.5, fontWeight: '700', color: THEME.text },
  consentLabel: { fontSize: 13, color: THEME.textSoft || THEME.textSecondary, flex: 1 },
});
