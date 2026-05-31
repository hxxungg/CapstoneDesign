import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { THEME, FONTS } from '../config/api';

const C = THEME;
const F = FONTS;

/**
 * data: [{ label: string, value: number, color: string }]
 * size: SVG 크기 (px)
 * title: 차트 제목
 */
export default function PieChart({ data = [], size = 130, title }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);

  const renderSlices = () => {
    if (total === 0) return null;
    const cx = size / 2;
    const cy = size / 2;
    const r  = size / 2 - 6;

    // 항목이 1개면 원 하나로 표시
    if (data.filter(d => d.value > 0).length === 1) {
      const single = data.find(d => d.value > 0);
      return <Circle cx={cx} cy={cy} r={r} fill={single.color} />;
    }

    let startAngle = -Math.PI / 2;
    return data
      .filter(d => d.value > 0)
      .map((d, i) => {
        const angle    = (d.value / total) * 2 * Math.PI;
        const endAngle = startAngle + angle;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;
        startAngle = endAngle;
        return <Path key={i} d={path} fill={d.color} />;
      });
  };

  return (
    <View style={st.wrap}>
      {title ? <Text style={st.title}>{title}</Text> : null}
      <View style={st.chartRow}>
        {/* 파이 */}
        <Svg width={size} height={size}>
          {total === 0
            ? <Circle cx={size/2} cy={size/2} r={size/2 - 6} fill={C.border} />
            : renderSlices()
          }
        </Svg>
        {/* 범례 */}
        <View style={st.legend}>
          {data.map((d, i) => (
            <View key={i} style={st.legendRow}>
              <View style={[st.legendDot, { backgroundColor: d.color }]} />
              <Text style={st.legendLabel} numberOfLines={1}>
                {d.label}
              </Text>
              <Text style={st.legendVal}>
                {total > 0 ? `${Math.round((d.value / total) * 100)}%` : '0%'}
              </Text>
            </View>
          ))}
          {total === 0 && (
            <Text style={st.emptyTxt}>데이터 없음</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:       { gap: 8 },
  title:      { fontFamily: F.sansMedium, fontSize: 13, color: C.textSecondary },
  chartRow:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend:     { flex: 1, gap: 6 },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  legendLabel:{ fontFamily: F.sans, fontSize: 12, color: C.text, flex: 1 },
  legendVal:  { fontFamily: F.mono, fontSize: 12, color: C.textSecondary },
  emptyTxt:   { fontFamily: F.sans, fontSize: 12, color: C.textFaint },
});
