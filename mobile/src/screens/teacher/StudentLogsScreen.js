import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { logAPI } from '../../services/api';
import { THEME } from '../../config/api';

export default function StudentLogsScreen({ route }) {
  const { studentId, studentName, assignmentId, assignmentTitle } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const result = await logAPI.getStudentLogs(studentId, assignmentId);
      setData(result);
    } catch (err) {
      Alert.alert('오류', err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0초';
    if (seconds < 60) return `${seconds}초`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={THEME.primary} /></View>;
  }

  const totalDuration = data?.logs?.reduce((sum, l) => sum + (l.duration_seconds || 0), 0) || 0;
  const uniqueUrls = new Set(data?.logs?.map(l => l.url).filter(Boolean));
  const toolsUsed = {};
  data?.logs?.forEach(log => {
    if (log.url) {
      const tool = detectTool(log.url);
      if (tool) toolsUsed[tool] = (toolsUsed[tool] || 0) + 1;
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* 학생 정보 */}
      <View style={styles.studentCard}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>{studentName[0]}</Text>
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>{studentName}</Text>
          <Text style={styles.assignmentName}>{assignmentTitle}</Text>
          <View style={[
            styles.statusBadge,
            { backgroundColor: data?.progress?.status === 'completed' ? THEME.successLight : THEME.primaryLight }
          ]}>
            <Text style={[styles.statusText, { color: data?.progress?.status === 'completed' ? THEME.success : THEME.primary }]}>
              {data?.progress?.status === 'completed' ? '✅ 완료' : `단계 ${data?.progress?.current_stage_order || 1} 진행중`}
            </Text>
          </View>
        </View>
      </View>

      {/* 요약 통계 */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{data?.logs?.length || 0}</Text>
          <Text style={styles.statLabel}>총 AI 활동</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatDuration(totalDuration)}</Text>
          <Text style={styles.statLabel}>총 사용 시간</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{uniqueUrls.size}</Text>
          <Text style={styles.statLabel}>방문 URL</Text>
        </View>
        <View style={[styles.statCard, data?.exitAttempts?.length > 0 && styles.statCardWarning]}>
          <Text style={[styles.statValue, data?.exitAttempts?.length > 0 && styles.statValueWarning]}>
            {data?.exitAttempts?.length || 0}
          </Text>
          <Text style={[styles.statLabel, data?.exitAttempts?.length > 0 && styles.statLabelWarning]}>이탈 시도</Text>
        </View>
      </View>

      {/* AI 도구 사용 현황 */}
      {Object.keys(toolsUsed).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 AI 도구 사용 현황</Text>
          {Object.entries(toolsUsed).sort((a, b) => b[1] - a[1]).map(([tool, count]) => (
            <View key={tool} style={styles.toolRow}>
              <Text style={styles.toolName}>{tool}</Text>
              <View style={styles.toolBarWrapper}>
                <View style={[styles.toolBar, { width: `${Math.min((count / Math.max(...Object.values(toolsUsed))) * 100, 100)}%` }]} />
              </View>
              <Text style={styles.toolCount}>{count}회</Text>
            </View>
          ))}
        </View>
      )}

      {/* 이탈 시도 기록 */}
      {data?.exitAttempts?.length > 0 && (
        <View style={[styles.section, styles.sectionWarning]}>
          <Text style={styles.sectionTitleWarning}>⚠️ 이탈 시도 기록 ({data.exitAttempts.length}회)</Text>
          {data.exitAttempts.map((attempt, idx) => (
            <View key={idx} style={styles.exitRow}>
              <Text style={styles.exitTime}>{formatDate(attempt.created_at)}</Text>
              <Text style={styles.exitType}>
                {attempt.attempt_type === 'back_button' ? '뒤로가기 버튼' :
                  attempt.attempt_type === 'background' ? '앱 백그라운드 전환' :
                  attempt.attempt_type === 'browser_back' ? '브라우저 뒤로가기' : attempt.attempt_type}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* AI 사용 상세 로그 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 AI 사용 로그 상세</Text>
        {data?.logs?.length === 0 ? (
          <Text style={styles.emptyText}>아직 AI 사용 기록이 없습니다.</Text>
        ) : (
          data?.logs?.map((log, idx) => (
            <View key={idx} style={styles.logRow}>
              <View style={styles.logTimeCol}>
                <Text style={styles.logTime}>{formatDate(log.created_at)}</Text>
                {log.duration_seconds > 0 && (
                  <Text style={styles.logDuration}>{formatDuration(log.duration_seconds)}</Text>
                )}
              </View>
              <View style={styles.logContent}>
                {log.stage_title && (
                  <View style={styles.stageChip}>
                    <Text style={styles.stageChipText}>단계 {log.stage_order_num}: {log.stage_title}</Text>
                  </View>
                )}
                {log.page_title && <Text style={styles.logPageTitle} numberOfLines={1}>{log.page_title}</Text>}
                {log.url && <Text style={styles.logUrl} numberOfLines={1}>{log.url}</Text>}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function detectTool(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('chat.openai.com') || u.includes('chatgpt.com')) return 'ChatGPT';
  if (u.includes('gemini.google.com')) return 'Google Gemini';
  if (u.includes('claude.ai')) return 'Claude AI';
  if (u.includes('perplexity.ai')) return 'Perplexity AI';
  if (u.includes('copilot.microsoft.com') || u.includes('bing.com/chat')) return 'Microsoft Copilot';
  if (u.includes('wrtn.ai')) return 'WRTN';
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },
  studentCard: {
    backgroundColor: THEME.card, borderRadius: 16, padding: 18, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3,
  },
  avatarLarge: { width: 56, height: 56, borderRadius: 28, backgroundColor: THEME.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarLargeText: { fontSize: 24, fontWeight: 'bold', color: THEME.primary },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 20, fontWeight: 'bold', color: THEME.text },
  assignmentName: { fontSize: 13, color: THEME.textSecondary, marginTop: 2 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  statusText: { fontSize: 12, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: THEME.card, borderRadius: 14, padding: 14, alignItems: 'center',
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  statCardWarning: { backgroundColor: THEME.warningLight },
  statValue: { fontSize: 22, fontWeight: 'bold', color: THEME.primary },
  statValueWarning: { color: THEME.warning },
  statLabel: { fontSize: 12, color: THEME.textSecondary, marginTop: 4 },
  statLabelWarning: { color: THEME.warning },
  section: {
    backgroundColor: THEME.card, borderRadius: 16, padding: 18, marginBottom: 12,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  sectionWarning: { backgroundColor: THEME.warningLight, borderWidth: 1, borderColor: THEME.warning + '40' },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: THEME.text, marginBottom: 12 },
  sectionTitleWarning: { fontSize: 15, fontWeight: 'bold', color: THEME.warning, marginBottom: 12 },
  toolRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  toolName: { fontSize: 13, color: THEME.text, width: 110 },
  toolBarWrapper: { flex: 1, height: 8, backgroundColor: THEME.border, borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  toolBar: { height: '100%', backgroundColor: THEME.primary, borderRadius: 4 },
  toolCount: { fontSize: 12, color: THEME.textSecondary, width: 30, textAlign: 'right' },
  exitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: THEME.warning + '30' },
  exitTime: { fontSize: 12, color: THEME.warning, fontWeight: '600' },
  exitType: { fontSize: 12, color: THEME.text },
  logRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.border, gap: 10 },
  logTimeCol: { width: 70, alignItems: 'flex-start' },
  logTime: { fontSize: 11, color: THEME.textSecondary },
  logDuration: { fontSize: 10, color: THEME.primary, marginTop: 2 },
  logContent: { flex: 1 },
  stageChip: { backgroundColor: THEME.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 4 },
  stageChipText: { fontSize: 10, color: THEME.primary, fontWeight: '600' },
  logPageTitle: { fontSize: 13, color: THEME.text, fontWeight: '500', marginBottom: 2 },
  logUrl: { fontSize: 11, color: THEME.textSecondary },
  emptyText: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', paddingVertical: 16 },
});
