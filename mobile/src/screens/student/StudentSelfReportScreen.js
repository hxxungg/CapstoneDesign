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
import { appAlert } from '../../utils/appAlert';

const C = THEME;
const F = FONTS;

function fmtSec(sec) {
  if (!sec || sec <= 0) return '0초';
  if (sec < 60) return `${Math.round(sec)}초`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

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

function Kpi({ label, value, color }) {
  return (
    <View style={s.kpiTile}>
      <Text style={[s.kpiValue, color && { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function StudentSelfReportScreen({ navigation, route }) {
  const { participationId, assessmentTitle } = route.params;
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
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

  const summary    = data?.summary ?? {};
  const byStep     = data?.by_step ?? [];
  const aiLogs     = data?.ai_logs ?? [];
  const urlLogs    = data?.url_logs ?? [];
  const simByStep  = data?.similarity_by_step ?? {};

  const promptTypes  = summary.prompt_types  ?? {};
  const promptLevels = summary.prompt_levels ?? {};

  const totalAiCount   = aiLogs.length;
  const avgLevel       = totalAiCount > 0
    ? (aiLogs.reduce((s, l) => s + (l.prompt_level || 1), 0) / totalAiCount).toFixed(1)
    : '-';

  const stepDisplayList = buildStepDisplayList(byStep, simByStep, { includeStepOrderInTitle: false });
  const showAnalysisPanel = stepDisplayList.length > 0 || aiLogs.length > 0 || urlLogs.length > 0;
  const finalScore = data?.evaluation?.score;
  const hasFinalScore = finalScore != null && finalScore !== '';
  const panelRef = useRef(null);
  const [outerScrollEnabled, setOuterScrollEnabled] = useState(true);
  const handleOuterScrollLock = useCallback((locked) => {
    setOuterScrollEnabled(!locked);
  }, []);
  const clearPanelHighlight = useCallback(() => {
    panelRef.current?.clearHighlight?.();
  }, []);

  const handleShowScore = useCallback(() => {
    if (hasFinalScore) {
      appAlert('최종 점수', `${finalScore}점`, null, { type: 'info' });
    } else {
      appAlert('최종 점수', '아직 교사가 점수를 입력하지 않았습니다.', null, { type: 'info' });
    }
  }, [hasFinalScore, finalScore]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); load(); }}
      tintColor={C.primary}
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
    if (totalAiCount || showAnalysisPanel) return null;
    return (
      <View style={s.emptyBox}>
        <Ionicons name="analytics-outline" size={40} color={C.border} />
        <Text style={s.emptyText}>아직 분석 데이터가 없습니다.</Text>
        <Text style={s.emptyDesc}>AI를 활용한 수행평가 결과가 여기에 표시됩니다.</Text>
      </View>
    );
  };

  return (
    <AppShell navigation={navigation} currentScreen="home">
      <View style={{ flex: 1, backgroundColor: C.background }}>
        {/* 헤더 */}
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={16} color={C.text} />
          </Pressable>
          <Pressable style={{ flex: 1 }} onPress={clearPanelHighlight}>
            <Text style={s.headerTitle} numberOfLines={1}>{assessmentTitle ?? '내 분석 리포트'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.headerSub}>나의 AI 활용 분석</Text>
              {(summary.total_exit_attempts ?? 0) > 0 && (
                <Text style={s.exitBadge}>⚠ 이탈 시도 {summary.total_exit_attempts}회</Text>
              )}
            </View>
          </Pressable>
          {!loading ? (
            <Pressable
              style={({ pressed }) => [s.scoreBtn, pressed && { opacity: 0.75 }]}
              onPress={handleShowScore}
            >
              <Ionicons name="ribbon-outline" size={15} color={C.primary} />
              <Text style={s.scoreBtnText}>점수 보기</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            scrollEnabled={outerScrollEnabled}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.scroll}>
              {renderPieSummary()}
              {renderAnalysisPanel(false)}
              {renderEmptyState()}
              <View style={{ height: 40 }} />
            </View>
          </ScrollView>
        )}
      </View>
    </AppShell>
  );
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: THEME.border },
  scoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 10,
    flexShrink: 0,
  },
  scoreBtnText: { fontFamily: FONTS.sansMedium, fontSize: 13, color: THEME.primary },
  backBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONTS.sansBold, fontSize: 16, color: THEME.text },
  headerSub:   { fontFamily: FONTS.sans, fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  loadingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:      { padding: 20, gap: 16 },
  nativeBody: { flex: 1, minHeight: 0 },
  nativeSummaryScroll: { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' },
  nativeSummaryContent: { paddingHorizontal: 20, paddingBottom: 4, flexGrow: 0 },
  analysisDock: { flex: 1, minHeight: 0, paddingHorizontal: 20, paddingTop: 0, paddingBottom: 12 },
  analysisSectionFill: { flex: 1, marginBottom: 0, minHeight: 0, overflow: 'hidden' },
  analysisPanelFill: { flex: 1, minHeight: 0 },
  section:     { backgroundColor: THEME.card, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: THEME.border, overflow: 'visible' },
  sectionSummary: { marginBottom: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle:{ fontFamily: FONTS.sansMedium, fontSize: 13, color: THEME.textSecondary },
  kpiRow:      { flexDirection: 'row', gap: 8 },
  kpiTile:     { flex: 1, backgroundColor: THEME.background, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  kpiValue:    { fontFamily: FONTS.sansBold, fontSize: 20, color: THEME.text },
  kpiLabel:    { fontFamily: FONTS.sans, fontSize: 11, color: THEME.textSecondary, textAlign: 'center' },
  tagWrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: THEME.border },
  tagLabel:    { fontFamily: FONTS.sansMedium, fontSize: 12, color: THEME.text },
  tagCount:    { fontFamily: FONTS.sans, fontSize: 12, color: THEME.textSecondary },
  simLegend:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  simLegendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  simLegendDot: { width: 10, height: 10, borderRadius: 3 },
  simDesc:      { fontFamily: FONTS.sans, fontSize: 11, color: THEME.textSecondary, lineHeight: 18 },
  simStepBlock: { gap: 8 },
  simStepHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  simStepTitle:{ fontFamily: FONTS.sansMedium, fontSize: 13, color: THEME.text, flex: 1 },
  simWarnBadge:{ backgroundColor: '#FFECB3', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  simWarnText: { fontFamily: FONTS.sansMedium, fontSize: 11, color: '#E65100' },
  simTextBlock: {
    backgroundColor: THEME.card, borderRadius: 10,
    borderWidth: 1, borderColor: THEME.border,
    padding: 14, gap: 10,
  },
  simSentenceRow:    { flexDirection: 'row', alignItems: 'flex-start' },
  simSentenceRowGap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.border,
  },
  simHighlightWrap:  { flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 3 },
  simSentenceText:   { fontFamily: FONTS.sans, fontSize: 13, color: THEME.text, lineHeight: 24 },
  simPct:            { fontFamily: FONTS.mono, fontSize: 11, marginLeft: 6, marginTop: 2, flexShrink: 0 },
  logItem:     { backgroundColor: THEME.background, borderRadius: 10, padding: 12, gap: 6 },
  logMeta:     { flexDirection: 'row', gap: 6 },
  logBadge:    { backgroundColor: THEME.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  logBadgeText:{ fontFamily: FONTS.sansMedium, fontSize: 11, color: THEME.textSecondary },
  logPrompt:   { fontFamily: FONTS.sansMedium, fontSize: 13, color: THEME.text, lineHeight: 20 },
  logResponse: { fontFamily: FONTS.sans, fontSize: 12, color: THEME.textSecondary, lineHeight: 18 },
  emptyBox:    { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyText:   { fontFamily: FONTS.sansMedium, fontSize: 15, color: THEME.textSecondary },
  emptyDesc:   { fontFamily: FONTS.sans, fontSize: 13, color: THEME.textFaint, textAlign: 'center' },
  exitBadge:   { fontFamily: FONTS.sansMedium, fontSize: 11, color: '#C62828', backgroundColor: '#FFEBEE', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  pieGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  pieCell:     { width: '47%', flexGrow: 0, flexShrink: 0 },

  // 타임라인 모달
  tlOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  tlSheet:     { backgroundColor: THEME.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '72%', paddingTop: 6 },
  tlHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: THEME.border, alignSelf: 'center', marginBottom: 4 },
  tlHeader:    { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: THEME.border },
  tlTitle:     { fontFamily: FONTS.sansSemi ?? FONTS.sansBold, fontSize: 17, color: THEME.text },
  tlSubtitle:  { fontFamily: FONTS.sans, fontSize: 13, color: THEME.textSecondary, marginTop: 3 },
  tlClose:     { width: 34, height: 34, borderRadius: 17, backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.border, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  tlScroll:    { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  tlEmpty:     { alignItems: 'center', paddingVertical: 50, gap: 12 },
  tlEmptyText: { fontFamily: FONTS.sans, fontSize: 14, color: THEME.textSecondary },
  tlItem:      { flexDirection: 'row', gap: 14, marginBottom: 0 },
  tlLineCol:   { alignItems: 'center', width: 16, paddingTop: 2 },
  tlDot:       { width: 14, height: 14, borderRadius: 7 },
  tlLine:      { flex: 1, width: 2, backgroundColor: THEME.border, marginVertical: 4, minHeight: 16 },
  tlCard:      { flex: 1, backgroundColor: THEME.card, borderRadius: 14, borderWidth: 1, borderColor: THEME.border, marginBottom: 12, overflow: 'hidden' },
  tlItemHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.border },
  tlTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  tlTypeTxt:   { fontFamily: FONTS.sansMedium, fontSize: 12 },
  tlTime:      { fontFamily: FONTS.mono, fontSize: 12, color: THEME.textSecondary },
  tlBody:      { padding: 14, gap: 8 },
  tlSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tlSearchTxt: { fontFamily: FONTS.sansMedium, fontSize: 14, color: THEME.text, flex: 1 },
  tlUrl:       { fontFamily: FONTS.mono, fontSize: 11, color: THEME.primary, lineHeight: 17 },
  tlQBox:      { flexDirection: 'row', gap: 8, backgroundColor: THEME.background, borderRadius: 10, padding: 10 },
  tlQLabel:    { fontFamily: FONTS.sansBold, fontSize: 13, color: THEME.primary, width: 18, textAlign: 'center' },
  tlQTxt:      { fontFamily: FONTS.sansMedium, fontSize: 13, color: THEME.text, lineHeight: 20, flex: 1 },
  tlABox:      { flexDirection: 'row', gap: 8, backgroundColor: '#F8F8F8', borderRadius: 10, padding: 10 },
  tlAMore:     { fontFamily: FONTS.sans, fontSize: 11, color: THEME.primary, marginTop: 4 },
  respOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  respSheet:       { backgroundColor: THEME.background, borderRadius: 20, maxHeight: '80%', overflow: 'hidden' },
  respHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: THEME.border },
  respHeaderTitle: { fontFamily: FONTS.sansBold, fontSize: 16, color: THEME.text },
  respScroll:      { padding: 18 },
  tlALabel:    { fontFamily: FONTS.sansBold, fontSize: 13, color: THEME.textSecondary, width: 18, textAlign: 'center' },
  tlATxt:      { fontFamily: FONTS.sans, fontSize: 13, color: THEME.textSecondary, lineHeight: 20, flex: 1 },
  tlTagRow:    { flexDirection: 'row', gap: 6 },
  tlMiniTag:   { backgroundColor: THEME.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tlMiniTagTxt:{ fontFamily: FONTS.sansMedium, fontSize: 11, color: THEME.textSecondary },
});
