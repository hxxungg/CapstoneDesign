import React from 'react';
import {
  Modal,
  Pressable,
  Text,
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { THEME, FONTS } from '../config/api';

const C = THEME;
const F = FONTS;

/**
 * 초대코드 확인 모달과 동일한 중앙 카드 스타일
 * content: { title, subtitle?, items: [{ color?, label, description }] }
 */
export default function AnalyticsHelpModal({ visible, onClose, content }) {
  const { height: winH } = useWindowDimensions();
  if (!content) return null;

  // 헤더·닫기 버튼 높이를 뺀 스크롤 영역 (모바일에서 ScrollView 높이 제한 필요)
  const scrollMaxH = Math.max(160, Math.floor(winH * 0.82) - 200);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Pressable
          style={s.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        />
        <View style={s.modalBox}>
          <Text style={s.modalTitle}>{content.title}</Text>
          {content.subtitle ? <Text style={s.modalSub}>{content.subtitle}</Text> : null}
          <ScrollView
            style={[s.scroll, { maxHeight: scrollMaxH }]}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            bounces
          >
            {content.items?.map((item, i) => (
              <View key={`${item.label}-${i}`} style={s.item}>
                <View style={s.itemHead}>
                  {item.color ? (
                    <View style={[s.dot, { backgroundColor: item.color }]} />
                  ) : null}
                  <Text style={s.itemLabel}>{item.label}</Text>
                </View>
                <Text style={s.itemDesc}>{item.description}</Text>
              </View>
            ))}
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
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,27,45,0.4)',
  },
  modalBox: {
    width: 340,
    maxWidth: '100%',
    maxHeight: '82%',
    padding: 24,
    borderRadius: 16,
    backgroundColor: C.background,
    zIndex: 1,
    elevation: 12,
    shadowColor: C.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    ...(Platform.OS === 'android' ? { overflow: 'hidden' } : {}),
  },
  modalTitle: {
    fontFamily: F.serifKo,
    fontSize: 20,
    color: C.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSub: {
    fontFamily: F.sans,
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: { gap: 12, paddingBottom: 4 },
  item: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 6,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  itemLabel: { fontFamily: F.sansSemi ?? F.sansMedium, fontSize: 14, color: C.text, flex: 1 },
  itemDesc: { fontFamily: F.sans, fontSize: 13, color: C.textSecondary, lineHeight: 20 },
  closeBtn: {
    marginTop: 14,
    alignItems: 'center',
    padding: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  closeTxt: { fontFamily: F.sansMedium, fontSize: 14, color: C.textSecondary },
});
