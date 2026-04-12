import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI, stageAPI } from '../../services/api';
import { THEME } from '../../config/api';
import { getTeacherAiModeStyle } from '../../config/defaultPerformanceStages';
import { appAlert } from '../../utils/appAlert';

export default function AssignmentDetailScreen({ navigation, route }) {
  const { assignment: initialAssignment } = route.params;
  const [assignment, setAssignment] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [detail, studentList] = await Promise.all([
        assignmentAPI.getDetail(initialAssignment.id),
        assignmentAPI.getStudents(initialAssignment.id),
      ]);
      setAssignment(detail);
      setStudents(studentList);
    } catch (err) {
      appAlert('오류', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleDeleteStage = (stage) => {
    appAlert('단계 삭제', `"${stage.title}" 단계를 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: () => {
          const id = Number(stage.id);
          setTimeout(() => {
            (async () => {
              try {
                await stageAPI.remove(id);
                await loadData();
              } catch (err) {
                appAlert('오류', err.message);
              }
            })();
          }, 0);
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={THEME.primary} /></View>;
  }

  const stages = assignment?.stages || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={THEME.primary} />}
    >
      {/* 헤더 정보 */}
      <View style={styles.headerCard}>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>참여 코드</Text>
          <Text style={styles.codeValue}>{assignment?.assignment_code}</Text>
          <Text style={styles.codeHint}>학생들에게 이 코드를 알려주세요</Text>
        </View>

        {assignment?.subject && <Text style={styles.subject}>{assignment.subject}</Text>}
        <Text style={styles.title}>{assignment?.title}</Text>
        {assignment?.description && <Text style={styles.desc}>{assignment.description}</Text>}

        <TouchableOpacity
          style={styles.analyticsButton}
          onPress={() => navigation.navigate('Analytics', { assignmentId: assignment.id, title: assignment.title })}
        >
          <Text style={styles.analyticsButtonText}>📊 종합 분석 보기</Text>
        </TouchableOpacity>
      </View>

      {/* 단계 목록 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📋 단계 목록 ({stages.length}개)</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('CreateStage', { assignmentId: assignment.id })}
          >
            <Text style={styles.addButtonText}>+ 추가</Text>
          </TouchableOpacity>
        </View>

        {stages.length === 0 ? (
          <Text style={styles.emptyText}>단계를 추가해주세요.</Text>
        ) : (
          stages.map((stage) => {
            const aiStyle = getTeacherAiModeStyle(THEME, stage);
            return (
            <View key={stage.id} style={styles.stageRow}>
              <View style={styles.stageOrderBadge}>
                <Text style={styles.stageOrderText}>{stage.order_num}</Text>
              </View>
              <View style={styles.stageInfo}>
                <View style={styles.stageTitleRow}>
                  <Text style={styles.stageTitle}>{stage.title}</Text>
                  <View style={[styles.aiBadge, { backgroundColor: aiStyle.bg }]}>
                    <Text style={[styles.aiBadgeText, { color: aiStyle.color }]}>
                      {aiStyle.label}
                    </Text>
                  </View>
                </View>
                {stage.description && <Text style={styles.stageDesc} numberOfLines={1}>{stage.description}</Text>}
              </View>
              <TouchableOpacity
                style={styles.stageDeleteButton}
                onPress={() => handleDeleteStage(stage)}
              >
                <Text style={styles.stageDeleteText}>✕</Text>
              </TouchableOpacity>
            </View>
            );
          })
        )}
      </View>

      {/* 참여 학생 목록 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👥 참여 학생 ({students.length}명)</Text>

        {students.length === 0 ? (
          <Text style={styles.emptyText}>아직 참여한 학생이 없습니다.</Text>
        ) : (
          students.map((student) => (
            <TouchableOpacity
              key={student.id}
              style={styles.studentRow}
              onPress={() => navigation.navigate('StudentLogs', {
                studentId: student.id,
                studentName: student.name,
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
              })}
            >
              <View style={styles.studentAvatar}>
                <Text style={styles.studentAvatarText}>{student.name[0]}</Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentProgress}>
                  {student.status === 'completed' ? '✅ 완료' : `단계 ${student.current_stage_order}/${stages.length} 진행중`}
                  {student.exit_attempts > 0 && <Text style={styles.exitAttemptText}>  ⚠️ 이탈시도 {student.exit_attempts}회</Text>}
                </Text>
              </View>
              <View style={styles.logCountBadge}>
                <Text style={styles.logCountText}>{student.log_count}개 로그</Text>
              </View>
              <Text style={styles.arrowText}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  subject: { fontSize: 12, fontWeight: '600', color: THEME.textSecondary, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: THEME.text, marginBottom: 6 },
  desc: { fontSize: 14, color: THEME.textSecondary, lineHeight: 20, marginBottom: 12 },
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
  addButton: { backgroundColor: THEME.primaryLight, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  addButtonText: { color: THEME.primary, fontWeight: '600', fontSize: 13 },
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
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: THEME.border },
  studentAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: THEME.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  studentAvatarText: { fontSize: 16, fontWeight: 'bold', color: THEME.primary },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '600', color: THEME.text },
  studentProgress: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  exitAttemptText: { color: THEME.warning },
  logCountBadge: { backgroundColor: THEME.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 6 },
  logCountText: { fontSize: 11, color: THEME.textSecondary },
  arrowText: { fontSize: 20, color: THEME.textSecondary },
});
