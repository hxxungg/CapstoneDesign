import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Keyboard, Pressable,
} from 'react-native';
import { assignmentAPI, assessmentAPI } from '../../services/api';
import { THEME } from '../../config/api';
import { appAlert } from '../../utils/appAlert';
import { VALIDATION } from '../../utils/uiCopy';

export default function EnrollScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEnroll = async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      appAlert('입력 오류', VALIDATION.assessmentCode, null, { type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      // 신규 assessments 시스템 먼저 시도
      const result = await assessmentAPI.join(trimmedCode);
      navigation.goBack();
      setTimeout(() => {
        appAlert('참여 완료', result.message || `수행평가에 참여했습니다.`, null, { type: 'success' });
      }, 400);
    } catch (err) {
      // 409: 이미 참여 중
      if (err.status === 409) {
        navigation.goBack();
        setTimeout(() => {
          appAlert('이미 참여 중', '이미 참여한 수행평가입니다.', null, { type: 'info' });
        }, 400);
        return;
      }

      // 404: 새 시스템에 코드 없음 → 구 assignments 시스템 시도
      if (err.status === 404) {
        try {
          const oldResult = await assignmentAPI.enroll(trimmedCode);
          navigation.goBack();
          setTimeout(() => {
            appAlert('참여 완료', `"${oldResult.assignment?.title}" 수행평가에 참여했습니다.`, null, { type: 'success' });
          }, 400);
          return;
        } catch (oldErr) {
          appAlert('참여 실패', '유효하지 않은 수행평가 코드입니다.', null, { type: 'error' });
          return;
        }
      }

      appAlert('참여 실패', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={styles.content} onPress={Keyboard.dismiss}>
        <Text style={styles.icon}>🔑</Text>
        <Text style={styles.title}>수행평가 참여</Text>
        <Text style={styles.desc}>교사에게 받은 수행평가 초대 코드를 입력하면 참여할 수 있습니다.</Text>

        <TextInput
          style={styles.input}
          placeholder="예: AB12CD34"
          placeholderTextColor={THEME.textSecondary}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={15}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleEnroll}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>참여하기</Text>}
        </TouchableOpacity>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { flex: 1, padding: 32, justifyContent: 'center', alignItems: 'center', width: '100%' },
  icon: { fontSize: 64, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: THEME.text, marginBottom: 10 },
  desc: { fontSize: 15, color: THEME.textSecondary, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  input: {
    width: '100%', backgroundColor: THEME.card, borderRadius: 14, padding: 18,
    fontSize: 20, color: THEME.text, borderWidth: 2, borderColor: THEME.border,
    textAlign: 'center', letterSpacing: 2, marginBottom: 16,
  },
  button: { width: '100%', backgroundColor: THEME.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
