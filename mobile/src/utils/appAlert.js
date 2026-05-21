import ModalManager from './ModalManager';

/**
 * Alert.alert()와 동일한 시그니처 — 어디서나 커스텀 모달로 표시됨
 * appAlert(title, message?, buttons?, options?)
 *
 * options.type: 'info' | 'error' | 'success' | 'warning'  (아이콘/색상 제어)
 */
export function appAlert(title, message, buttons, options) {
  const btns = buttons?.length ? buttons : [{ text: '확인' }];
  ModalManager.show({
    title: title ?? '',
    message: message ?? '',
    buttons: btns,
    type: options?.type ?? 'info',
  });
}
