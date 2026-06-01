import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, Keyboard, Platform,
} from 'react-native';
import { assignmentAPI, assessmentAPI } from '../services/api';
import { THEME, FONTS } from '../config/api';
import { appAlert } from '../utils/appAlert';
import { VALIDATION } from '../utils/uiCopy';

const C = THEME;
const F = FONTS;

export default function EnrollCodeModal({ visible, onClose, navigation, onJoined }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return undefined;
    }
    setCode('');

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const close = () => {
    if (loading) return;
    setCode('');
    onClose();
  };

  const handleEnroll = async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      appAlert('입력 오류', VALIDATION.assessmentCode, null, { type: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const result = await assessmentAPI.join(trimmedCode);
      close();
      onJoined?.();
      navigation.navigate('Work', { participation_id: result.participation_id });
    } catch (err) {
      if (err.status === 409) {
        const participationId = err.data?.participation_id;
        close();
        onJoined?.();
        if (participationId) {
          navigation.navigate('Work', { participation_id: participationId });
        } else {
          appAlert('이미 참여 중', '이미 참여한 수행평가입니다. 목록에서 확인할 수 있습니다.', null, { type: 'info' });
        }
        return;
      }
      if (err.status === 404) {
        try {
          const oldResult = await assignmentAPI.enroll(trimmedCode);
          close();
          onJoined?.();
          if (oldResult.assignment) {
            navigation.navigate('StageList', { assignment: oldResult.assignment });
          }
          return;
        } catch {
          appAlert('참여 실패', '유효하지 않은 수행평가 코드입니다.', null, { type: 'error' });
          return;
        }
      }
      appAlert('참여 실패', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        style={[
          s.overlay,
          keyboardHeight > 0
            ? { justifyContent: 'flex-end', paddingBottom: keyboardHeight + 24 }
            : { justifyContent: 'flex-start', paddingTop: 72 },
        ]}
        onPress={close}
      >
        <Pressable style={s.card} onPress={() => {}}>
          <Text style={s.title}>수행평가 참여</Text>
          <Text style={s.body}>교사에게 받은 초대 코드를 입력하면 참여할 수 있습니다.</Text>
          <TextInput
            style={s.input}
            value={code}
            onChangeText={setCode}
            placeholder="예: AB12CD34"
            placeholderTextColor={C.textFaint || C.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            autoFocus={visible}
            onSubmitEditing={handleEnroll}
          />
          <View style={s.btnRow}>
            <Pressable
              style={({ pressed }) => [s.btn, s.btnCancel, pressed && { opacity: 0.7 }]}
              onPress={close}
              disabled={loading}
            >
              <Text style={s.btnCancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.btn, s.btnPrimary, (pressed || loading) && { opacity: 0.7 }]}
              onPress={handleEnroll}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnConfirmText}>참여하기</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,27,45,0.4)',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: 340, padding: 28, borderRadius: 16,
    backgroundColor: C.background, gap: 16,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  title: { fontFamily: F.serifKo, fontSize: 22, color: C.text },
  body:  { fontFamily: F.sans, fontSize: 14, color: C.textSoft, lineHeight: 21 },
  input: {
    height: 52, paddingHorizontal: 16,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12,
    fontFamily: F.mono, fontSize: 18, color: C.text,
    textAlign: 'center', letterSpacing: 2,
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnCancel:  { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  btnPrimary: { backgroundColor: C.dark },
  btnCancelText:  { fontFamily: F.sansMedium, fontSize: 15, color: C.textSecondary },
  btnConfirmText: { fontFamily: F.sansMedium, fontSize: 15, color: '#fff' },
});
