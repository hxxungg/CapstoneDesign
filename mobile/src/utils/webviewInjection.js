/**
 * WebView에 주입되는 JavaScript 스크립트
 *
 * 수집 대상:
 *  - URL 방문 (page_load): 페이지 로드 시 URL·제목·방문 시각·검색 쿼리
 *  - AI 프롬프트 (ai_prompt): textarea / contenteditable Enter 입력 또는 전송 버튼 클릭 감지
 *  - AI 응답 (ai_response): 사이트별 선택자 우선, 없으면 DOM 텍스트 델타 방식
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

  // ── 사이트별 AI 응답 선택자 ───────────────────────────────────────
  // 각 AI 사이트에서 응답 텍스트가 담긴 마지막 블록을 특정 선택자로 추출
  var AI_RESPONSE_SELECTORS = [
    // ChatGPT
    'div[data-message-author-role="assistant"] .markdown',
    'div[data-message-author-role="assistant"]',
    // Claude
    'div[data-is-streaming="false"] .font-claude-message',
    '.font-claude-message',
    // Gemini
    'model-response .markdown',
    '.response-container-scrollable',
    // Perplexity
    '.prose',
    // 뤼튼(wrtn), 기타
    '.assistant-message',
    '.ai-message',
    '[data-role="assistant"]',
  ];

  function extractResponseFromDOM() {
    for (var i = 0; i < AI_RESPONSE_SELECTORS.length; i++) {
      try {
        var els = document.querySelectorAll(AI_RESPONSE_SELECTORS[i]);
        if (els.length > 0) {
          // 마지막 응답 블록의 텍스트
          var lastEl = els[els.length - 1];
          var text = (lastEl.innerText || lastEl.textContent || '').trim();
          if (text.length > 20) return text;
        }
      } catch (e) {}
    }
    return null;
  }

  // ── AI 응답 캡처 상태 ─────────────────────────────────────────────
  var pendingAiLogId      = null;
  var prePromptTextLength = 0;
  var responseTimer       = null;
  var maxResponseTimer    = null;
  var isWaitingResponse   = false;
  var lastPromptText      = '';
  var lastPromptTime      = 0;
  var DEDUP_MS            = 1200;

  function captureResponse() {
    if (!isWaitingResponse) return;
    isWaitingResponse = false;
    clearTimeout(responseTimer);
    clearTimeout(maxResponseTimer);

    var responseText = '';

    // 1순위: 사이트별 선택자로 응답 블록 직접 추출
    var domText = extractResponseFromDOM();
    if (domText && domText.length >= 10) {
      responseText = domText.slice(0, 8000);
    } else {
      // 2순위: 페이지 전체 텍스트 델타
      var fullText = document.body ? document.body.innerText : '';
      if (prePromptTextLength > 0 && fullText.length > prePromptTextLength) {
        responseText = fullText.slice(prePromptTextLength).trim().slice(0, 8000);
      }
      // 3순위: 페이지 하단 텍스트
      if (responseText.length < 10) {
        responseText = fullText.slice(-8000).trim();
      }
    }

    if (responseText.length >= 5) {
      send({
        type: 'ai_response',
        log_id: pendingAiLogId,
        response: responseText,
        complete_at: new Date().toISOString(),
      });
    }
    pendingAiLogId      = null;
    prePromptTextLength = 0;
  }

  // DOM 변화 감시 → 응답 디바운스 (5초 안정화 대기 — 스트리밍 중 조기 캡처 방지)
  var domObserver = new MutationObserver(function () {
    if (!isWaitingResponse) return;
    clearTimeout(responseTimer);
    responseTimer = setTimeout(captureResponse, 5000);
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
      // 최대 60초 후 강제 캡처 (긴 응답·느린 모델 대비)
      maxResponseTimer = setTimeout(function () {
        if (isWaitingResponse) captureResponse();
      }, 60000);
    }
  }

  function getInputText(el) {
    return (el.value || el.innerText || el.textContent || '').trim();
  }

  // ── 입력 요소 추적 ────────────────────────────────────────────────
  function attachPromptTracker(el) {
    if (el._lhTracked) return;
    el._lhTracked = true;

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        var text = getInputText(el);
        if (text) onPromptSubmit(text);
      }
    });

    var form = el.closest('form');
    if (form && !form._lhTracked) {
      form._lhTracked = true;
      form.addEventListener('submit', function () {
        var text = getInputText(el);
        if (text) onPromptSubmit(text);
      });
    }
  }

  // ── 전송 버튼 추적 ────────────────────────────────────────────────
  var SEND_BUTTON_SELECTORS = [
    'button[data-testid="send-button"]',
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
    'ms-chat-input button',
    'rich-textarea + button',
  ];

  function getActiveInputText() {
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
      var text = getActiveInputText();
      if (text) onPromptSubmit(text);
    }, true);
  }

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
