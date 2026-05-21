import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
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

  const providerLabel = provider === 'kakao' ? 'Kakao' : 'Google';

  const handleSubmit = async () => {
    if (role === 'student' && !inviteCode.trim()) {
      appAlert('입력 오류', '교사에게 받은 초대 코드를 입력해주세요.', null, { type: 'warning' });
      return;
    }

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
});
