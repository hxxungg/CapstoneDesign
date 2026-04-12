import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config/api';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [teacherCode, setTeacherCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('입력 오류', '이름, 이메일, 비밀번호를 모두 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('입력 오류', '비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        teacher_code: role === 'student' ? teacherCode.trim() : undefined,
      });
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
          <View style={styles.roleSelector}>
            <TouchableOpacity
              style={[styles.roleButton, role === 'student' && styles.roleButtonActive]}
              onPress={() => setRole('student')}
            >
              <Text style={[styles.roleButtonText, role === 'student' && styles.roleButtonTextActive]}>
                🎓 학생
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, role === 'teacher' && styles.roleButtonActive]}
              onPress={() => setRole('teacher')}
            >
              <Text style={[styles.roleButtonText, role === 'teacher' && styles.roleButtonTextActive]}>
                👩‍🏫 교사
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>이름</Text>
            <TextInput style={styles.input} placeholder="이름을 입력하세요" placeholderTextColor={THEME.textSecondary} value={name} onChangeText={setName} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>이메일</Text>
            <TextInput style={styles.input} placeholder="이메일을 입력하세요" placeholderTextColor={THEME.textSecondary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>비밀번호</Text>
            <TextInput style={styles.input} placeholder="비밀번호 (6자 이상)" placeholderTextColor={THEME.textSecondary} value={password} onChangeText={setPassword} secureTextEntry />
          </View>

          {role === 'student' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>교사 코드</Text>
              <TextInput
                style={styles.input}
                placeholder="담당 교사 코드를 입력하세요"
                placeholderTextColor={THEME.textSecondary}
                value={teacherCode}
                onChangeText={setTeacherCode}
                autoCapitalize="characters"
              />
              <Text style={styles.hint}>교사에게 코드를 받아 입력하세요 (선택)</Text>
            </View>
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
  hint: { fontSize: 12, color: THEME.textSecondary, marginTop: 4 },
  registerButton: { backgroundColor: THEME.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.7 },
  registerButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  loginLink: { alignItems: 'center', marginTop: 20 },
  loginLinkText: { color: THEME.textSecondary, fontSize: 14 },
  loginLinkBold: { color: THEME.primary, fontWeight: '600' },
});
