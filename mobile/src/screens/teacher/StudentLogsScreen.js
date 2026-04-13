import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { analyticsAPI } from '../../services/api';
import { THEME } from '../../config/api';
import { appAlert } from '../../utils/appAlert';

const CAT_BG = {
  borrowed: 'rgba(248,113,113,0.35)',
  adapted: 'rgba(251,191,36,0.45)',
  original: 'rgba(52,211,153,0.35)',
};
const CAT_BORDER = {
  borrowed: '#F87171',
  adapted: '#D97706',
  original: '#10B981',
};

export default function StudentLogsScreen({ route }) {
  const { studentId, studentName, assignmentId, assignmentTitle } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const result = await analyticsAPI.getStudentAnalytics(assignmentId, studentId);
      setData(result);
    } catch (err) {
      appAlert('오류', err.message);
    } finally {
      setLoading(false);
    }
  };

  const rep = data?.comprehensive_report;
  const timeline = rep?.timeline || [];

  const linkedEvents = useMemo(() => {
    if (!selected || !selected.linkedIds?.length) return [];
    const idSet = new Set(selected.linkedIds);
    return timeline.filter((e) => idSet.has(e.id)).sort(
      (a, b) => new Date(a.at) - new Date(b.at),
    );
  }, [selected, timeline]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  const name0 = (studentName || data?.student?.name || '?')[0];
  const orig = rep?.charts?.originality || { red: 0, yellow: 0, green: 0 };
  const oSum = orig.red + orig.yellow + orig.green;
  const classR = rep?.class_originality_ratios || { red: 0, yellow: 0, green: 0 };

  if (!rep) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.emptyText}>
          종합 리포트 데이터를 불러올 수 없습니다. 백엔드를 최신 코드로 실행한 뒤 다시 시도해 주세요.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.studentCard}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>{name0}</Text>
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>{studentName || data?.student?.name}</Text>
          <Text style={styles.assignmentName}>{assignmentTitle}</Text>
          <View style={[
            styles.statusBadge,
            { backgroundColor: data?.progress?.status === 'completed' ? THEME.successLight : THEME.primaryLight },
          ]}>
            <Text style={[
              styles.statusText,
              { color: data?.progress?.status === 'completed' ? THEME.success : THEME.primary },
            ]}>
              {data?.progress?.status === 'completed' ? '✅ 완료' : `단계 ${data?.progress?.current_stage_order || 1} 진행중`}
            </Text>
          </View>
        </View>
      </View>

      {rep?.disclaimer ? (
        <Text style={styles.disclaimer}>{rep.disclaimer}</Text>
      ) : null}

      {/* (1) 단계별 평가 이행 요약 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>단계별 평가 이행 요약</Text>
        <Text style={styles.sectionSub}>
          각 단계 산출물(작성 공간)이 최소 분량 기준을 충족했는지와 표시 상태입니다. (사전 루브릭 연동 시 확장 가능)
        </Text>
        <View style={styles.complianceRow}>
          {(rep?.compliance_summary || []).map((row) => (
            <View key={row.order_num} style={styles.complianceChip}>
              <Text style={styles.complianceIcon}>{row.ok ? '✅' : '⚠️'}</Text>
              <Text style={styles.complianceChipTitle} numberOfLines={2}>{row.stage_title}</Text>
              <Text style={styles.complianceChipSub}>{row.status}</Text>
            </View>
          ))}
        </View>
        {(!rep?.compliance_summary || rep.compliance_summary.length === 0) ? (
          <Text style={styles.emptyText}>단계 정보가 없습니다.</Text>
        ) : null}
      </View>

      {/* 범례 */}
      {rep?.legend ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>독창성 구간 범례</Text>
          {Object.entries(rep.legend).map(([key, v]) => (
            <View key={key} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: v.color }]} />
              <Text style={styles.legendText}><Text style={styles.legendKey}>{key === 'borrowed' ? '빨강' : key === 'adapted' ? '노랑' : '초록'} </Text>{v.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* (3)(4) 단계별 형광펜 + 우측 타임라인 패널 */}
      <View style={[styles.section, styles.highlightTimelineSection]}>
        <Text style={styles.sectionTitle}>형광펜 텍스트 시각화 + 타임라인 패널</Text>
        <Text style={styles.sectionSub}>
          형광 구간을 누르면 오른쪽 타임라인 패널에 연결된 AI 활용 로그가 시간순으로 표시됩니다.
        </Text>

        <View style={styles.highlightTimelineRow}>
          <View style={styles.highlightColumn}>
            {(rep?.stages_content || []).map((sc) => (
              <View key={sc.stage_id} style={styles.stageBlock}>
                <Text style={styles.stageHeading}>{sc.order_num}. {sc.stage_title}</Text>
                {sc.segments.length === 0 ? (
                  <Text style={styles.emptyInline}>이 단계에 저장된 작성 내용이 없습니다.</Text>
                ) : (
                  <Text style={styles.tapHint}>구간 탭 → 우측 패널에 타임라인 표시</Text>
                )}
                <View style={styles.hlWrap}>
                  {sc.segments.map((seg, idx) => {
                    const isSel = selected?.stageId === sc.stage_id && selected?.segmentIdx === idx;
                    return (
                      <TouchableOpacity
                        key={seg.id}
                        activeOpacity={0.7}
                        onPress={() => setSelected({
                          stageId: sc.stage_id,
                          segmentIdx: idx,
                          linkedIds: seg.linked_log_ids || [],
                        })}
                        style={[
                          styles.hlChunk,
                          {
                            backgroundColor: CAT_BG[seg.category] || THEME.border,
                            borderColor: isSel ? THEME.primary : (CAT_BORDER[seg.category] || THEME.border),
                            borderWidth: isSel ? 2 : 1,
                          },
                        ]}
                      >
                        <Text style={styles.hlText}>{seg.text}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.timelinePanel}>
            <Text style={styles.timelinePanelTitle}>연결 활동 타임라인</Text>
            <Text style={styles.timelinePanelSub}>시간 순 · 프롬프트 유형/수준 태그</Text>
            {!selected ? (
              <Text style={styles.emptyText}>좌측 형광 구간을 탭하면 타임라인이 표시됩니다.</Text>
            ) : linkedEvents.length === 0 ? (
              <Text style={styles.emptyText}>이 구간에 매핑된 활동 로그가 없습니다.</Text>
            ) : (
              <View style={styles.timeline}>
                {linkedEvents.map((ev, i) => (
                  <View key={ev.id} style={styles.timelineItem}>
                    <View style={styles.timelineDotWrap}>
                      <View style={[styles.timelineDot, i === 0 && styles.timelineDotActive]} />
                      {i < linkedEvents.length - 1 ? <View style={styles.timelineLine} /> : null}
                    </View>
                    <View style={styles.timelineCard}>
                      <Text style={styles.timelineTime}>{formatDate(ev.at)}</Text>
                      <View style={styles.tagRow}>
                        <Text style={styles.tag}>{ev.prompt_type}</Text>
                        <Text style={styles.tagMuted}>{ev.level}</Text>
                        {ev.kind === 'web_search' ? <Text style={styles.tagOutline}>웹 검색</Text> : null}
                        {ev.kind === 'ai_session' ? <Text style={styles.tagOutline}>AI 세션</Text> : null}
                      </View>
                      <Text style={styles.timelineTitle}>{ev.title}</Text>
                      {ev.tool ? <Text style={styles.timelineTool}>도구: {ev.tool}</Text> : null}
                      {ev.url ? <Text style={styles.timelineUrl} numberOfLines={2}>{ev.url}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* (5) 종합 리포트 */}
      <View style={[styles.section, styles.reportSection]}>
        <Text style={styles.reportBanner}>종합 리포트</Text>
        <Text style={styles.sectionTitle}>독창성 리포트</Text>
        <Text style={styles.sectionSub}>구간 개수 기준 비율 (빨강 / 노랑 / 초록)</Text>
        {oSum === 0 ? (
          <Text style={styles.emptyText}>분석할 작성 구간이 없습니다. 학생이 단계별 작성 공간에 내용을 저장하면 표시됩니다.</Text>
        ) : (
          <>
            <View style={styles.pieBar}>
              <View style={[styles.pieSeg, { flex: orig.red, backgroundColor: '#F87171' }]} />
              <View style={[styles.pieSeg, { flex: orig.yellow, backgroundColor: '#FBBF24' }]} />
              <View style={[styles.pieSeg, { flex: orig.green, backgroundColor: '#34D399' }]} />
            </View>
            <View style={styles.pieLegend}>
              <Text style={styles.pieLegendTxt}>빨강 {Math.round((orig.red / oSum) * 100)}% ({orig.red}구간)</Text>
              <Text style={styles.pieLegendTxt}>노랑 {Math.round((orig.yellow / oSum) * 100)}% ({orig.yellow}구간)</Text>
              <Text style={styles.pieLegendTxt}>초록 {Math.round((orig.green / oSum) * 100)}% ({orig.green}구간)</Text>
            </View>
          </>
        )}
        <Text style={styles.classCompare}>
          학급 평균 비율(참고): 빨강 {Math.round(classR.red * 100)}% · 노랑 {Math.round(classR.yellow * 100)}% · 초록 {Math.round(classR.green * 100)}%
          {classR.student_count != null ? ` (${classR.student_count}명 기준)` : ''}
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>프롬프트 유형 리포트</Text>
        {renderBarBlock(rep?.charts?.prompt_types, THEME.primary)}

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>프롬프트 수준 리포트</Text>
        {renderBarBlock(rep?.charts?.prompt_levels, '#6366F1')}

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>이행 준수 리포트</Text>
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 2 }]}>단계</Text>
            <Text style={[styles.th, { flex: 1 }]}>충족</Text>
            <Text style={[styles.th, { flex: 1.2 }]}>상태</Text>
          </View>
          {(rep?.compliance_table || []).map((r) => (
            <View key={r.stage_id} style={styles.tableRow}>
              <Text style={[styles.td, { flex: 2 }]} numberOfLines={2}>{r.stage_title}</Text>
              <Text style={[styles.td, { flex: 1 }]}>{r.criteria_met ? '예' : '아니오'}</Text>
              <Text style={[styles.td, { flex: 1.2 }]}>{r.status}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>최종 통합 요약</Text>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>이 학생</Text>
          <Text style={styles.summaryBody}>{rep?.integrated_summary?.student_paragraph}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>전체 학생 대비</Text>
          <Text style={styles.summaryBody}>{rep?.integrated_summary?.class_paragraph}</Text>
        </View>
        {(rep?.integrated_summary?.comparison_bullets || []).map((b, i) => (
          <Text key={i} style={styles.bullet}>• {b}</Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>원시 활동 로그</Text>
        {data?.logs?.length === 0 ? (
          <Text style={styles.emptyText}>기록이 없습니다.</Text>
        ) : (
          data.logs.map((log, idx) => (
            <View key={log.id ?? idx} style={styles.logRow}>
              <Text style={styles.logTime}>{formatDate(log.created_at)}</Text>
              <View style={{ flex: 1 }}>
                {log.stage_title ? (
                  <Text style={styles.logStage}>{log.stage_title}</Text>
                ) : null}
                <Text style={styles.logUrl} numberOfLines={2}>{log.url || log.page_title || '—'}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

function renderBarBlock(obj, color) {
  const entries = Object.entries(obj || {});
  if (!entries.length) {
    return <Text style={styles.emptyText}>표시할 분포가 없습니다.</Text>;
  }
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <View>
      {entries.sort((a, b) => b[1] - a[1]).map(([label, val]) => (
        <View key={label} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(val / max) * 100}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.barVal}>{val}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },
  disclaimer: { fontSize: 11, color: THEME.textSecondary, marginBottom: 12, lineHeight: 16 },
  studentCard: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    elevation: 3,
  },
  avatarLarge: { width: 56, height: 56, borderRadius: 28, backgroundColor: THEME.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarLargeText: { fontSize: 24, fontWeight: 'bold', color: THEME.primary },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 20, fontWeight: 'bold', color: THEME.text },
  assignmentName: { fontSize: 13, color: THEME.textSecondary, marginTop: 2 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  statusText: { fontSize: 12, fontWeight: '700' },
  section: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  reportSection: { borderWidth: 2, borderColor: THEME.primary + '44' },
  reportBanner: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.primary,
    marginBottom: 10,
    textAlign: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: THEME.text, marginBottom: 6 },
  sectionSub: { fontSize: 12, color: THEME.textSecondary, marginBottom: 10, lineHeight: 17 },
  complianceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  complianceChip: {
    width: '30%',
    minWidth: 100,
    flexGrow: 1,
    backgroundColor: THEME.background,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  complianceIcon: { fontSize: 16, marginBottom: 4 },
  complianceChipTitle: { fontSize: 12, fontWeight: '700', color: THEME.text },
  complianceChipSub: { fontSize: 10, color: THEME.textSecondary, marginTop: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, marginTop: 3 },
  legendText: { flex: 1, fontSize: 12, color: THEME.text, lineHeight: 18 },
  legendKey: { fontWeight: '800' },
  highlightTimelineSection: { paddingBottom: 12 },
  highlightTimelineRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  highlightColumn: { flex: 1.05, minWidth: 0 },
  timelinePanel: {
    flex: 0.95,
    minWidth: 0,
    backgroundColor: THEME.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
  },
  timelinePanelTitle: { fontSize: 14, fontWeight: '700', color: THEME.text, marginBottom: 4 },
  timelinePanelSub: { fontSize: 11, color: THEME.textSecondary, marginBottom: 8 },
  stageBlock: {
    backgroundColor: THEME.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 10,
    marginBottom: 10,
  },
  stageHeading: { fontSize: 16, fontWeight: 'bold', color: THEME.primary, marginBottom: 8 },
  tapHint: { fontSize: 11, color: THEME.textSecondary, marginBottom: 8 },
  emptyInline: { fontSize: 13, color: THEME.textSecondary, fontStyle: 'italic' },
  hlWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hlChunk: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 6, marginBottom: 4 },
  hlText: { fontSize: 14, color: THEME.text, lineHeight: 22 },
  timeline: { marginTop: 4 },
  timelineItem: { flexDirection: 'row', minHeight: 72 },
  timelineDotWrap: { width: 22, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: THEME.border, marginTop: 6 },
  timelineDotActive: { backgroundColor: THEME.primary, width: 12, height: 12, borderRadius: 6 },
  timelineLine: { flex: 1, width: 2, backgroundColor: THEME.border, marginTop: 2 },
  timelineCard: {
    flex: 1,
    marginLeft: 6,
    marginBottom: 10,
    padding: 10,
    backgroundColor: THEME.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  timelineTime: { fontSize: 11, color: THEME.textSecondary, marginBottom: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  tag: { fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: THEME.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagMuted: { fontSize: 10, fontWeight: '600', color: THEME.text, backgroundColor: THEME.border, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagOutline: { fontSize: 10, color: THEME.primary, borderWidth: 1, borderColor: THEME.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  timelineTitle: { fontSize: 13, fontWeight: '600', color: THEME.text },
  timelineTool: { fontSize: 11, color: THEME.textSecondary, marginTop: 4 },
  timelineUrl: { fontSize: 10, color: THEME.textSecondary, marginTop: 4 },
  pieBar: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden', marginTop: 8 },
  pieSeg: { minWidth: 4 },
  pieLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  pieLegendTxt: { fontSize: 12, color: THEME.text },
  classCompare: { fontSize: 11, color: THEME.textSecondary, marginTop: 10, lineHeight: 16 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  barLabel: { width: 100, fontSize: 11, color: THEME.text },
  barTrack: { flex: 1, height: 10, backgroundColor: THEME.border, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barVal: { width: 28, fontSize: 12, fontWeight: '700', color: THEME.text, textAlign: 'right' },
  table: { marginTop: 8, borderWidth: 1, borderColor: THEME.border, borderRadius: 10, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', backgroundColor: THEME.primaryLight, paddingVertical: 8, paddingHorizontal: 8 },
  th: { fontSize: 11, fontWeight: '800', color: THEME.primary },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: THEME.border, paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center' },
  td: { fontSize: 12, color: THEME.text },
  summaryBox: { backgroundColor: THEME.background, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: THEME.border },
  summaryLabel: { fontSize: 11, fontWeight: '800', color: THEME.primary, marginBottom: 6 },
  summaryBody: { fontSize: 13, color: THEME.text, lineHeight: 20 },
  bullet: { fontSize: 12, color: THEME.text, marginTop: 6, lineHeight: 18 },
  logRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: THEME.border, gap: 8 },
  logTime: { width: 72, fontSize: 11, color: THEME.textSecondary },
  logStage: { fontSize: 11, fontWeight: '600', color: THEME.primary, marginBottom: 2 },
  logUrl: { fontSize: 11, color: THEME.textSecondary },
  emptyText: { fontSize: 13, color: THEME.textSecondary, textAlign: 'center', paddingVertical: 12 },
});
