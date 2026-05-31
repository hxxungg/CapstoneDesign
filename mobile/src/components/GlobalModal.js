import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import ModalManager from '../utils/ModalManager';
import { THEME } from '../config/api';

/**
 * opts = { title, message, buttons, type }
 * buttons = [{ text, onPress, style }]  — style: 'cancel' | 'destructive' | default
 * type: 'info' | 'error' | 'success' | 'warning'
 */
export default function GlobalModal() {
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState({ title: '', message: '', buttons: [] });

  const show = useCallback((newOpts) => {
    const buttons = newOpts.buttons?.length
      ? newOpts.buttons
      : [{ text: '확인' }];
    setOpts({ ...newOpts, buttons });
    setVisible(true);
  }, []);

  useEffect(() => {
    ModalManager.register(show);
  }, [show]);

  const handleButton = (btn) => {
    setVisible(false);
    if (typeof btn.onPress === 'function') {
      setTimeout(btn.onPress, 150);
    }
  };

  const iconMap = {
    error:   { emoji: '❌', color: THEME.danger,   bg: THEME.dangerLight },
    success: { emoji: '✅', color: THEME.success,  bg: THEME.successLight },
    warning: { emoji: '⚠️', color: THEME.warning,  bg: THEME.warningLight },
    info:    { emoji: 'ℹ️',  color: THEME.primary,  bg: THEME.primaryLight },
  };
  const icon = iconMap[opts.type] || iconMap.info;
  const isSingle = opts.buttons.length === 1;

  const cardWidth = Math.min(width * 0.88, 360);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        {/* alignItems 없이 고정 width로 카드 렌더링 — overflow 버그 방지 */}
        <View style={[styles.card, { width: cardWidth }]}>

          {/* 아이콘 */}
          <View style={styles.iconRow}>
            <View style={[styles.iconWrap, { backgroundColor: icon.bg }]}>
              <Text style={styles.iconText}>{icon.emoji}</Text>
            </View>
          </View>

          {/* 제목 */}
          <Text style={[styles.title, { color: icon.color }]}>{opts.title}</Text>

          {/* 메시지 */}
          {!!opts.message && (
            <Text style={styles.message}>{opts.message}</Text>
          )}

          {/* 버튼 영역 */}
          {isSingle ? (
            <TouchableOpacity
              style={[styles.btnSingle, styles.btnPrimary]}
              onPress={() => handleButton(opts.buttons[0])}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, styles.btnTextPrimary]}>
                {opts.buttons[0].text}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.btnRow}>
              {opts.buttons.map((btn, idx) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.btnMulti,
                      idx < opts.buttons.length - 1 && { marginRight: 10 },
                      isCancel && styles.btnCancel,
                      isDestructive && styles.btnDestructive,
                      !isCancel && !isDestructive && styles.btnPrimary,
                    ]}
                    onPress={() => handleButton(btn)}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.btnText,
                      isCancel && styles.btnTextCancel,
                      isDestructive && styles.btnTextDestructive,
                      !isCancel && !isDestructive && styles.btnTextPrimary,
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  /* 아이콘을 가운데 정렬하기 위한 행 */
  iconRow: {
    alignItems: 'center',
    marginBottom: 14,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: { fontSize: 34 },
  title: {
    fontSize: 19,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: THEME.text,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  /* 단일 버튼: alignSelf 로 너비 제어 (width:'100%' 대신) */
  btnSingle: {
    alignSelf: 'stretch',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  /* 복수 버튼 컨테이너 */
  btnRow: {
    flexDirection: 'row',
  },
  /* 복수 버튼 개별 */
  btnMulti: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  /* 색상 변형 */
  btnPrimary: { backgroundColor: THEME.primary },
  btnCancel: { backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border },
  btnDestructive: { backgroundColor: THEME.danger },
  btnText: { fontSize: 15, fontWeight: '700' },
  btnTextPrimary: { color: '#fff' },
  btnTextCancel: { color: THEME.textSecondary },
  btnTextDestructive: { color: '#fff' },
});
