import { Platform, Alert } from 'react-native';

/**
 * react-native-web의 Alert.alert는 no-op이라 웹에서는 window.alert / confirm 사용.
 * 시그니처는 Alert.alert(title, message?, buttons?, options?) 와 동일하게 사용.
 */
export function appAlert(title, message, buttons, options) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const parts = [title];
    if (message != null && message !== '') parts.push(String(message));
    const msg = parts.join('\n\n');

    if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
      window.alert(msg);
      return;
    }

    if (buttons.length === 1) {
      window.alert(msg);
      const p = buttons[0].onPress;
      if (typeof p === 'function') setTimeout(() => p(), 0);
      return;
    }

    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    const confirmBtn = [...buttons].filter((b) => b.style !== 'cancel').pop();
    const webHint = '\n\n(웹: [확인] = 진행, [취소] = 그만두기)';
    if (window.confirm(msg + webHint)) {
      if (typeof confirmBtn?.onPress === 'function') setTimeout(() => confirmBtn.onPress(), 0);
    } else if (typeof cancelBtn?.onPress === 'function') {
      setTimeout(() => cancelBtn.onPress(), 0);
    }
    return;
  }

  Alert.alert(title, message, buttons, options);
}
