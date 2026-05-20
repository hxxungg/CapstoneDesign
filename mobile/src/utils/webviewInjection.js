/**
 * WebView에 주입되는 JavaScript 스크립트
 *
 * 수집 대상:
 *  - URL 방문 (page_load): 페이지 로드 시 URL·제목·방문 시각·검색 쿼리
 *  - AI 프롬프트 (ai_prompt): textarea / contenteditable Enter 입력 또는 전송 버튼 클릭 감지
 *  - AI 응답 (ai_response): 프롬프트 후 DOM 안정화(2.5s 디바운스) 시 페이지 신규 텍스트 캡처
 */
export const WEBVIEW_LOG_SCRIPT = `
(function () {
  'use strict';

  // ── 유틸 ─────────────────────────────────────────────────────────
  function extractSearchQuery(url) {
    try {
      var u = new URL(url);
      return (
        u.searchParams.get('q') ||
        u.searchParams.get('query') ||
        u.searchParams.get('search_query') ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  function isAiSite(url) {
    return /chatgpt\\.com|chat\\.openai\\.com|gemini\\.google\\.com|claude\\.ai|perplexity\\.ai|copilot\\.microsoft\\.com|wrtn\\.ai|clova\\.ai|clova\\.naver\\.com|askup\\.ai|hcx\\.ai/.test(url);
  }

  function send(obj) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    } catch (e) {}
  }

  // ── AI 응답 캡처 상태 ─────────────────────────────────────────────
  var pendingAiLogId      = null;
  var prePromptTextLength = 0;   // 프롬프트 전송 직전 페이지 텍스트 길이
  var responseTimer       = null;
  var isWaitingResponse   = false;
  var lastPromptText      = '';
  var lastPromptTime      = 0;
  var DEDUP_MS            = 1200;

  function captureResponse() {
    if (!isWaitingResponse) return;
    isWaitingResponse = false;

    var fullText = document.body ? document.body.innerText : '';

    // 프롬프트 전송 이후 새로 추가된 텍스트를 응답으로 사용
    var responseText = '';
    if (prePromptTextLength > 0 && fullText.length > prePromptTextLength) {
      responseText = fullText.slice(prePromptTextLength).trim().slice(0, 4000);
    }

    // 새 텍스트가 충분하지 않으면 페이지 하단 텍스트를 fallback으로 사용
    if (responseText.length < 10) {
      responseText = fullText.slice(-4000).trim();
    }

    if (responseText.length >= 5) {
      send({
        type: 'ai_response',
        log_id: pendingAiLogId,
        response: responseText.slice(0, 4000),
        complete_at: new Date().toISOString(),
      });
    }
    pendingAiLogId      = null;
    prePromptTextLength = 0;
    clearTimeout(maxResponseTimer);
  }

  // DOM 변화 감시 → 응답 디바운스 (3초 안정화 대기)
  var maxResponseTimer = null;
  var domObserver = new MutationObserver(function () {
    if (!isWaitingResponse) return;
    clearTimeout(responseTimer);
    responseTimer = setTimeout(captureResponse, 3000);
  });

  function startDomObserver() {
    var target = document.body || document.documentElement;
    domObserver.observe(target, { childList: true, subtree: true, characterData: true });
  }

  if (document.body) {
    startDomObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startDomObserver);
  }

  // ── AI 프롬프트 전송 처리 ─────────────────────────────────────────
  function onPromptSubmit(text) {
    if (!text || text.trim().length < 2) return;

    // 중복 전송 방지
    var now = Date.now();
    if (text.trim() === lastPromptText && now - lastPromptTime < DEDUP_MS) return;
    lastPromptText = text.trim();
    lastPromptTime = now;

    var fullText = document.body ? document.body.innerText : '';
    prePromptTextLength = fullText.length;
    isWaitingResponse   = isAiSite(location.href);

    send({
      type: 'ai_prompt',
      url: location.href,
      prompt: text.trim().slice(0, 2000),
      is_ai_site: isAiSite(location.href),
    });

    if (isWaitingResponse) {
      clearTimeout(responseTimer);
      clearTimeout(maxResponseTimer);
      // 첫 응답 시작 대기 5초
      responseTimer = setTimeout(captureResponse, 5000);
      // 최대 30초 후 강제 캡처 (긴 응답 대비)
      maxResponseTimer = setTimeout(function () {
        if (isWaitingResponse) captureResponse();
      }, 30000);
    }
  }

  // 입력 요소에서 현재 텍스트 추출
  function getInputText(el) {
    return (el.value || el.innerText || el.textContent || '').trim();
  }

  // ── 입력 요소 추적 ────────────────────────────────────────────────
  function attachPromptTracker(el) {
    if (el._lhTracked) return;
    el._lhTracked = true;

    // Enter 키 전송 감지 (Shift+Enter는 줄바꿈)
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        var text = getInputText(el);
        if (text) onPromptSubmit(text);
      }
    });

    // 폼 submit 감지
    var form = el.closest('form');
    if (form && !form._lhTracked) {
      form._lhTracked = true;
      form.addEventListener('submit', function () {
        var text = getInputText(el);
        if (text) onPromptSubmit(text);
      });
    }
  }

  // ── 전송 버튼 추적 (ChatGPT·Gemini·Claude 버튼 클릭 대응) ─────────
  var SEND_BUTTON_SELECTORS = [
    'button[data-testid="send-button"]',          // ChatGPT
    'button[aria-label*="Send"]',
    'button[aria-label*="전송"]',
    'button[aria-label*="보내기"]',
    'button[aria-label*="submit"]',
    'button[aria-label*="Submit"]',
    'button.send-button',
    'button[class*="send"]',
    'button[class*="Send"]',
    'button[class*="submit"]',
    '[role="button"][aria-label*="Send"]',
    '[role="button"][aria-label*="전송"]',
    'ms-chat-input button',                        // Copilot
    'rich-textarea + button',                      // Gemini
  ];

  function getActiveInputText() {
    // 현재 포커스된 입력 요소 우선
    var active = document.activeElement;
    if (active) {
      var tag = active.tagName;
      if (
        tag === 'TEXTAREA' ||
        active.getAttribute('contenteditable') === 'true' ||
        active.getAttribute('role') === 'textbox'
      ) {
        var t = getInputText(active);
        if (t) return t;
      }
    }
    // 포커스가 버튼 등에 있을 때 가장 최근 입력 요소에서 텍스트 취득
    var inputs = document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]');
    for (var i = inputs.length - 1; i >= 0; i--) {
      var t2 = getInputText(inputs[i]);
      if (t2) return t2;
    }
    return '';
  }

  function attachSendButton(btn) {
    if (btn._lhTracked) return;
    btn._lhTracked = true;
    btn.addEventListener('click', function () {
      // 버튼 클릭 직전 입력 텍스트 추출
      var text = getActiveInputText();
      if (text) onPromptSubmit(text);
    }, true);  // capture phase → 실제 클릭 전에 텍스트 읽기 위함
  }

  // 동적 DOM 감시 (React·Vue SPA 대응)
  var inputObserver = new MutationObserver(function () {
    document
      .querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
      .forEach(attachPromptTracker);

    SEND_BUTTON_SELECTORS.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(attachSendButton);
      } catch (e) {}
    });
  });

  function startInputObserver() {
    inputObserver.observe(document.body, { childList: true, subtree: true });

    document
      .querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
      .forEach(attachPromptTracker);

    SEND_BUTTON_SELECTORS.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(attachSendButton);
      } catch (e) {}
    });
  }

  if (document.body) {
    startInputObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startInputObserver);
  }

  // ── 페이지 로드 시 URL 정보 전송 ────────────────────────────────
  send({
    type: 'page_load',
    url: location.href,
    title: document.title,
    search_query: extractSearchQuery(location.href),
    is_ai_site: isAiSite(location.href),
    visited_at: new Date().toISOString(),
  });

  // ── React Native → WebView 로 ai_log id 주입 ────────────────────
  window._setPendingAiLogId = function (id) {
    pendingAiLogId = id;
  };
})();
true;
`;
