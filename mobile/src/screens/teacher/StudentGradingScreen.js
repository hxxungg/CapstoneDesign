import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { assessmentAPI, analyticsAPI } from '../../services/api';
import { THEME, FONTS } from '../../config/api';
import { appAlert } from '../../utils/appAlert';
import AppShell from '../../components/AppShell';
import GradingRubricView from '../../components/GradingRubricView';
import { createDefaultRubricState } from '../../components/GradingRubricTable';

const C = THEME;
const F = FONTS;

export default function StudentGradingScreen({ navigation, route }) {
  const {
    participationId,
    assessmentId,
    studentName,
    assessmentTitle,
  } = route.params;

  const [rubric, setRubric] = useState(null);
  const [finalScore, setFinalScore] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [assessment, analytics] = await Promise.all([
        assessmentAPI.getDetail(assessmentId),
        analyticsAPI.getParticipationAnalytics(participationId),
      ]);
      setRubric(assessment?.rubric ?? null);
      const saved = analytics?.evaluation?.score;
      setFinalScore(saved != null && saved !== '' ? String(saved) : '');
    } catch (err) {
      console.error(err);
      appAlert('불러오기 실패', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [participationId, assessmentId]));

  const handleSave = async () => {
    const trimmed = finalScore.trim();
    if (!trimmed) {
      appAlert('입력 오류', '최종 점수를 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await analyticsAPI.saveParticipationGrade(participationId, { final_score: trimmed });
      appAlert('저장 완료', '최종 점수가 저장되었습니다.');
      navigation.goBack();
    } catch (err) {
      appAlert('저장 실패', err.message, null, { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const rubricData = createDefaultRubricState(rubric);

  return (
    <AppShell navigation={navigation} currentScreen="home">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.container}>
          <View style={s.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={18} color={C.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.pageTag}>평가 설계</Text>
              <Text style={s.pageTitle} numberOfLines={1}>{studentName}</Text>
              <Text style={s.pageSubTitle} numberOfLines={1}>{assessmentTitle}</Text>
            </View>
          </View>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={s.section}>
                <GradingRubricView rubric={rubric} />
              </View>

              <View style={s.finalScoreCard}>
                <Text style={s.finalScoreLabel}>최종 점수</Text>
                <TextInput
                  style={s.finalScoreInput}
                  value={finalScore}
                  onChangeText={setFinalScore}
                  placeholder="점수 입력"
                  placeholderTextColor={C.textFaint}
                  keyboardType="numeric"
                />
                {rubricData.areaMaxScore ? (
                  <Text style={s.finalScoreHint}>영역 만점: {rubricData.areaMaxScore}점</Text>
                ) : null}
              </View>

              <Pressable
                style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>저장</Text>}
              </Pressable>

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    flexShrink: 0,
  },
  pageTag: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary, letterSpacing: 1.2, marginBottom: 1 },
  pageTitle: { fontFamily: F.sansBold, fontSize: 17, color: C.text },
  pageSubTitle: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, marginTop: 2 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  section: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  finalScoreCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
    gap: 10,
  },
  finalScoreLabel: { fontFamily: F.sansMedium, fontSize: 14, color: C.text },
  finalScoreInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: F.sansBold,
    fontSize: 20,
    color: C.text,
    backgroundColor: C.background,
    textAlign: 'center',
  },
  finalScoreHint: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, textAlign: 'center' },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveBtnText: { fontFamily: F.sansMedium, fontSize: 15, color: '#fff' },
});
