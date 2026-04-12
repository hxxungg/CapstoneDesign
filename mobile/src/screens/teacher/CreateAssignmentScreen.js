import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { assignmentAPI, stageAPI } from '../../services/api';
import { THEME, AI_TOOLS } from '../../config/api';

const SUBJECTS = ['국어', '영어', '수학', '과학', '사회', '역사', '도덕', '기술·가정', '미술', '음악', '체육', '기타'];

export default function CreateAssignmentScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [stages, setStages] = useState([
    { title: '', description: '', ai_allowed: false, ai_tools: [], ai_guidance: '' }
  ]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const addStage = () => {
    setStages([...stages, { title: '', description: '', ai_allowed: false, ai_tools: [], ai_guidance: '' }]);
  };

  const removeStage = (idx) => {
    if (stages.length <= 1) {
      Alert.alert('알림', '최소 1개 이상의 단계가 필요합니다.');
      return;
    }
    setStages(stages.filter((_, i) => i !== idx));
  };

  const updateStage = (idx, field, value) => {
    const updated = [...stages];
    updated[idx] = { ...updated[idx], [field]: value };
    setStages(updated);
  };

  const toggleTool = (idx, toolName) => {
    const stage = stages[idx];
    const tools = stage.ai_tools.includes(toolName)
      ? stage.ai_tools.filter(t => t !== toolName)
      : [...stage.ai_tools, toolName];
    updateStage(idx, 'ai_tools', tools);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('입력 오류', '수행평가 제목을 입력해주세요.');
      return;
    }

    const emptyStage = stages.findIndex(s => !s.title.trim());
    if (emptyStage !== -1) {
      Alert.alert('입력 오류', `${emptyStage + 1}번째 단계의 제목을 입력해주세요.`);
      return;
    }

    setLoading(true);
    try {
      const assignment = await assignmentAPI.create({ title: title.trim(), description: description.trim(), subject });

      for (const stage of stages) {
        await stageAPI.create({
          assignment_id: assignment.id,
          title: stage.title.trim(),
          description: stage.description.trim(),
          ai_allowed: stage.ai_allowed,
          ai_tools: stage.ai_tools,
          ai_guidance: stage.ai_guidance.trim(),
        });
      }

      navigation.goBack();
      Alert.alert(
        '✅ 생성 완료',
        `수행평가가 생성되었습니다.\n\n참여 코드: ${assignment.assignment_code}\n\n학생들에게 이 코드를 알려주세요.`
      );
    } catch (err) {
      Alert.alert('생성 실패', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* 기본 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 기본 정보</Text>

          <Text style={styles.label}>수행평가 제목 *</Text>
          <TextInput style={styles.input} placeholder="예: 2학기 역사 신문 만들기" placeholderTextColor={THEME.textSecondary} value={title} onChangeText={setTitle} />

          <Text style={styles.label}>설명</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="수행평가에 대한 설명을 입력하세요"
            placeholderTextColor={THEME.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>과목</Text>
          <View style={styles.subjectGrid}>
            {SUBJECTS.map(sub => (
              <TouchableOpacity
                key={sub}
                style={[styles.subjectChip, subject === sub && styles.subjectChipActive]}
                onPress={() => setSubject(subject === sub ? '' : sub)}
              >
                <Text style={[styles.subjectChipText, subject === sub && styles.subjectChipTextActive]}>{sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 단계 설정 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗂 단계 설정</Text>
          <Text style={styles.sectionDesc}>각 단계에서 AI 사용 허용 여부를 설정하세요.</Text>

          {stages.map((stage, idx) => (
            <View key={idx} style={styles.stageCard}>
              <View style={styles.stageCardHeader}>
                <View style={styles.stageBadge}>
                  <Text style={styles.stageBadgeText}>{idx + 1}</Text>
                </View>
                <Text style={styles.stageCardTitle}>단계 {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeStage(idx)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>✕ 삭제</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>단계 제목 *</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 자료 조사 및 분석"
                placeholderTextColor={THEME.textSecondary}
                value={stage.title}
                onChangeText={(v) => updateStage(idx, 'title', v)}
              />

              <Text style={styles.label}>단계 설명</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="이 단계에서 학생이 해야 할 내용을 입력하세요"
                placeholderTextColor={THEME.textSecondary}
                value={stage.description}
                onChangeText={(v) => updateStage(idx, 'description', v)}
                multiline
                numberOfLines={2}
              />

              <View style={styles.aiToggleRow}>
                <View>
                  <Text style={styles.aiToggleLabel}>AI 사용 허용</Text>
                  <Text style={styles.aiToggleDesc}>
                    {stage.ai_allowed ? '✅ 이 단계에서 AI 사용 가능' : '🚫 이 단계에서 AI 사용 불가'}
                  </Text>
                </View>
                <Switch
                  value={stage.ai_allowed}
                  onValueChange={(v) => updateStage(idx, 'ai_allowed', v)}
                  trackColor={{ false: THEME.border, true: THEME.success + '80' }}
                  thumbColor={stage.ai_allowed ? THEME.success : '#f4f3f4'}
                />
              </View>

              {stage.ai_allowed && (
                <>
                  <Text style={styles.label}>허용할 AI 도구 (선택 안 하면 전체 허용)</Text>
                  <View style={styles.toolGrid}>
                    {AI_TOOLS.map(tool => (
                      <TouchableOpacity
                        key={tool.name}
                        style={[styles.toolChip, stage.ai_tools.includes(tool.name) && styles.toolChipActive]}
                        onPress={() => toggleTool(idx, tool.name)}
                      >
                        <Text style={styles.toolChipIcon}>{tool.icon}</Text>
                        <Text style={[styles.toolChipText, stage.ai_tools.includes(tool.name) && styles.toolChipTextActive]}>
                          {tool.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>AI 활용 지침</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="예: AI를 활용해 참고 자료를 찾되, 직접 작성하세요. AI 답변을 그대로 복사하지 마세요."
                    placeholderTextColor={THEME.textSecondary}
                    value={stage.ai_guidance}
                    onChangeText={(v) => updateStage(idx, 'ai_guidance', v)}
                    multiline
                    numberOfLines={2}
                  />
                </>
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addStageButton} onPress={addStage}>
            <Text style={styles.addStageButtonText}>+ 단계 추가</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>수행평가 생성하기</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  scrollContent: { padding: 16 },
  section: {
    backgroundColor: THEME.card, borderRadius: 16, padding: 18, marginBottom: 16,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: THEME.text, marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: THEME.textSecondary, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: THEME.text, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: THEME.background, borderRadius: 10, padding: 12,
    fontSize: 15, color: THEME.text, borderWidth: 1, borderColor: THEME.border,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  subjectChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border,
  },
  subjectChipActive: { backgroundColor: THEME.primaryLight, borderColor: THEME.primary },
  subjectChipText: { fontSize: 13, color: THEME.textSecondary },
  subjectChipTextActive: { color: THEME.primary, fontWeight: '600' },
  stageCard: {
    backgroundColor: THEME.background, borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: THEME.border,
  },
  stageCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stageBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: THEME.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  stageBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  stageCardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: THEME.text },
  removeButton: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: THEME.dangerLight, borderRadius: 8 },
  removeButtonText: { fontSize: 12, color: THEME.danger },
  aiToggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: THEME.card, borderRadius: 10, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: THEME.border,
  },
  aiToggleLabel: { fontSize: 14, fontWeight: '600', color: THEME.text },
  aiToggleDesc: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  toolChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.border, gap: 4,
  },
  toolChipActive: { backgroundColor: THEME.successLight, borderColor: THEME.success },
  toolChipIcon: { fontSize: 13 },
  toolChipText: { fontSize: 12, color: THEME.textSecondary },
  toolChipTextActive: { color: THEME.success, fontWeight: '600' },
  addStageButton: {
    borderWidth: 2, borderColor: THEME.primary, borderStyle: 'dashed',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  addStageButtonText: { color: THEME.primary, fontWeight: '600', fontSize: 15 },
  createButton: { backgroundColor: THEME.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  createButtonDisabled: { opacity: 0.7 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
