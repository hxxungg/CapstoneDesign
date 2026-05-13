import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config/api';

const GRADES = ['1학년', '2학년', '3학년'];

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);

  // 공통
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [school, setSchool] = useState('');

  // 교사 전용
  const [subject, setSubject] = useState('');

  // 학생 전용
  const [grade, setGrade] = useState('');
  const [classNum, setClassNum] = useState('');

  const validate = () => {
    if (!name.trim()) return '이름을 입력해주세요.';
    if (!email.trim()) return '이메일을 입력해주세요.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return '올바른 이메일 형식을 입력해주세요.';
    if (!password) return '비밀번호를 입력해주세요.';
    if (password.length < 6) return '비밀번호는 6자 이상이어야 합니다.';
    if (password !== passwordConfirm) return '비밀번호가 일치하지 않습니다.';
    return null;
  };

  const handleRegister = async () => {
    const error = validate();
    if (error) {
      Alert.alert('입력 오류', error);
      return;
    }

    const payload = {
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      school: school.trim() || undefined,
    };

    if (role === 'teacher') {
      payload.subject = subject.trim() || undefined;
    } else {
      payload.grade = grade || undefined;
      payload.class_num = classNum.trim() || undefined;
    }

    setLoading(true);
    try {
      await register(payload);
    } catch (err) {
      Alert.alert('회원가입 실패', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.appName}>회원가입</Text>
          <Text style={styles.subtitle}>수행평가 AI 관리 플랫폼</Text>
        </View>

        <View style={styles.form}>
          {/* 역할 선택 */}
          <View style={styles.roleSelector}>
            <TouchableOpacity
              style={[styles.roleButton, role === 'student' && styles.roleButtonActive]}
              onPress={() => setRole('student')}
            >
              <Text style={[styles.roleButtonText, role === 'student' && styles.roleButtonTextActive]}>
                학생
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, role === 'teacher' && styles.roleButtonActive]}
              onPress={() => setRole('teacher')}
            >
              <Text style={[styles.roleButtonText, role === 'teacher' && styles.roleButtonTextActive]}>
                교사
              </Text>
            </TouchableOpacity>
          </View>

          {/* 공통 입력 */}
          <Field label="이름 *" value={name} onChangeText={setName} placeholder="이름을 입력하세요" />
          <Field label="이메일 *" value={email} onChangeText={setEmail} placeholder="이메일을 입력하세요" keyboardType="email-address" autoCapitalize="none" />
          <Field label="비밀번호 * (6자 이상)" value={password} onChangeText={setPassword} placeholder="비밀번호를 입력하세요" secureTextEntry />
          <Field label="비밀번호 확인 *" value={passwordConfirm} onChangeText={setPasswordConfirm} placeholder="비밀번호를 다시 입력하세요" secureTextEntry />
          <Field label="학교명" value={school} onChangeText={setSchool} placeholder="소속 학교명 (선택)" />

          {/* 교사 전용 */}
          {role === 'teacher' && (
            <>
              <Field label="담당 과목" value={subject} onChangeText={setSubject} placeholder="담당 과목 (선택)" />
              <Field label="반" value={classNum} onChangeText={setClassNum} placeholder="담당 반 (예: 3)" keyboardType="numeric" />
            </>
          )}

          {/* 학생 전용 */}
          {role === 'student' && (
            <>
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
            style={[styles.registerButton, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.registerButtonText}>회원가입</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginLink} onPress={() => navigation.goBack()}>
            <Text style={styles.loginLinkText}>이미 계정이 있으신가요? <Text style={styles.loginLinkBold}>로그인</Text></Text>
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
  appName: { fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  form: { backgroundColor: THEME.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, flex: 1 },
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
  registerButton: { backgroundColor: THEME.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.7 },
  registerButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  loginLink: { alignItems: 'center', marginTop: 20 },
  loginLinkText: { color: THEME.textSecondary, fontSize: 14 },
  loginLinkBold: { color: THEME.primary, fontWeight: '600' },
});
