import React, { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME, FONTS } from '../config/api';
import { getChartHelp } from '../config/analyticsChartHelp';
import AnalyticsHelpModal from './AnalyticsHelpModal';

const C = THEME;
const F = FONTS;

/** 차트 제목 옆 > — 초대코드 모달과 같은 설명 팝업 */
export default function ChartHelpTitleButton({ title, helpKey, titleStyle }) {
  const help = getChartHelp(helpKey);
  const [visible, setVisible] = useState(false);
  if (!help) {
    return title ? <Text style={[s.title, titleStyle]}>{title}</Text> : null;
  }

  return (
    <>
      <Pressable
        style={({ pressed }) => [s.row, pressed && { opacity: 0.75 }]}
        onPress={(e) => {
          e?.stopPropagation?.();
          setVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title} 설명 보기`}
      >
        <Text style={[s.title, titleStyle]}>{title}</Text>
        <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
      </Pressable>
      <AnalyticsHelpModal
        visible={visible}
        onClose={() => setVisible(false)}
        content={help}
      />
    </>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  title: { fontFamily: F.sansMedium, fontSize: 13, color: C.textSecondary },
});
