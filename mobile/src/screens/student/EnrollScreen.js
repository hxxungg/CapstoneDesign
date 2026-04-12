import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { assignmentAPI } from '../../services/api';
import { THEME } from '../../config/api';

export default function EnrollScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEnroll = async () => {
    if (!code.trim()) {
      Alert.alert('입력 오류', '수행평가 코드를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const result = await assignmentAPI.enroll(code.trim().toUpperCase());
      navigation.goBack();
      Alert.alert('참여 완료', `"${result.assignment.title}" 수행평가에 참여했습니다.`);
    } catch (err) {
      Alert.alert('참여 실패', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        <Text style={styles.icon}>🔑</Text>
        <Text style={styles.title}>수행평가 참여</Text>
        <Text style={styles.desc}>교사에게 받은 수행평가 코드를 입력하세요.</Text>

        <TextInput
          style={styles.input}
          placeholder="예: ASNABCD1234"
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { flex: 1, padding: 32, justifyContent: 'center', alignItems: 'center' },
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
