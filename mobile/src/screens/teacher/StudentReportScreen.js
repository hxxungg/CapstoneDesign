import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { analyticsAPI } from '../../services/api';
import { THEME, FONTS } from '../../config/api';
import { PROMPT_TYPE_LABEL } from '../../config/promptLabels';
import { ORIGINALITY_LEGEND_DEF } from '../../config/analyticsChartHelp';
import AppShell from '../../components/AppShell';
import PieChart from '../../components/PieChart';
import SimilarityLegendWithHelp from '../../components/SimilarityLegendWithHelp';
import { buildStepDisplayList, SimilarityActivitySplitPanel } from '../../components/SimilarityActivityPanel';

const C = THEME;
const F = FONTS;

const AI_PERMISSION_LABEL = {
  allowed:     'AI 활성',
  conditional: '조건부',
  denied:      'AI 비활성',
};

const DEP_LEVEL_LABEL = {
  low:    { label: '낮음', color: C.success },
  medium: { label: '보통', color: C.secondary },
  high:   { label: '높음', color: C.danger },
};

function fmtSec(sec) {
  if (!sec || sec <= 0) return '0초';
  if (sec < 60) return `${Math.round(sec)}초`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

function fmtTime(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 섹션 카드 컴포넌트
function SectionCard({ title, icon, children, onHeadPress, style }) {
  const head = (
    <View style={s.sectionHead}>
      <Ionicons name={icon} size={15} color={C.textSecondary} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
  return (
    <View style={[s.section, style]}>
      {onHeadPress ? (
        <Pressable onPress={onHeadPress}>{head}</Pressable>
      ) : (
        head
      )}
      {children}
    </View>
  );
}

// KPI 타일
function Kpi({ label, value, sub, color }) {
  return (
    <View style={s.kpiTile}>
      <Text style={[s.kpiValue, color && { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

export default function StudentReportScreen({ navigation, route }) {
  const { participationId, studentName, assessmentTitle } = route.params;
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    try {
      const res = await analyticsAPI.getParticipationAnalytics(participationId);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [participationId]));

  const summary  = data?.summary ?? {};
  const byStep   = data?.by_step ?? [];
  const urlLogs  = data?.url_logs ?? [];
  const aiLogs   = data?.ai_logs ?? [];
  const participation = data?.participation ?? {};
  const simByStep = data?.similarity_by_step ?? {};

  const promptTypes  = summary.prompt_types ?? {};
  const promptLevels = summary.prompt_levels ?? {};
  const toolsUsed    = summary.tools_used ?? {};

  // 탐색 쿼리
  const searchQueries = summary.search_queries ?? [];

  const stepDisplayList = buildStepDisplayList(byStep, simByStep);
  const showAnalysisPanel = stepDisplayList.length > 0 || aiLogs.length > 0 || urlLogs.length > 0;
  const panelRef = useRef(null);
  const [outerScrollEnabled, setOuterScrollEnabled] = useState(true);
  const handleOuterScrollLock = useCallback((locked) => {
    setOuterScrollEnabled(!locked);
  }, []);
  const clearPanelHighlight = useCallback(() => {
    panelRef.current?.clearHighlight?.();
  }, []);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); load(); }}
      tintColor={C.primary}
      colors={[C.primary]}
    />
  );

  const renderPieSummary = () => {
    const origCount = { red: 0, yellow: 0, green: 0 };
    Object.values(simByStep).forEach(sentences =>
      sentences.forEach(r => { if (r.originality) origCount[r.originality] = (origCount[r.originality] || 0) + 1; })
    );
    const origKeys = ['red', 'yellow', 'green'];
    const origData = ORIGINALITY_LEGEND_DEF.map((item, i) => ({
      label: item.label,
      value: origCount[origKeys[i]] ?? 0,
      color: item.pieColor,
    }));
    const typeColors = ['#1E88E5','#8E24AA','#00897B','#F4511E','#3949AB','#039BE5'];
    const typeData = Object.entries(promptTypes).map(([k, v], i) => ({
      label: PROMPT_TYPE_LABEL[k] ?? k, value: v, color: typeColors[i % typeColors.length],
    }));
    const levelColors = ['#90CAF9','#42A5F5','#1565C0','#0D2E6B'];
    const levelData = Object.entries(promptLevels)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v], i) => ({ label: `Lv.${k}`, value: v, color: levelColors[i % levelColors.length] }));

    const criticalCount = summary.critical_use?.critical_count ?? 0;
    const nonCriticalCount = summary.critical_use?.non_critical_count ?? 0;
    const criticalData = [
      { label: '비판적 사용', value: criticalCount, color: '#7B1FA2' },
      { label: '기타', value: nonCriticalCount, color: '#BDBDBD' },
    ];

    const hasOrig  = Object.values(origCount).some(v => v > 0);
    const hasType  = typeData.length > 0;
    const hasLevel = levelData.length > 0;
    const hasCritical = criticalCount + nonCriticalCount > 0;
    if (!hasOrig && !hasType && !hasLevel && !hasCritical) return null;

    return (
      <Pressable onPress={clearPanelHighlight}>
        <SectionCard title="AI 분석 요약" icon="pie-chart-outline" style={s.sectionSummary}>
          {hasOrig && <SimilarityLegendWithHelp style={s.simLegend} />}
          <View style={s.pieGrid}>
            {hasOrig  && <View style={s.pieCell}><PieChart title="유사도 분포" data={origData} size={110} helpKey="originality" /></View>}
            {hasType  && <View style={s.pieCell}><PieChart title="질문 유형" data={typeData} size={110} helpKey="prompt_type" /></View>}
            {hasLevel && <View style={s.pieCell}><PieChart title="질문 수준" data={levelData} size={110} helpKey="prompt_level" /></View>}
            {hasCritical && (
              <View style={s.pieCell}>
                <PieChart title="비판적 사용" data={criticalData} size={110} helpKey="critical_use" />
              </View>
            )}
          </View>
        </SectionCard>
      </Pressable>
    );
  };

  const renderPeriodSection = () => {
    if (!participation.started_at && !participation.submitted_at) return null;
    return (
      <Pressable onPress={clearPanelHighlight}>
        <SectionCard title="참여 기간" icon="calendar-outline" style={s.sectionSummary}>
          <View style={s.periodRow}>
            {participation.started_at ? (
              <View style={s.periodItem}>
                <Text style={s.periodLabel}>시작일</Text>
                <Text style={s.periodValue}>{fmtDate(participation.started_at)}</Text>
              </View>
            ) : null}
            {participation.submitted_at ? (
              <View style={s.periodItem}>
                <Text style={s.periodLabel}>제출일</Text>
                <Text style={s.periodValue}>{fmtDate(participation.submitted_at)}</Text>
              </View>
            ) : null}
          </View>
        </SectionCard>
      </Pressable>
    );
  };

  const renderAnalysisPanel = (fillViewport = false) => {
    if (!showAnalysisPanel) return null;
    return (
      <SectionCard
        title="제출 내용 AI 유사도 분석"
        icon="color-wand-outline"
        onHeadPress={clearPanelHighlight}
        style={fillViewport ? s.analysisSectionFill : null}
      >
        <View style={fillViewport ? s.analysisPanelFill : null}>
          <SimilarityActivitySplitPanel
            ref={panelRef}
            stepDisplayList={stepDisplayList}
            urlLogs={urlLogs}
            aiLogs={aiLogs}
            byStep={byStep}
            fillViewport={fillViewport}
            onOuterScrollLock={handleOuterScrollLock}
          />
        </View>
      </SectionCard>
    );
  };

  const renderEmptyState = () => {
    if (showAnalysisPanel || byStep.length > 0) return null;
    return (
      <View style={s.empty}>
        <View style={s.emptyIcon}>
          <Ionicons name="analytics-outline" size={32} color={C.textSecondary} />
        </View>
        <Text style={s.emptyTitle}>아직 활동 데이터가 없습니다</Text>
        <Text style={s.emptyDesc}>학생이 수행평가를 시작하면 로그가 기록됩니다.</Text>
      </View>
    );
  };

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
          <Pressable style={{ flex: 1 }} onPress={clearPanelHighlight}>
            <Text style={s.pageTag}>종합 분석 리포트</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={s.pageTitle} numberOfLines={1}>{studentName}</Text>
              {(summary.total_exit_attempts ?? 0) > 0 && (
                <Text style={s.exitBadge}>⚠ 이탈 시도 {summary.total_exit_attempts}회</Text>
              )}
            </View>
            <Text style={s.pageSubTitle} numberOfLines={1}>{assessmentTitle}</Text>
          </Pressable>
          {!loading && participation.assessment_id ? (
            <Pressable
              style={({ pressed }) => [s.gradeBtn, pressed && { opacity: 0.75 }]}
              onPress={() => navigation.navigate('StudentGrading', {
                participationId,
                assessmentId: participation.assessment_id,
                studentName,
                assessmentTitle,
              })}
            >
              <Ionicons name="create-outline" size={15} color={C.primary} />
              <Text style={s.gradeBtnText}>평가하기</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            scrollEnabled={outerScrollEnabled}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.scrollContent}>
              {renderPieSummary()}
              {renderPeriodSection()}
              {renderAnalysisPanel(false)}
              {renderEmptyState()}
              <View style={{ height: 60 }} />
            </View>
          </ScrollView>
        )}
      </View>
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
  pageTag:      { fontFamily: F.mono, fontSize: 11, color: C.textSecondary, letterSpacing: 1.2, marginBottom: 1 },
  pageTitle:    { fontFamily: F.sansBold, fontSize: 17, color: C.text },
  pageSubTitle: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, marginTop: 2 },
  gradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 10,
    flexShrink: 0,
  },
  gradeBtnText: { fontFamily: F.sansMedium, fontSize: 13, color: C.primary },
  exitBadge:    { fontFamily: F.sansMedium, fontSize: 12, color: '#C62828', backgroundColor: '#FFEBEE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pieGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  pieCell:      { width: '47%', flexGrow: 0, flexShrink: 0 },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },

  nativeBody: { flex: 1, minHeight: 0 },
  nativeSummaryScroll: { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' },
  nativeSummaryContent: { paddingHorizontal: 16, paddingBottom: 4, flexGrow: 0 },
  analysisDock: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 0, paddingBottom: 12 },
  analysisSectionFill: { flex: 1, marginBottom: 0, minHeight: 0, overflow: 'hidden' },
  analysisPanelFill: { flex: 1, minHeight: 0 },

  // KPI 행
  kpiRow: {
    flexDirection: 'row', gap: 10, marginBottom: 16,
  },
  kpiTile: {
    flex: 1, backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 16, alignItems: 'center',
  },
  kpiValue: { fontFamily: F.sansBold, fontSize: 22, color: C.text },
  kpiLabel: { fontFamily: F.sans, fontSize: 11.5, color: C.textSecondary, marginTop: 3 },
  kpiSub:   { fontFamily: F.sans, fontSize: 10.5, color: C.textFaint, marginTop: 1 },

  // 섹션
  section: {
    backgroundColor: C.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: C.border, marginBottom: 14,
    overflow: 'visible',
  },
  sectionSummary: { marginBottom: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  sectionTitle: { fontFamily: F.sansSemi, fontSize: 14, color: C.text },

  // 참여 기간
  periodRow: { flexDirection: 'row', gap: 16 },
  periodItem: { flex: 1, gap: 4 },
  periodLabel: { fontFamily: F.sans, fontSize: 11.5, color: C.textSecondary },
  periodValue: { fontFamily: F.sansMedium, fontSize: 14, color: C.text },

  // 태그 묶음
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toolTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  toolTagText: { fontFamily: F.sansMedium, fontSize: 12.5, color: C.text },
  toolTagBadge: {
    backgroundColor: C.dark, borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  toolTagBadgeText: { fontFamily: F.mono, fontSize: 10, color: '#fff' },

  // 단계별 분석
  stepRow: { paddingVertical: 12 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepBadge: {
    width: 26, height: 26, borderRadius: 6, backgroundColor: C.dark,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepBadgeText: { fontFamily: F.mono, fontSize: 11, color: '#fff' },
  stepTitle: { flex: 1, fontFamily: F.sansMedium, fontSize: 13, color: C.text },
  aiPermBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    borderWidth: 1, flexShrink: 0,
  },
  aiPermText: { fontFamily: F.sansMedium, fontSize: 11 },
  stepStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingLeft: 36 },
  stepStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepStatText: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary },

  // 로그 공통
  logRow: { paddingVertical: 10 },
  logMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  logTime: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary },
  logStep: { flex: 1, fontFamily: F.sans, fontSize: 11.5, color: C.textSecondary },
  promptTypeTag: {
    backgroundColor: C.primaryLight, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 999,
  },
  promptTypeText: { fontFamily: F.sansMedium, fontSize: 10.5, color: C.primary },
  logPrompt: { fontFamily: F.sans, fontSize: 13, color: C.text, lineHeight: 19 },
  logUrl:    { fontFamily: F.mono, fontSize: 11, color: C.primary, lineHeight: 16 },
  logDuration: { fontFamily: F.sans, fontSize: 11, color: C.textSecondary, marginTop: 3 },

  // 유사도 형광펜
  simLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  simLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  simLegendDot: { width: 10, height: 10, borderRadius: 3 },
  simLegendText: { fontFamily: F.sans, fontSize: 11, color: C.textSecondary },

  simStepBlock: { marginBottom: 4 },
  simStepHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  simStepTitle: { fontFamily: F.sansMedium, fontSize: 13, color: C.text, flex: 1 },
  simMaxBadge: {
    fontFamily: F.sansMedium, fontSize: 11,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    overflow: 'hidden',
  },
  simTextBox: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    padding: 14,
    gap: 10,
  },
  simSentenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  simSentenceRowGap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  simHighlightWrap: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
  },
  simSentenceText: { fontFamily: F.sans, fontSize: 13.5, color: C.text, lineHeight: 24 },
  simPct: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary, marginLeft: 6, marginTop: 2, flexShrink: 0 },

  // 빈 상태
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontFamily: F.sansSemi, fontSize: 15, color: C.text, marginBottom: 6 },
  emptyDesc:  { fontFamily: F.sans, fontSize: 13, color: C.textSecondary },

  // ── 타임라인 모달 ──────────────────────────────────────────
  tlOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  tlSheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    height: '72%',
    paddingTop: 6,
  },
  tlHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 4,
  },
  tlHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tlTitle:    { fontFamily: F.sansSemi, fontSize: 17, color: C.text },
  tlSubtitle: { fontFamily: F.sans, fontSize: 13, color: C.textSecondary, marginTop: 3 },
  tlClose: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  tlScroll:    { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  tlEmpty:     { alignItems: 'center', paddingVertical: 50, gap: 12 },
  tlEmptyText: { fontFamily: F.sans, fontSize: 14, color: C.textSecondary },

  tlItem:    { flexDirection: 'row', gap: 14, marginBottom: 0 },
  tlLineCol: { alignItems: 'center', width: 16, paddingTop: 2 },
  tlDot:     { width: 14, height: 14, borderRadius: 7 },
  tlLine:    { flex: 1, width: 2, backgroundColor: C.border, marginVertical: 4, minHeight: 16 },

  tlCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  tlItemHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tlTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
  },
  tlTypeTxt: { fontFamily: F.sansMedium, fontSize: 12 },
  tlTime:    { fontFamily: F.mono, fontSize: 12, color: C.textSecondary },

  tlBody: { padding: 14, gap: 8 },

  /* URL */
  tlSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tlSearchTxt: { fontFamily: F.sansMedium, fontSize: 14, color: C.text, flex: 1 },
  tlUrl:       { fontFamily: F.mono, fontSize: 11, color: C.primary, lineHeight: 17 },

  /* AI Q/A */
  tlQBox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: C.background, borderRadius: 10, padding: 10,
  },
  tlQLabel: {
    fontFamily: F.sansBold, fontSize: 13, color: C.primary,
    width: 18, textAlign: 'center',
  },
  tlQTxt:  { fontFamily: F.sansMedium, fontSize: 13, color: C.text, lineHeight: 20, flex: 1 },
  tlABox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: '#F8F8F8', borderRadius: 10, padding: 10,
  },
  tlAMore: { fontFamily: F.sans, fontSize: 11, color: C.primary, marginTop: 4 },
  respOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  respSheet:       { backgroundColor: C.background, borderRadius: 20, maxHeight: '80%', overflow: 'hidden' },
  respHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: C.border },
  respHeaderTitle: { fontFamily: F.sansSemi ?? F.sansBold, fontSize: 16, color: C.text },
  respScroll:      { padding: 18 },
  tlALabel: {
    fontFamily: F.sansBold, fontSize: 13, color: C.textSecondary,
    width: 18, textAlign: 'center',
  },
  tlATxt:  { fontFamily: F.sans, fontSize: 13, color: C.textSecondary, lineHeight: 20, flex: 1 },

  tlTagRow: { flexDirection: 'row', gap: 6 },
  tlMiniTag: {
    backgroundColor: C.border, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  tlMiniTagTxt: { fontFamily: F.sansMedium, fontSize: 11, color: C.textSecondary },
});
