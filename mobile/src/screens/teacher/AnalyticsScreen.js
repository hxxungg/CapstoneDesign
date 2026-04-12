import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { analyticsAPI } from '../../services/api';
import { THEME } from '../../config/api';
import { getTeacherAiModeStyle } from '../../config/defaultPerformanceStages';
import { appAlert } from '../../utils/appAlert';

export default function AnalyticsScreen({ navigation, route }) {
  const { assignmentId, title } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const result = await analyticsAPI.getAssignmentAnalytics(assignmentId);
      setData(result);
    } catch (err) {
      appAlert('오류', err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0초';
    if (seconds < 60) return `${seconds}초`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
    return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`;
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={THEME.primary} /></View>;
  }

  const summary = data?.summary || {};
  const stages = data?.stages || [];
  const students = data?.students || [];
  const toolsUsed = summary.tools_used || {};
  const maxToolCount = Math.max(...Object.values(toolsUsed), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.pageTitle}>{title}</Text>

      {/* 전체 요약 */}
      <View style={styles.summaryGrid}>
        <View style={[styles.summaryCard, styles.summaryCardBlue]}>
          <Text style={styles.summaryValue}>{summary.total_students || 0}</Text>
          <Text style={styles.summaryLabel}>총 참여 학생</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardGreen]}>
          <Text style={[styles.summaryValue, { color: THEME.success }]}>{summary.completed_students || 0}</Text>
          <Text style={styles.summaryLabel}>완료</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardPurple]}>
          <Text style={[styles.summaryValue, { color: THEME.secondary }]}>{summary.total_log_count || 0}</Text>
          <Text style={styles.summaryLabel}>총 AI 활동</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardOrange]}>
          <Text style={[styles.summaryValue, { color: THEME.warning }]}>{summary.total_exit_attempts || 0}</Text>
          <Text style={styles.summaryLabel}>이탈 시도</Text>
        </View>
      </View>

      {/* AI 도구 사용 현황 */}
      {Object.keys(toolsUsed).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 AI 도구 전체 사용 현황</Text>
          {Object.entries(toolsUsed).sort((a, b) => b[1] - a[1]).map(([tool, count]) => (
            <View key={tool} style={styles.toolRow}>
              <Text style={styles.toolName}>{tool}</Text>
              <View style={styles.toolBarWrapper}>
                <View style={[styles.toolBar, { width: `${(count / maxToolCount) * 100}%` }]} />
              </View>
              <Text style={styles.toolCount}>{count}회</Text>
            </View>
          ))}
        </View>
      )}

      {/* 단계별 AI 허용 현황 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 단계별 AI 설정</Text>
        {stages.map((stage) => {
          const aiStyle = getTeacherAiModeStyle(THEME, stage);
          return (
          <View key={stage.id} style={styles.stageAnalyticsRow}>
            <View style={styles.stageOrderBadge}>
              <Text style={styles.stageOrderText}>{stage.order_num}</Text>
            </View>
            <View style={styles.stageAnalyticsInfo}>
              <Text style={styles.stageAnalyticsTitle}>{stage.title}</Text>
            </View>
            <View style={[styles.stageAiBadge, { backgroundColor: aiStyle.bg }]}>
              <Text style={[styles.stageAiBadgeText, { color: aiStyle.color }]}>
                {aiStyle.label}
              </Text>
            </View>
          </View>
        );
        })}
      </View>

      {/* 학생별 현황 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👥 학생별 AI 사용 현황</Text>
        {students.length === 0 ? (
          <Text style={styles.emptyText}>참여한 학생이 없습니다.</Text>
        ) : (
          students.map(({ student, ai_usage, exit_attempts }) => (
            <TouchableOpacity
              key={student.id}
              style={[styles.studentRow, selectedStudent === student.id && styles.studentRowSelected]}
              onPress={() => {
                navigation.navigate('StudentLogs', {
                  studentId: student.id,
                  studentName: student.name,
                  assignmentId,
                  assignmentTitle: title,
                });
              }}
            >
              <View style={styles.studentAvatar}>
                <Text style={styles.studentAvatarText}>{student.name[0]}</Text>
              </View>
              <View style={styles.studentInfo}>
                <View style={styles.studentNameRow}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  {exit_attempts > 0 && (
                    <View style={styles.exitBadge}>
                      <Text style={styles.exitBadgeText}>⚠️ {exit_attempts}회</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.studentProgress}>
                  {student.status === 'completed' ? '✅ 완료' : `단계 ${student.current_stage_order} 진행중`}
                </Text>
                <View style={styles.usageRow}>
                  <Text style={styles.usageStat}>활동: {ai_usage.total_log_count}회</Text>
                  <Text style={styles.usageStat}>시간: {formatDuration(ai_usage.total_duration_seconds)}</Text>
                  {Object.keys(ai_usage.tools_used).length > 0 && (
                    <Text style={styles.usageStat}>도구: {Object.keys(ai_usage.tools_used).join(', ')}</Text>
                  )}
                </View>
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
  pageTitle: { fontSize: 20, fontWeight: 'bold', color: THEME.text, marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  summaryCard: {
    flex: 1, minWidth: '45%', backgroundColor: THEME.card, borderRadius: 14, padding: 14, alignItems: 'center',
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  summaryCardBlue: { borderTopWidth: 3, borderTopColor: THEME.primary },
  summaryCardGreen: { borderTopWidth: 3, borderTopColor: THEME.success },
  summaryCardPurple: { borderTopWidth: 3, borderTopColor: THEME.secondary },
  summaryCardOrange: { borderTopWidth: 3, borderTopColor: THEME.warning },
  summaryValue: { fontSize: 26, fontWeight: 'bold', color: THEME.primary },
  summaryLabel: { fontSize: 12, color: THEME.textSecondary, marginTop: 4 },
  section: {
    backgroundColor: THEME.card, borderRadius: 16, padding: 18, marginBottom: 14,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: THEME.text, marginBottom: 14 },
  toolRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  toolName: { fontSize: 12, color: THEME.text, width: 110 },
  toolBarWrapper: { flex: 1, height: 8, backgroundColor: THEME.border, borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  toolBar: { height: '100%', backgroundColor: THEME.primary, borderRadius: 4 },
  toolCount: { fontSize: 12, color: THEME.textSecondary, width: 30, textAlign: 'right' },
  stageAnalyticsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.border },
  stageOrderBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: THEME.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stageOrderText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  stageAnalyticsInfo: { flex: 1 },
  stageAnalyticsTitle: { fontSize: 14, fontWeight: '600', color: THEME.text },
  stageAiBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  stageAiBadgeText: { fontSize: 11, fontWeight: '700' },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  studentRowSelected: { backgroundColor: THEME.primaryLight },
  studentAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: THEME.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  studentAvatarText: { fontSize: 16, fontWeight: 'bold', color: THEME.primary },
  studentInfo: { flex: 1 },
  studentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  studentName: { fontSize: 15, fontWeight: '600', color: THEME.text },
  exitBadge: { backgroundColor: THEME.warningLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  exitBadgeText: { fontSize: 11, color: THEME.warning, fontWeight: '600' },
  studentProgress: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  usageRow: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  usageStat: { fontSize: 11, color: THEME.primary, backgroundColor: THEME.primaryLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  arrowText: { fontSize: 20, color: THEME.textSecondary },
  emptyText: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', paddingVertical: 16 },
});
