import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { assessmentAPI } from '../../services/api';
import { THEME, FONTS } from '../../config/api';
import { getTeacherAiModeStyle } from '../../config/defaultPerformanceStages';
import { appAlert } from '../../utils/appAlert';
import AppShell from '../../components/AppShell';

const C = THEME;
const F = FONTS;

export default function AssignmentDetailScreen({ navigation, route }) {
  const { assignment: initialAssignment } = route.params;
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 단계 삭제 모달
  const [deleteStepTarget, setDeleteStepTarget] = useState(null);
  const [deletingStep, setDeletingStep] = useState(false);

  const loadData = async () => {
    try {
      const detail = await assessmentAPI.getDetail(initialAssignment.id);
      setAssessment(detail);
    } catch (err) {
      appAlert('오류', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleDeleteStepConfirm = async () => {
    if (!deleteStepTarget) return;
    setDeletingStep(true);
    try {
      await assessmentAPI.removeStep(assessment.id, deleteStepTarget.id);
      setDeleteStepTarget(null);
      await loadData();
    } catch (err) {
      setDeleteStepTarget(null);
      appAlert('오류', err.message);
    } finally {
      setDeletingStep(false);
    }
  };

  if (loading) {
    return (
      <AppShell navigation={navigation} currentScreen="home">
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color={C.primary} /></View>
      </AppShell>
    );
  }

  const steps = assessment?.steps || [];

  return (
    <AppShell navigation={navigation} currentScreen="home">
    <View style={styles.container}>
      {/* ── 뒤로가기 ──────────────────────────────────── */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={18} color={C.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.primary} />}
      >
        {/* 헤더 정보 */}
        <View style={styles.headerCard}>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>초대 코드</Text>
            <Text style={styles.codeValue}>{assessment?.invite_code}</Text>
            <Text style={styles.codeHint}>학생들에게 이 코드를 공유할 수 있습니다</Text>
          </View>

          <Text style={styles.title}>{assessment?.title}</Text>
          {assessment?.description ? <Text style={styles.desc}>{assessment.description}</Text> : null}

          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: assessment?.status === 'active' ? THEME.successLight : '#f5f5f5' }]}>
              <Text style={[styles.statusText, { color: assessment?.status === 'active' ? THEME.success : THEME.textSecondary }]}>
                {assessment?.status === 'active' ? '● 활성' : '○ 마감'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.analyticsButton}
            onPress={() => navigation.navigate('Analytics', { assignmentId: assessment.id, title: assessment.title })}
          >
            <Text style={styles.analyticsButtonText}>📊 종합 분석 보기</Text>
          </TouchableOpacity>
        </View>

        {/* 단계 목록 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 단계 목록 ({steps.length}개)</Text>
          </View>

          {steps.length === 0 ? (
            <Text style={styles.emptyText}>단계를 추가해야 합니다.</Text>
          ) : (
            steps.map((step) => {
              const aiStyle = getTeacherAiModeStyle(THEME, step);
              return (
                <View key={step.id} style={styles.stageRow}>
                  <View style={styles.stageOrderBadge}>
                    <Text style={styles.stageOrderText}>{step.step_order}</Text>
                  </View>
                  <View style={styles.stageInfo}>
                    <View style={styles.stageTitleRow}>
                      <Text style={styles.stageTitle}>{step.title}</Text>
                      <View style={[styles.aiBadge, { backgroundColor: aiStyle.bg }]}>
                        <Text style={[styles.aiBadgeText, { color: aiStyle.color }]}>{aiStyle.label}</Text>
                      </View>
                    </View>
                    {step.description ? <Text style={styles.stageDesc} numberOfLines={1}>{step.description}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={styles.stageDeleteButton}
                    onPress={() => setDeleteStepTarget({ id: step.id, title: step.title })}
                  >
                    <Text style={styles.stageDeleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 단계 삭제 확인 모달 */}
      <Modal visible={!!deleteStepTarget} transparent animationType="fade" onRequestClose={() => !deletingStep && setDeleteStepTarget(null)} statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.deleteModalIcon}>🗑️</Text>
            <Text style={styles.modalTitle}>단계 삭제</Text>
            <Text style={styles.deleteModalMsg}>
              <Text style={styles.deleteModalBold}>"{deleteStepTarget?.title}"</Text>
              {'\n'}단계를 삭제하시겠습니까?{'\n'}
              <Text style={styles.deleteModalWarn}>이 작업은 취소할 수 없습니다.</Text>
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setDeleteStepTarget(null)}
                disabled={deletingStep}
              >
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn, deletingStep && styles.btnDisabled]}
                onPress={handleDeleteStepConfirm}
                disabled={deletingStep}
              >
                {deletingStep
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmBtnText}>삭제</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // 뒤로가기
  topBar: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, backgroundColor: C.background },
  backBtn: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 10,
  },

  scrollContent: { padding: 16 },
  headerCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 14,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3,
  },
  codeBox: {
    backgroundColor: C.primaryLight, borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: C.primary + '30', alignItems: 'center',
  },
  codeLabel: { fontFamily: F.mono, fontSize: 11, color: C.primary, letterSpacing: 1 },
  codeValue: { fontFamily: F.mono, fontSize: 26, color: C.primary, letterSpacing: 3, marginTop: 4 },
  codeHint: { fontFamily: F.sans, fontSize: 11, color: C.textSecondary, marginTop: 4 },
  title: { fontFamily: F.serifKo, fontSize: 20, color: C.text, marginBottom: 6 },
  desc: { fontFamily: F.sans, fontSize: 14, color: C.textSecondary, lineHeight: 20, marginBottom: 12 },
  statusRow: { marginBottom: 12 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontFamily: F.sansSemi, fontSize: 12 },
  analyticsButton: {
    backgroundColor: C.secondary + '15', borderRadius: 10, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: C.secondary + '30',
  },
  analyticsButtonText: { fontFamily: F.sansSemi, color: C.secondary, fontSize: 14 },
  section: {
    backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 14,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontFamily: F.sansBold, fontSize: 16, color: C.text },
  emptyText: { fontFamily: F.sans, fontSize: 14, color: C.textSecondary, textAlign: 'center', paddingVertical: 16 },
  stageRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  stageOrderBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stageOrderText: { color: '#fff', fontFamily: F.sansBold, fontSize: 13 },
  stageInfo: { flex: 1 },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageTitle: { fontFamily: F.sansSemi, fontSize: 14, color: C.text, flex: 1 },
  aiBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  aiBadgeText: { fontFamily: F.sansBold, fontSize: 10 },
  stageDesc: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, marginTop: 2 },
  stageDeleteButton: { padding: 8 },
  stageDeleteText: { color: C.danger, fontSize: 16, fontFamily: F.sansBold },
  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,27,45,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: C.background, borderRadius: 16, padding: 24, width: 340, borderWidth: 1, borderColor: C.border },
  deleteModalIcon: { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  modalTitle: { fontFamily: F.serifKo, fontSize: 20, color: C.text, textAlign: 'center', marginBottom: 4 },
  deleteModalMsg: { fontFamily: F.sans, fontSize: 14.5, color: C.text, textAlign: 'center', lineHeight: 24, marginVertical: 12 },
  deleteModalBold: { fontFamily: F.sansBold },
  deleteModalWarn: { fontFamily: F.sans, fontSize: 13, color: C.danger },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  confirmBtn: { backgroundColor: C.danger },
  cancelBtnText: { fontFamily: F.sansMedium, fontSize: 15, color: C.textSecondary },
  confirmBtnText: { fontFamily: F.sansMedium, fontSize: 15, color: '#fff' },
  btnDisabled: { opacity: 0.6 },
});
