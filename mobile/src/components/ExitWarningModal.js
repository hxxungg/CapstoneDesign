import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Animated, useWindowDimensions,
} from 'react-native';
import { THEME } from '../config/api';

export default function ExitWarningModal({ visible, onClose, attemptCount }) {
  const { width } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { width: width * 0.88 }]}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🚨</Text>
          </View>

          <Text style={styles.title}>앱 이탈 감지</Text>

          <Text style={styles.message}>
            수행평가 진행 중에는 앱을 나갈 수 없습니다.{'\n\n'}
            이 행동은 교사에게 기록됩니다.
          </Text>

          {attemptCount > 1 && (
            <View style={styles.countBox}>
              <Text style={styles.countText}>⚠️ 총 {attemptCount}회 이탈 시도가 기록되었습니다.</Text>
            </View>
          )}

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>📌 안내</Text>
            <Text style={styles.infoText}>
              • 수행평가 완료 전까지 앱을 종료할 수 없습니다.{'\n'}
              • 모든 이탈 시도는 담당 교사에게 보고됩니다.{'\n'}
              • 수행평가에 성실히 임해주세요.
            </Text>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>수행평가 계속하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 20,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: THEME.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: THEME.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  countBox: {
    backgroundColor: THEME.warningLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.warning + '40',
  },
  countText: {
    fontSize: 13,
    color: THEME.warning,
    fontWeight: '600',
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: THEME.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: THEME.textSecondary,
    lineHeight: 20,
  },
  closeButton: {
    backgroundColor: THEME.primary,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
