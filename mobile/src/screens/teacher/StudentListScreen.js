import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { analyticsAPI } from '../../services/api';
import { THEME, FONTS } from '../../config/api';
import AppShell from '../../components/AppShell';
import ClassCriticalUseModal from '../../components/ClassCriticalUseModal';

const C = THEME;
const F = FONTS;

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_MAP = {
  in_progress: { label: '진행 중', color: C.primary },
  submitted:   { label: '제출 완료', color: C.success },
  graded:      { label: '채점 완료', color: C.secondary },
};

export default function StudentListScreen({ navigation, route }) {
  const { assessmentId, title } = route.params;
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [classStatsVisible, setClassStatsVisible] = useState(false);

  const load = async () => {
    try {
      const res = await analyticsAPI.getAssessmentClassAnalytics(assessmentId);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [assessmentId]));

  const students = data?.students ?? [];
  const summary  = data?.summary ?? {};
  const sortedStudents = useMemo(
    () => [...students].sort((a, b) =>
      (a.student?.name ?? '').localeCompare(b.student?.name ?? '', 'ko')
    ),
    [students]
  );

  return (
    <AppShell navigation={navigation} currentScreen="home">
      <View style={s.container}>
        {/* ── 헤더 ──────────────────────────────────────── */}
        <View style={s.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={C.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTag}>참여 학생 목록</Text>
            <Text style={s.pageTitle} numberOfLines={2}>{title}</Text>
          </View>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : (
          <ScrollView
            contentContainerStyle={s.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(); }}
                tintColor={C.primary}
                colors={[C.primary]}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {/* ── 요약 KPI ─────────────────────────────── */}
            <View style={s.kpiStrip}>
              <View style={s.kpiItem}>
                <Text style={s.kpiValue}>{summary.total_students ?? 0}</Text>
                <Text style={s.kpiLabel}>전체</Text>
              </View>
              <View style={s.kpiDivider} />
              <View style={s.kpiItem}>
                <Text style={s.kpiValue}>{summary.in_progress_students ?? 0}</Text>
                <Text style={s.kpiLabel}>진행 중</Text>
              </View>
              <View style={s.kpiDivider} />
              <View style={s.kpiItem}>
                <Text style={s.kpiValue}>{summary.completed_students ?? 0}</Text>
                <Text style={s.kpiLabel}>완료</Text>
              </View>
              <View style={s.kpiDivider} />
              <View style={s.kpiItem}>
                <Text style={s.kpiValue}>{summary.total_log_count ?? 0}</Text>
                <Text style={s.kpiLabel}>활동 로그</Text>
              </View>
            </View>

            {/* ── 학생 목록 ─────────────────────────────── */}
            {students.length === 0 ? (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Ionicons name="people-outline" size={32} color={C.textSecondary} />
                </View>
                <Text style={s.emptyTitle}>아직 참여한 학생이 없습니다</Text>
                <Text style={s.emptyDesc}>학생들에게 초대 코드를 공유할 수 있습니다.</Text>
              </View>
            ) : (
              <View style={s.section}>
                <View style={s.sectionHead}>
                  <Text style={s.sectionTitle}>참여 학생</Text>
                  <View style={s.sectionHeadRight}>
                    <Pressable
                      onPress={() => setClassStatsVisible(true)}
                      style={({ pressed }) => [s.statsBtn, pressed && { opacity: 0.7 }]}
                      hitSlop={6}
                    >
                      <Ionicons name="stats-chart-outline" size={14} color={C.primary} />
                      <Text style={s.statsBtnText}>반 통계</Text>
                    </Pressable>
                    <Text style={s.sectionCount}>{students.length}명</Text>
                  </View>
                </View>
                <View style={s.list}>
                  {sortedStudents.map((item, i) => {
                    const st = item.student;
                    const statusInfo = STATUS_MAP[st.status] ?? { label: st.status, color: C.textSecondary };
                    const aiCount   = item.ai_usage?.total_log_count ?? 0;
                    return (
                      <Pressable
                        key={st.id ?? i}
                        onPress={() => navigation.navigate('StudentReport', {
                          participationId: item.participation_id,
                          studentName: st.name,
                          assessmentTitle: title,
                        })}
                        style={({ pressed }) => [
                          s.row,
                          i > 0 && s.rowBorder,
                          { backgroundColor: pressed ? C.cardLo : 'transparent' },
                        ]}
                      >
                        {/* 아바타 */}
                        <View style={s.avatar}>
                          <Text style={s.avatarText}>
                            {(st.name ?? '?').slice(0, 1)}
                          </Text>
                        </View>

                        {/* 이름 + 단계 */}
                        <View style={{ flex: 1 }}>
                          <Text style={s.studentName}>{st.name ?? '(이름 없음)'}</Text>
                          <Text style={s.studentMeta}>
                            {st.status === 'in_progress'
                              ? `${st.current_stage_order ?? 1}단계 진행 중`
                              : '수행평가 완료'}
                            {aiCount > 0 ? `  ·  AI 활동 ${aiCount}회` : ''}
                          </Text>
                        </View>

                        {/* 상태 + 화살표 */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[s.statusBadge, { borderColor: statusInfo.color + '40' }]}>
                            <View style={[s.statusDot, { backgroundColor: statusInfo.color }]} />
                            <Text style={[s.statusText, { color: statusInfo.color }]}>
                              {statusInfo.label}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={C.textFaint} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={{ height: 60 }} />
          </ScrollView>
        )}
      </View>
      <ClassCriticalUseModal
        visible={classStatsVisible}
        onClose={() => setClassStatsVisible(false)}
        summary={summary}
      />
    </AppShell>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    backgroundColor: C.background,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
    flexShrink: 0,
  },
  pageTag:   { fontFamily: F.mono, fontSize: 11, color: C.textSecondary, letterSpacing: 1.2, marginBottom: 2 },
  pageTitle: { fontFamily: F.serifKo, fontSize: 18, color: C.text, lineHeight: 26 },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },

  // KPI
  kpiStrip: {
    flexDirection: 'row', backgroundColor: C.card,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    marginBottom: 16, paddingVertical: 16,
  },
  kpiItem:    { flex: 1, alignItems: 'center' },
  kpiDivider: { width: 1, backgroundColor: C.border },
  kpiValue:   { fontFamily: F.sansBold, fontSize: 22, color: C.text },
  kpiLabel:   { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, marginTop: 2 },

  // 빈 목록
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontFamily: F.sansSemi, fontSize: 15, color: C.text, marginBottom: 6 },
  emptyDesc:  { fontFamily: F.sans, fontSize: 13, color: C.textSecondary },

  // 섹션
  section: {
    backgroundColor: C.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontFamily: F.sansSemi, fontSize: 14, color: C.text },
  sectionHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionCount: { fontFamily: F.mono, fontSize: 12, color: C.textSecondary },
  statsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: C.primary + '40',
    backgroundColor: C.primaryLight,
  },
  statsBtnText: { fontFamily: F.sansMedium, fontSize: 11.5, color: C.primary },

  list: {},
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderRadius: 10,
    paddingHorizontal: 4,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.border },

  // 아바타
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontFamily: F.sansBold, fontSize: 15, color: C.primary },

  // 학생 정보
  studentName: { fontFamily: F.sansSemi, fontSize: 14, color: C.text },
  studentMeta: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, marginTop: 2 },

  // 상태 뱃지
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1,
  },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: F.sansMedium, fontSize: 11.5 },
});
