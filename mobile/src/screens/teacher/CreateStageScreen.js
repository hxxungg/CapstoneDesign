import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { stageAPI } from '../../services/api';
import { THEME } from '../../config/api';
import {
  AI_MODE,
  DEFAULT_CONDITIONAL_GUIDANCE,
} from '../../config/defaultPerformanceStages';
import { appAlert } from '../../utils/appAlert';
import { VALIDATION } from '../../utils/uiCopy';

const AI_MODE_OPTIONS = [
  { key: AI_MODE.ALLOWED, label: '허용', sub: '탐색 가능' },
  { key: AI_MODE.CONDITIONAL, label: '조건부', sub: '지침에 따라' },
  { key: AI_MODE.DISALLOWED, label: '비허용', sub: 'AI·웹 없음' },
];

export default function CreateStageScreen({ navigation, route }) {
  const { assignmentId } = route.params;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aiMode, setAiMode] = useState(AI_MODE.DISALLOWED);
  const [guidance, setGuidance] = useState('');
  const [loading, setLoading] = useState(false);

  const changeAiMode = (mode) => {
    setAiMode(mode);
    if (mode === AI_MODE.DISALLOWED) {
      setGuidance('');
    } else if (mode === AI_MODE.CONDITIONAL) {
      setGuidance((g) => ((g || '').trim() ? g : DEFAULT_CONDITIONAL_GUIDANCE));
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      appAlert('입력 오류', VALIDATION.stageTitle);
      return;
    }

    setLoading(true);
    try {
      await stageAPI.create({
        assignment_id: assignmentId,
        title: title.trim(),
        description: description.trim(),
        ai_mode: aiMode,
        ai_guidance: aiMode === AI_MODE.DISALLOWED ? '' : guidance.trim(),
      });
      navigation.goBack();
      setTimeout(() => {
        appAlert('완료', '단계가 추가되었습니다.', null, { type: 'success' });
      }, 400);
    } catch (err) {
      appAlert('오류', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>단계 제목 *</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 자료 조사 및 분석"
            placeholderTextColor={THEME.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>단계 설명</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="학생이 이 단계에서 수행할 내용"
            placeholderTextColor={THEME.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>AI 허용 기준</Text>
          <View style={styles.aiModeRow}>
            {AI_MODE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.aiModeChip, aiMode === opt.key && styles.aiModeChipActive]}
                onPress={() => changeAiMode(opt.key)}
              >
                <Text style={[styles.aiModeChipTitle, aiMode === opt.key && styles.aiModeChipTitleActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.aiModeChipSub, aiMode === opt.key && styles.aiModeChipSubActive]}>{opt.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {aiMode !== AI_MODE.DISALLOWED && (
            <>
              <Text style={styles.label}>AI 활용 지침</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="예: AI를 참고 자료로만 활용하고 답을 그대로 복사하지 않습니다."
                placeholderTextColor={THEME.textSecondary}
                value={guidance}
                onChangeText={setGuidance}
                multiline
                numberOfLines={3}
              />
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>단계 추가하기</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  scrollContent: { padding: 16 },
  card: {
    backgroundColor: THEME.card, borderRadius: 16, padding: 18, marginBottom: 16,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  label: { fontSize: 13, fontWeight: '600', color: THEME.text, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: THEME.background, borderRadius: 10, padding: 12,
    fontSize: 15, color: THEME.text, borderWidth: 1, borderColor: THEME.border,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  aiModeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  aiModeChip: {
    flex: 1, minWidth: 88, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 10, backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border,
    alignItems: 'center',
  },
  aiModeChipActive: { backgroundColor: THEME.primaryLight, borderColor: THEME.primary, borderWidth: 2 },
  aiModeChipTitle: { fontSize: 13, fontWeight: '700', color: THEME.textSecondary },
  aiModeChipTitleActive: { color: THEME.primary },
  aiModeChipSub: { fontSize: 10, color: THEME.textSecondary, marginTop: 2, textAlign: 'center' },
  aiModeChipSubActive: { color: THEME.primary },
  createButton: { backgroundColor: THEME.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  createButtonDisabled: { opacity: 0.7 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
