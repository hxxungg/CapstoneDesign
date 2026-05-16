import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assessmentAPI } from '../../services/api';
import { THEME } from '../../config/api';
import { getTeacherAiModeStyle } from '../../config/defaultPerformanceStages';
import { appAlert } from '../../utils/appAlert';

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
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={THEME.primary} /></View>;
  }

  const steps = assessment?.steps || [];

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={THEME.primary} />}
      >
        {/* 헤더 정보 */}
        <View style={styles.headerCard}>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>초대 코드</Text>
            <Text style={styles.codeValue}>{assessment?.invite_code}</Text>
            <Text style={styles.codeHint}>학생들에게 이 코드를 알려주세요</Text>
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
            <Text style={styles.emptyText}>단계를 추가해주세요.</Text>
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
      <Modal visible={!!deleteStepTarget} transparent animationType="fade" onRequestClose={() => !deletingStep && setDeleteStepTarget(null)}>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },
  headerCard: {
    backgroundColor: THEME.card, borderRadius: 16, padding: 18, marginBottom: 14,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3,
  },
  codeBox: {
    backgroundColor: THEME.primaryLight, borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: THEME.primary + '30', alignItems: 'center',
  },
  codeLabel: { fontSize: 11, fontWeight: '700', color: THEME.primary, textTransform: 'uppercase', letterSpacing: 1 },
  codeValue: { fontSize: 26, fontWeight: 'bold', color: THEME.primary, letterSpacing: 3, marginTop: 4 },
  codeHint: { fontSize: 11, color: THEME.textSecondary, marginTop: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: THEME.text, marginBottom: 6 },
  desc: { fontSize: 14, color: THEME.textSecondary, lineHeight: 20, marginBottom: 12 },
  statusRow: { marginBottom: 12 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  analyticsButton: {
    backgroundColor: THEME.secondary + '15', borderRadius: 10, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: THEME.secondary + '30',
  },
  analyticsButtonText: { color: THEME.secondary, fontWeight: '600', fontSize: 14 },
  section: {
    backgroundColor: THEME.card, borderRadius: 16, padding: 18, marginBottom: 14,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: THEME.text },
  emptyText: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', paddingVertical: 16 },
  stageRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.border },
  stageOrderBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: THEME.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stageOrderText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  stageInfo: { flex: 1 },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageTitle: { fontSize: 14, fontWeight: '600', color: THEME.text, flex: 1 },
  aiBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  aiBadgeText: { fontSize: 10, fontWeight: '700' },
  stageDesc: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  stageDeleteButton: { padding: 8 },
  stageDeleteText: { color: THEME.danger, fontSize: 16, fontWeight: 'bold' },
  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '85%' },
  deleteModalIcon: { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, textAlign: 'center', marginBottom: 4 },
  deleteModalMsg: { fontSize: 15, color: THEME.text, textAlign: 'center', lineHeight: 24, marginVertical: 12 },
  deleteModalBold: { fontWeight: 'bold' },
  deleteModalWarn: { fontSize: 13, color: THEME.danger },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border },
  confirmBtn: { backgroundColor: THEME.danger },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: THEME.textSecondary },
  confirmBtnText: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
});
