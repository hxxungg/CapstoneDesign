import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, BackHandler, AppState,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI, logAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, AI_TOOLS } from '../../config/api';
import ExitWarningModal from '../../components/ExitWarningModal';

export default function StageListScreen({ navigation, route }) {
  const { assignment: initialAssignment } = route.params;
  const { user } = useAuth();
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitAttemptCount, setExitAttemptCount] = useState(0);
  const appStateRef = React.useRef(AppState.currentState);

  const loadAssignment = async () => {
    try {
      const data = await assignmentAPI.getDetail(initialAssignment.id);
      setAssignment(data);
    } catch (err) {
      Alert.alert('오류', err.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAssignment();
    }, [])
  );

  // 뒤로가기 버튼 차단
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleExitAttempt('back_button');
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [assignment])
  );

  // 앱 백그라운드 전환 감지
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'active' && nextState === 'background') {
        handleExitAttempt('background');
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [assignment]);

  const handleExitAttempt = async (type) => {
    setExitAttemptCount(prev => prev + 1);
    setShowExitModal(true);

    try {
      await logAPI.recordExitAttempt({
        assignment_id: assignment?.id || initialAssignment.id,
        attempt_type: type,
      });
    } catch (err) {
      console.log('이탈 로그 실패:', err.message);
    }
  };

  const currentStage = assignment?.studentProgress?.current_stage_order || 1;

  const getStageStatus = (stage) => {
    if (stage.order_num < currentStage) return 'completed';
    if (stage.order_num === currentStage) return 'current';
    return 'locked';
  };

  const handleStartStage = () => {
    navigation.navigate('Work', {
      assignment: { id: assignment.id, title: assignment.title },
    });
  };

  const handleAdvanceStage = async () => {
    if (!assignment) return;
    try {
      const result = await assignmentAPI.updateProgress(assignment.id, {
        next_stage_order: currentStage + 1,
      });
      if (result.status === 'completed') {
        Alert.alert('🎉 수행평가 완료!', '모든 단계를 완료했습니다. 수고하셨습니다!');
      }
      loadAssignment();
    } catch (err) {
      Alert.alert('오류', err.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  const stages = assignment?.stages || [];
  const isCompleted = assignment?.studentProgress?.status === 'completed';

  return (
    <View style={styles.container}>
      <ExitWarningModal
        visible={showExitModal}
        onClose={() => setShowExitModal(false)}
        attemptCount={exitAttemptCount}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 수행평가 헤더 */}
        <View style={styles.assignmentHeader}>
          {assignment?.subject && <Text style={styles.subject}>{assignment.subject}</Text>}
          <Text style={styles.assignmentTitle}>{assignment?.title}</Text>
          {assignment?.description && <Text style={styles.assignmentDesc}>{assignment.description}</Text>}
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

        {/* 단계 목록 */}
        <Text style={styles.sectionTitle}>단계별 진행</Text>

        {stages.map((stage) => {
          const status = getStageStatus(stage);
          return (
            <View key={stage.id} style={[styles.stageCard, status === 'locked' && styles.stageCardLocked]}>
              <View style={styles.stageHeader}>
                <View style={styles.stageOrderBadge}>
                  <Text style={styles.stageOrderText}>
                    {status === 'completed' ? '✓' : stage.order_num}
                  </Text>
                </View>
                <View style={styles.stageTitleSection}>
                  <Text style={styles.stageTitleText}>{stage.title}</Text>
                  <View style={[
                    styles.aiStatusBadge,
                    { backgroundColor: stage.ai_allowed ? THEME.successLight : THEME.dangerLight }
                  ]}>
                    <Text style={[styles.aiStatusText, { color: stage.ai_allowed ? THEME.success : THEME.danger }]}>
                      {stage.ai_allowed ? '✅ AI 허용' : '🚫 AI 제한'}
                    </Text>
                  </View>
                </View>
              </View>

              {stage.description && (
                <Text style={styles.stageDescription}>{stage.description}</Text>
              )}

              {stage.ai_allowed && stage.ai_tools?.length > 0 && (
                <View style={styles.allowedTools}>
                  <Text style={styles.allowedToolsLabel}>사용 가능한 AI:</Text>
                  <View style={styles.toolsRow}>
                    {stage.ai_tools.map((tool, idx) => (
                      <View key={idx} style={styles.toolChip}>
                        <Text style={styles.toolChipText}>{tool}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {stage.ai_guidance && (
                <View style={styles.guidanceBox}>
                  <Text style={styles.guidanceTitle}>📌 AI 활용 지침</Text>
                  <Text style={styles.guidanceText}>{stage.ai_guidance}</Text>
                </View>
              )}

              {status === 'current' && !isCompleted && (
                <View style={styles.stageActions}>
                  <TouchableOpacity
                    style={styles.browserButton}
                    onPress={handleStartStage}
                  >
                    <Text style={styles.browserButtonText}>
                      {stage.ai_allowed ? '🤖 단계 시작 (AI 허용)' : '📝 단계 시작'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {status === 'locked' && (
                <View style={styles.lockedOverlay}>
                  <Text style={styles.lockedText}>🔒 이전 단계를 완료하세요</Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },
  assignmentHeader: {
    backgroundColor: THEME.card, borderRadius: 16, padding: 20, marginBottom: 12,
    borderLeftWidth: 4, borderLeftColor: THEME.primary,
  },
  subject: { fontSize: 12, fontWeight: '700', color: THEME.primary, textTransform: 'uppercase', marginBottom: 4 },
  assignmentTitle: { fontSize: 22, fontWeight: 'bold', color: THEME.text, marginBottom: 8 },
  assignmentDesc: { fontSize: 14, color: THEME.textSecondary, lineHeight: 20, marginBottom: 8 },
  progressInfo: { flexDirection: 'row' },
  progressText: { fontSize: 14, fontWeight: '600', color: THEME.primary },
  noticeBanner: {
    backgroundColor: THEME.warningLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: THEME.warning + '40', marginBottom: 16,
  },
  noticeTitle: { fontSize: 13, fontWeight: '700', color: THEME.warning, marginBottom: 6 },
  noticeText: { fontSize: 12, color: THEME.text, lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: THEME.text, marginBottom: 12 },
  stageCard: {
    backgroundColor: THEME.card, borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  stageCardLocked: { opacity: 0.6 },
  stageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stageOrderBadge: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: THEME.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  stageOrderText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  stageTitleSection: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageTitleText: { fontSize: 16, fontWeight: '600', color: THEME.text, flex: 1 },
  aiStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginLeft: 8 },
  aiStatusText: { fontSize: 11, fontWeight: '700' },
  stageDescription: { fontSize: 13, color: THEME.textSecondary, lineHeight: 18, marginBottom: 10, marginLeft: 46 },
  allowedTools: { marginLeft: 46, marginBottom: 8 },
  allowedToolsLabel: { fontSize: 12, color: THEME.textSecondary, marginBottom: 4 },
  toolsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toolChip: { backgroundColor: THEME.successLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  toolChipText: { fontSize: 11, color: THEME.success, fontWeight: '600' },
  guidanceBox: {
    backgroundColor: THEME.primaryLight, borderRadius: 10, padding: 12,
    marginLeft: 46, marginBottom: 8,
  },
  guidanceTitle: { fontSize: 12, fontWeight: '700', color: THEME.primary, marginBottom: 4 },
  guidanceText: { fontSize: 12, color: THEME.text, lineHeight: 18 },
  stageActions: { marginLeft: 46, gap: 8, marginTop: 4 },
  browserButton: {
    backgroundColor: THEME.success, borderRadius: 10, padding: 12, alignItems: 'center',
  },
  browserButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  advanceButton: {
    backgroundColor: THEME.primary, borderRadius: 10, padding: 12, alignItems: 'center',
  },
  advanceButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  lockedOverlay: {
    marginLeft: 46, marginTop: 4, padding: 8, alignItems: 'center',
  },
  lockedText: { fontSize: 12, color: THEME.textSecondary },
});
