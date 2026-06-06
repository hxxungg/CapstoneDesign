import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { THEME, FONTS } from '../config/api';
import ChartHelpTitleButton from './ChartHelpTitleButton';
import { CHART_COUNT_UNITS } from '../config/analyticsChartHelp';

const C = THEME;
const F = FONTS;

/**
 * data: [{ label: string, value: number, color: string }]
 * size: SVG 크기 (px)
 * title: 차트 제목
 */
export default function PieChart({
  data = [], size = 130, title, helpKey, countUnit, totalCaption, totalCount,
  hideLegendCount = false, hideTitleTotal = false, percentMode = false, compact = false,
}) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const unit = countUnit ?? (helpKey && CHART_COUNT_UNITS[helpKey]) ?? '개';
  const displayTotal = totalCount ?? total;

  const pctOf = (value) => {
    if (percentMode) return `${value ?? 0}%`;
    return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%';
  };

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

  const titleWithTotal = title
    ? hideTitleTotal
      ? title
      : totalCaption != null
        ? `${title} (${totalCaption})`
        : `${title} (총 ${displayTotal}${unit})`
    : null;

  return (
    <View style={st.wrap}>
      {titleWithTotal ? (
        helpKey ? (
          <ChartHelpTitleButton title={titleWithTotal} helpKey={helpKey} />
        ) : (
          <Text style={st.title}>{titleWithTotal}</Text>
        )
      ) : null}
      <View style={[st.chartRow, compact && st.chartRowCompact]}>
        <Svg width={size} height={size}>
          {total === 0
            ? <Circle cx={size/2} cy={size/2} r={size/2 - 6} fill={C.border} />
            : renderSlices()
          }
        </Svg>
        <View style={[st.legend, compact && st.legendCompact]}>
          {data.map((d, i) => {
            const countText = `(${percentMode ? (d.count ?? 0) : (d.value ?? 0)}${unit})`;
            if (compact) {
              return (
                <View key={i} style={st.legendRowCompact}>
                  <View style={[st.legendDot, { backgroundColor: d.color }]} />
                  <View style={st.legendBodyCompact}>
                    <Text style={st.legendLabelCompact}>{d.label}</Text>
                    <Text style={st.legendMetaCompact}>
                      {pctOf(d.value ?? 0)}
                      {!hideLegendCount ? ` ${countText}` : ''}
                    </Text>
                  </View>
                </View>
              );
            }
            return (
              <View key={i} style={st.legendRow}>
                <View style={[st.legendDot, { backgroundColor: d.color }]} />
                <Text style={st.legendLabel} numberOfLines={2}>
                  {d.label}
                </Text>
                <Text style={st.legendPct}>{pctOf(d.value ?? 0)}</Text>
                {!hideLegendCount && (
                  <Text style={st.legendCount}>{countText}</Text>
                )}
              </View>
            );
          })}
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
  chartRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  chartRowCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  legend:     { flex: 1, gap: 6, minWidth: 0 },
  legendCompact: {
    flex: 0,
    width: '100%',
    gap: 5,
  },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  legendRowCompact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    width: '100%',
  },
  legendBodyCompact: { flex: 1, minWidth: 0, gap: 1 },
  legendDot:  { width: 10, height: 10, borderRadius: 5, flexShrink: 0, marginTop: 2 },
  legendLabel:{ fontFamily: F.sans, fontSize: 12, color: C.text, flex: 1, minWidth: 0 },
  legendLabelCompact: {
    fontFamily: F.sans,
    fontSize: 11,
    color: C.text,
    lineHeight: 15,
    flexWrap: 'wrap',
  },
  legendMetaCompact: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.textSecondary,
    lineHeight: 15,
  },
  legendPct:  { fontFamily: F.mono, fontSize: 12, color: C.text, flexShrink: 0, minWidth: 30, textAlign: 'right' },
  legendCount:{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary, flexShrink: 0 },
  emptyTxt:   { fontFamily: F.sans, fontSize: 12, color: C.textFaint },
});
