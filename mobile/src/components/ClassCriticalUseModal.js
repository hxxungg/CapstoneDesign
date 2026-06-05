import React from 'react';
import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { THEME, FONTS } from '../config/api';
import PieChart from './PieChart';

const C = THEME;
const F = FONTS;

export default function ClassCriticalUseModal({ visible, onClose, summary }) {
  const avgCritical = summary?.critical_use_avg_percent;
  const avgOther = summary?.critical_use_other_avg_percent;
  const studentCount = summary?.critical_use_students_with_prompts ?? 0;
  const hasData = avgCritical != null && avgOther != null && studentCount > 0;

  const pieData = hasData
    ? [
        { label: '비판적 사용', value: avgCritical, color: '#7B1FA2' },
        { label: '기타', value: avgOther, color: '#BDBDBD' },
      ]
    : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="닫기" />
        <View style={s.box}>
          <Text style={s.title}>반 비판적 사용</Text>
          <Text style={s.sub}>
            {hasData
              ? `AI 질문이 있는 학생 ${studentCount}명의 비율 평균`
              : '아직 AI 질문 데이터가 없습니다.'}
          </Text>
          {hasData && (
            <PieChart
              title="비판적 사용 평균"
              totalCaption={`${studentCount}명`}
              data={pieData}
              size={130}
              hideLegendCount
            />
          )}
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
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,27,45,0.4)' },
  box: {
    width: 340,
    maxWidth: '100%',
    padding: 24,
    borderRadius: 16,
    backgroundColor: C.background,
    zIndex: 1,
    gap: 8,
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
    marginBottom: 4,
  },
  closeBtn: {
    marginTop: 8,
    alignItems: 'center',
    padding: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  closeTxt: { fontFamily: F.sansMedium, fontSize: 14, color: C.textSecondary },
});
