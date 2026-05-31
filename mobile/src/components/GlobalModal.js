import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, useWindowDimensions,
} from 'react-native';
import ModalManager from '../utils/ModalManager';
import { THEME, FONTS } from '../config/api';

const C = THEME;
const F = FONTS;

/**
 * opts = { title, message, buttons, type }
 * buttons = [{ text, onPress, style }]  — style: 'cancel' | 'destructive' | default
 * type: 'info' | 'error' | 'success' | 'warning' (타입별 강조는 메시지 박스 색만)
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

  const accentMap = {
    error:   { bg: C.dangerLight,  border: C.danger + '30',  text: C.danger },
    success: { bg: C.successLight, border: C.success + '30', text: C.success },
    warning: { bg: C.warningLight, border: C.warning + '30', text: C.warning },
    info:    { bg: C.primaryLight, border: C.primary + '30', text: C.primary },
  };
  const accent = accentMap[opts.type] || accentMap.info;
  const isSingle = opts.buttons.length === 1;
  const cardWidth = Math.min(width - 48, 340);
  const useHighlightBox = (msg) => {
    const t = (msg || '').trim();
    if (!t) return false;
    if (/^\d+(\.\d+)?점$/.test(t)) return true;
    return t.length <= 12 && !/[\s.]/.test(t) && !t.includes('습니다');
  };
  const highlightMessage = useHighlightBox(opts.message);

  const closeModal = () => {
    if (isSingle) handleButton(opts.buttons[0]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeModal}
    >
      <Pressable style={styles.overlay} onPress={closeModal}>
        <Pressable style={[styles.modalBox, { width: cardWidth }]} onPress={() => {}}>
          <Text style={styles.modalTitle}>{opts.title}</Text>

          {!!opts.message && (
            highlightMessage ? (
              <View style={[styles.messageBox, {
                backgroundColor: accent.bg,
                borderColor: accent.border,
              }]}>
                <Text style={[styles.messageBoxText, { color: accent.text }]}>
                  {opts.message}
                </Text>
              </View>
            ) : (
              <Text style={styles.modalSub}>{opts.message}</Text>
            )
          )}

          {isSingle ? (
            <Pressable
              style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
              onPress={() => handleButton(opts.buttons[0])}
            >
              <Text style={styles.modalCloseTxt}>{opts.buttons[0].text}</Text>
            </Pressable>
          ) : (
            <View style={styles.btnRow}>
              {opts.buttons.map((btn, idx) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                return (
                  <Pressable
                    key={idx}
                    style={({ pressed }) => [
                      styles.btn,
                      isCancel && styles.btnCancel,
                      isDestructive && styles.btnDestructive,
                      !isCancel && !isDestructive && styles.btnPrimary,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => handleButton(btn)}
                  >
                    <Text style={[
                      styles.btnText,
                      isCancel && styles.btnTextCancel,
                      (isDestructive || (!isCancel && !isDestructive)) && styles.btnTextPrimary,
                    ]}>
                      {btn.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Pressable>
      </Pressable>
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
  modalBox: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: C.background,
    shadowColor: C.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
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
    marginBottom: 4,
    textAlign: 'center',
    lineHeight: 20,
  },
  messageBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  messageBoxText: {
    fontFamily: F.monoMed ?? F.mono,
    fontSize: 22,
    letterSpacing: 1,
    textAlign: 'center',
  },
  modalCloseBtn: {
    marginTop: 14,
    alignItems: 'center',
    padding: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalCloseTxt: {
    fontFamily: F.sansMedium,
    fontSize: 14,
    color: C.textSecondary,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  btnPrimary: {
    backgroundColor: C.dark,
  },
  btnDestructive: {
    backgroundColor: C.danger,
  },
  btnText: {
    fontFamily: F.sansMedium,
    fontSize: 15,
  },
  btnTextCancel: {
    color: C.textSecondary,
  },
  btnTextPrimary: {
    color: '#fff',
  },
});
