import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { stageAPI } from '../../services/api';
import { THEME, AI_TOOLS } from '../../config/api';

export default function CreateStageScreen({ navigation, route }) {
  const { assignmentId } = route.params;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aiAllowed, setAiAllowed] = useState(false);
  const [selectedTools, setSelectedTools] = useState([]);
  const [guidance, setGuidance] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleTool = (toolName) => {
    setSelectedTools(prev =>
      prev.includes(toolName) ? prev.filter(t => t !== toolName) : [...prev, toolName]
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('입력 오류', '단계 제목을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      await stageAPI.create({
        assignment_id: assignmentId,
        title: title.trim(),
        description: description.trim(),
        ai_allowed: aiAllowed,
        ai_tools: selectedTools,
        ai_guidance: guidance.trim(),
      });
      navigation.goBack();
      Alert.alert('완료', '단계가 추가되었습니다.');
    } catch (err) {
      Alert.alert('오류', err.message);
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
            placeholder="이 단계에서 학생이 해야 할 내용을 입력하세요"
            placeholderTextColor={THEME.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <View style={styles.aiToggleRow}>
            <View>
              <Text style={styles.aiToggleLabel}>AI 사용 허용</Text>
              <Text style={styles.aiToggleDesc}>
                {aiAllowed ? '✅ 이 단계에서 AI 사용 가능' : '🚫 이 단계에서 AI 사용 불가'}
              </Text>
            </View>
            <Switch
              value={aiAllowed}
              onValueChange={setAiAllowed}
              trackColor={{ false: THEME.border, true: THEME.success + '80' }}
              thumbColor={aiAllowed ? THEME.success : '#f4f3f4'}
            />
          </View>

          {aiAllowed && (
            <>
              <Text style={styles.label}>허용할 AI 도구 (선택 안 하면 전체 허용)</Text>
              <View style={styles.toolGrid}>
                {AI_TOOLS.map(tool => (
                  <TouchableOpacity
                    key={tool.name}
                    style={[styles.toolChip, selectedTools.includes(tool.name) && styles.toolChipActive]}
                    onPress={() => toggleTool(tool.name)}
                  >
                    <Text style={styles.toolChipIcon}>{tool.icon}</Text>
                    <Text style={[styles.toolChipText, selectedTools.includes(tool.name) && styles.toolChipTextActive]}>
                      {tool.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>AI 활용 지침</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="예: AI를 참고 자료로만 활용하고 답을 그대로 복사하지 마세요."
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
  aiToggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: THEME.background, borderRadius: 10, padding: 14, marginTop: 16,
    borderWidth: 1, borderColor: THEME.border,
  },
  aiToggleLabel: { fontSize: 15, fontWeight: '600', color: THEME.text },
  aiToggleDesc: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  toolChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border, gap: 5,
  },
  toolChipActive: { backgroundColor: THEME.successLight, borderColor: THEME.success },
  toolChipIcon: { fontSize: 14 },
  toolChipText: { fontSize: 12, color: THEME.textSecondary },
  toolChipTextActive: { color: THEME.success, fontWeight: '600' },
  createButton: { backgroundColor: THEME.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  createButtonDisabled: { opacity: 0.7 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
