import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { THEME, FONTS } from '../config/api';
import { LEGAL_POLICIES } from '../config/legalPolicies';

const C = THEME;
const F = FONTS;

export default function PolicyModal({ visible, type, onClose }) {
  const content = type ? LEGAL_POLICIES[type] : null;
  if (!content) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>{content.title}</Text>
            <Pressable onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>닫기</Text>
            </Pressable>
          </View>
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            <Text style={s.body}>{content.body}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { fontFamily: F.sansSemi, fontSize: 16, color: C.text, flex: 1, paddingRight: 12 },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.card, borderRadius: 8 },
  closeBtnText: { fontFamily: F.sansMedium, fontSize: 13, color: C.textSoft },
  scroll: { padding: 20 },
  body: { fontFamily: F.sans, fontSize: 13.5, color: C.textSoft, lineHeight: 22 },
});
