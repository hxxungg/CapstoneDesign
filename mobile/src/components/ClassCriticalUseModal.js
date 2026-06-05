import React from 'react';
import {
  Modal, Pressable, Text, View, StyleSheet, ScrollView, useWindowDimensions,
} from 'react-native';
import { THEME, FONTS } from '../config/api';
import PieChart from './PieChart';

const C = THEME;
const F = FONTS;

const CHART_DEFS = [
  { key: 'originality', title: '유사도 분포', helpKey: 'originality' },
  { key: 'prompt_type', title: '질문 유형', helpKey: 'prompt_type' },
  { key: 'prompt_level', title: '질문 수준', helpKey: 'prompt_level' },
  { key: 'critical_use', title: '비판적 사용', helpKey: 'critical_use' },
];

function ChartCell({ def, chart }) {
  const hasData = (chart?.student_count ?? 0) > 0 && (chart?.items?.length ?? 0) > 0;
  if (!hasData) {
    return (
      <View style={s.pieCell}>
        <Text style={s.emptyChartTitle}>{def.title}</Text>
        <View style={s.emptyChartBox}>
          <Text style={s.emptyChartText}>데이터 없음</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={s.pieCell}>
      <PieChart
        title={`${def.title} 평균`}
        totalCaption={`${chart.student_count}명`}
        data={chart.items}
        size={88}
        helpKey={def.helpKey}
        hideLegendCount
      />
    </View>
  );
}

export default function ClassCriticalUseModal({ visible, onClose, summary }) {
  const { height: winH } = useWindowDimensions();
  const charts = summary?.class_chart_averages ?? {};
  const hasAny = CHART_DEFS.some((def) => {
    const c = charts[def.key];
    return (c?.student_count ?? 0) > 0 && (c?.items?.length ?? 0) > 0;
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[s.box, { maxHeight: Math.floor(winH * 0.88) }]}>
          <Text style={s.title}>반 AI 분석 통계</Text>
          <Text style={s.sub}>
            {hasAny
              ? '학생별 비율의 평균'
              : '아직 분석할 데이터가 없습니다.'}
          </Text>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            <View style={s.pieGrid}>
              {CHART_DEFS.map((def) => (
                <ChartCell key={def.key} def={def} chart={charts[def.key]} />
              ))}
            </View>
          </ScrollView>
          <Pressable
            style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}
            onPress={onClose}
          >
            <Text style={s.closeTxt}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,27,45,0.4)' },
  box: {
    width: 360,
    maxWidth: '100%',
    padding: 20,
    borderRadius: 16,
    backgroundColor: C.background,
    zIndex: 1,
    elevation: 12,
    shadowColor: C.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  title: { fontFamily: F.serifKo, fontSize: 20, color: C.text, textAlign: 'center' },
  sub: {
    fontFamily: F.sans,
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  pieGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pieCell: { width: '47%', flexGrow: 0, flexShrink: 0 },
  emptyChartTitle: {
    fontFamily: F.sansMedium,
    fontSize: 12,
    color: C.textSecondary,
    marginBottom: 6,
  },
  emptyChartBox: {
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChartText: { fontFamily: F.sans, fontSize: 12, color: C.textFaint },
  closeBtn: {
    marginTop: 12,
    alignItems: 'center',
    padding: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  closeTxt: { fontFamily: F.sansMedium, fontSize: 14, color: C.textSecondary },
});
