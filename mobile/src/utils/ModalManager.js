/**
 * 전역 모달 매니저 — 어디서든 showModal() 호출 가능
 * App.js에서 GlobalModal이 핸들러를 등록함
 */
let _handler = null;

const ModalManager = {
  register(handler) {
    _handler = handler;
  },
  show(opts) {
    if (_handler) _handler(opts);
  },
};

export default ModalManager;
