import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { THEME, FONTS } from '../config/api';
import { getSimilarityLegendRows } from '../config/analyticsChartHelp';

const C = THEME;
const F = FONTS;

/** AI 분석 요약 — 유사도 구간 범례 (표시만, 설명 모달은 그래프 > 버튼) */
export default function SimilarityLegendWithHelp({ style, items }) {
  const rows = items ?? getSimilarityLegendRows();

  return (
    <View style={[s.wrap, style]}>
      {rows.map((row) => (
        <View key={row.label} style={s.item}>
          <View style={[s.dot, { backgroundColor: row.color }]} />
          <Text style={s.label}>{row.label}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  label: { fontFamily: F.sans, fontSize: 12, color: C.text },
});
