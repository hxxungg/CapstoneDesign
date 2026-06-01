import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { assignmentAPI, assessmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, FONTS } from '../../config/api';
import { appAlert } from '../../utils/appAlert';
import { stageAllowsAiBrowser, getTeacherAiModeStyle } from '../../config/defaultPerformanceStages';
import AppShell from '../../components/AppShell';

const C = THEME;
const F = FONTS;

export default function StageListScreen({ navigation, route }) {
  // 구 시스템: route.params.assignment
  // 신규 시스템: route.params.participation_id + (assessment_id, title)
  const { assignment: initialAssignment, participation_id, assessment_id } = route.params || {};
  const isNewSystem = !!participation_id;

  const { user } = useAuth();
  const [data, setData] = useState(null);   // 공통 표시 데이터
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      if (isNewSystem) {
        // 신규 assessments 시스템
        const res = await assessmentAPI.getParticipationDetail(participation_id);
        setData({
          _type: 'assessment',
          id: res.assessment_id,
          participation_id: res.participation_id,
          title: res.title,
          description: res.description,
          subject: res.subject,
          status: res.status,
          current_step: res.current_step || 1,
          steps: res.steps || [],
        });
      } else {
        // 구 assignments 시스템
        const res = await assignmentAPI.getDetail(initialAssignment.id);
        setData({ _type: 'assignment', ...res });
      }
    } catch (err) {
      appAlert('오류', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  // ── 구 시스템 ──────────────────────────────────────────────────
  const currentStage = isNewSystem
    ? (data?.current_step || 1)
    : (data?.studentProgress?.current_stage_order || 1);

  const getStageStatus = (stage) => {
    const order = isNewSystem ? stage.step_order : stage.order_num;
    if (order < currentStage) return 'completed';
    if (order === currentStage) return 'current';
    return 'locked';
  };

  const handleStartStage = (stage) => {
    if (isNewSystem) {
      navigation.navigate('Work', {
        participation_id: data.participation_id,
        step_id: stage.id,
        total_steps: (data.steps || []).length,
        assessment: { id: data.id, title: data.title },
        stage: stage,
        total_steps: data.steps?.length || 0,  // 전체 단계 수 전달
      });
    } else {
      navigation.navigate('Work', {
        assignment: { id: data.id, title: data.title },
      });
    }
  };

  const handleAdvanceStage = async () => {
    if (!data) return;
    if (isNewSystem) {
      appAlert('안내', '현재 단계를 완료하고 다음 단계로 이동합니다.', null, { type: 'info' });
      return;
    }
    try {
      const result = await assignmentAPI.updateProgress(data.id, {
        next_stage_order: currentStage + 1,
      });
      if (result.status === 'completed') {
        appAlert('수행평가 완료!', '모든 단계를 완료했습니다. 수고하셨습니다!', null, { type: 'success' });
      }
      loadData();
    } catch (err) {
      appAlert('오류', err.message, null, { type: 'error' });
    }
  };

  if (loading) {
    return (
      <AppShell navigation={navigation} currentScreen="home">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </AppShell>
    );
  }

  const stages = isNewSystem ? (data?.steps || []) : (data?.stages || []);
  const isCompleted = isNewSystem
    ? (data?.status === 'submitted' || data?.status === 'graded')
    : (data?.studentProgress?.status === 'completed');

  const getStageOrder = (stage) => isNewSystem ? stage.step_order : stage.order_num;
  const getStageName = (stage) => stage.title;
  const getStageDesc = (stage) => stage.description;
  const getStageGuidance = () => null;

  return (
    <AppShell navigation={navigation} currentScreen="home">
    <View style={styles.container}>

      {/* ── 뒤로가기 ───────────────────────────────────── */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={18} color={C.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 헤더 */}
        <View style={styles.assignmentHeader}>
          {data?.subject && <Text style={styles.subject}>{data.subject}</Text>}
          <Text style={styles.assignmentTitle}>{data?.title}</Text>
          {data?.description && (
            <Text style={styles.assignmentDesc}>{data.description}</Text>
          )}
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>
              {isCompleted ? '✅ 완료' : `진행 중: ${currentStage}/${stages.length} 단계`}
            </Text>
          </View>
        </View>

        {/* AI 안내 배너 */}
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeTitle}>⚠️ AI 사용 안내</Text>
          <Text style={styles.noticeText}>
            각 단계마다 AI 사용 허용 여부가 다릅니다. AI 사용 가능 단계에서만 인앱 브라우저로 AI를 활용할 수 있으며, 모든 사용 기록이 교사에게 제공됩니다.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>단계별 진행</Text>

        {stages.map((stage) => {
          const status = getStageStatus(stage);
          const aiStyle = getTeacherAiModeStyle(THEME, stage);
          const order = getStageOrder(stage);
          const name = getStageName(stage);
          const desc = getStageDesc(stage);
          const guidance = getStageGuidance(stage);

          return (
            <View
              key={stage.id}
              style={[styles.stageCard, status === 'locked' && styles.stageCardLocked]}
            >
              <View style={styles.stageHeader}>
                <View style={styles.stageOrderBadge}>
                  <Text style={styles.stageOrderText}>
                    {status === 'completed' ? '✓' : order}
                  </Text>
                </View>
                <View style={styles.stageTitleSection}>
                  <Text style={styles.stageTitleText}>{name}</Text>
                  <View style={[styles.aiStatusBadge, { backgroundColor: aiStyle.bg }]}>
                    <Text style={[styles.aiStatusText, { color: aiStyle.color }]}>
                      {aiStyle.label}
                    </Text>
                  </View>
                </View>
              </View>

              {desc ? (
                <Text style={styles.stageDescription}>{desc}</Text>
              ) : null}

              {guidance ? (
                <View style={styles.guidanceBox}>
                  <Text style={styles.guidanceTitle}>📌 AI 활용 지침</Text>
                  <Text style={styles.guidanceText}>{guidance}</Text>
                </View>
              ) : null}

              {status === 'current' && !isCompleted && (
                <View style={styles.stageActions}>
                  <TouchableOpacity
                    style={styles.browserButton}
                    onPress={() => handleStartStage(stage)}
                  >
                    <Text style={styles.browserButtonText}>
                      {stageAllowsAiBrowser(stage) ? '🌐 단계 시작 (AI·웹)' : '📝 단계 시작'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {status === 'locked' && (
                <View style={styles.lockedOverlay}>
                  <Text style={styles.lockedText}>🔒 이전 단계를 완료해야 합니다</Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // 뒤로가기 바
  topBar: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
    backgroundColor: C.background,
  },
  backBtn: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 10,
  },

  scrollContent: { padding: 16, paddingBottom: 40 },

  // 상단 헤더 카드
  assignmentHeader: {
    backgroundColor: C.dark,
    borderRadius: 16, padding: 20, marginBottom: 14,
  },
  subject: { fontFamily: F.mono, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 8 },
  assignmentTitle: { fontFamily: F.serifKo, fontSize: 20, color: '#fff', marginBottom: 8, letterSpacing: -0.3, lineHeight: 28 },
  assignmentDesc: { fontFamily: F.sans, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 19, marginBottom: 10 },
  progressInfo: { flexDirection: 'row' },
  progressText: { fontFamily: F.sansSemi, fontSize: 13, color: C.primaryLight },

  // AI 안내 배너
  noticeBanner: {
    backgroundColor: C.warningLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.warning + '35', marginBottom: 16,
  },
  noticeTitle: { fontFamily: F.sansSemi, fontSize: 12.5, color: C.warning, marginBottom: 5 },
  noticeText: { fontFamily: F.sans, fontSize: 12, color: C.text, lineHeight: 18 },

  sectionTitle: { fontFamily: F.sansSemi, fontSize: 13, color: C.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },

  // 단계 카드
  stageCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  stageCardLocked: { opacity: 0.55 },
  stageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stageOrderBadge: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: C.dark,
    justifyContent: 'center', alignItems: 'center', marginRight: 12, flexShrink: 0,
  },
  stageOrderText: { color: '#fff', fontFamily: F.sansBold, fontSize: 13 },
  stageTitleSection: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  stageTitleText: { fontFamily: F.sansSemi, fontSize: 15.5, color: C.text, flex: 1, letterSpacing: -0.1 },
  aiStatusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, flexShrink: 0 },
  aiStatusText: { fontFamily: F.sansBold, fontSize: 11 },
  stageDescription: { fontFamily: F.sans, fontSize: 13, color: C.textSecondary, lineHeight: 18, marginBottom: 10, marginLeft: 44 },
  guidanceBox: {
    backgroundColor: C.primaryLight, borderRadius: 10, padding: 12,
    marginLeft: 44, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.primary,
  },
  guidanceTitle: { fontFamily: F.sansSemi, fontSize: 11.5, color: C.primary, marginBottom: 4 },
  guidanceText: { fontFamily: F.sans, fontSize: 12, color: C.text, lineHeight: 18 },
  stageActions: { marginLeft: 44, gap: 8, marginTop: 6 },
  browserButton: {
    backgroundColor: C.dark, borderRadius: 10, padding: 12, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  browserButtonText: { color: '#fff', fontFamily: F.sansBold, fontSize: 14 },
  advanceButton: {
    backgroundColor: C.primary, borderRadius: 10, padding: 12, alignItems: 'center',
  },
  advanceButtonText: { color: '#fff', fontFamily: F.sansBold, fontSize: 14 },
  lockedOverlay: { marginLeft: 44, marginTop: 4, padding: 8 },
  lockedText: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary },
});
