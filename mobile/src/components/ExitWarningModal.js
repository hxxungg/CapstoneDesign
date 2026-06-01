import React from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, useWindowDimensions,
} from 'react-native';
import { THEME, FONTS } from '../config/api';

const C = THEME;
const F = FONTS;

export default function ExitWarningModal({ visible, onClose, attemptCount }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 48, 340);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <Pressable style={[styles.card, { width: cardWidth }]} onPress={() => {}}>
          <Text style={styles.title}>앱 이탈 감지</Text>

          <Text style={styles.body}>
            수행평가 진행 중에는 앱을 나갈 수 없습니다.{'\n\n'}
            이탈 시도는 담당 교사에게 보고되며, 수행평가에 성실히 임해야 합니다.
          </Text>

          {attemptCount > 1 && (
            <View style={styles.messageBox}>
              <Text style={styles.messageBoxText}>
                총 {attemptCount}회 이탈 시도가 기록되었습니다.
              </Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
            onPress={onClose}
          >
            <Text style={styles.closeBtnText}>수행평가 계속하기</Text>
          </Pressable>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,27,45,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    padding: 28,
    borderRadius: 16,
    backgroundColor: C.background,
    gap: 16,
    shadowColor: C.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontFamily: F.serifKo,
    fontSize: 22,
    color: C.text,
    textAlign: 'center',
  },
  body: {
    fontFamily: F.sans,
    fontSize: 14,
    color: C.textSoft,
    lineHeight: 21,
    textAlign: 'center',
  },
  messageBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.warning + '30',
    backgroundColor: C.warningLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  messageBoxText: {
    fontFamily: F.sansMedium,
    fontSize: 13,
    color: C.warning,
    textAlign: 'center',
    lineHeight: 20,
  },
  closeBtn: {
    marginTop: 4,
    alignItems: 'center',
    padding: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  closeBtnText: {
    fontFamily: F.sansMedium,
    fontSize: 14,
    color: C.textSecondary,
  },
});
