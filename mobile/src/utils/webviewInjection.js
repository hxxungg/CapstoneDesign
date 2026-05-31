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
    // ChatGPT (2024-2026 DOM)
    '[data-message-author-role="assistant"] .markdown.prose',
    '[data-message-author-role="assistant"] .prose',
    '[data-message-author-role="assistant"]',
    'article[data-testid*="conversation-turn"] [data-message-author-role="assistant"]',
    // ChatGPT 구버전
    'div[data-message-author-role="assistant"] .markdown',
    // Claude (claude.ai)
    'div[data-is-streaming="false"] .font-claude-message',
    '.font-claude-message',
    '[data-testid="chat-turn-has-streaming-complete"]',
    // Gemini
    'model-response ms-text-chunk',
    'model-response .markdown',
    '.response-container-scrollable',
    'message-content.model-response-text',
    // Perplexity
    '.prose',
    '[data-testid="answer"]',
    // 뤼튼(wrtn)
    '.assistant-message',
    '.wrtn-answer',
    // 기타 공통
    '.ai-message',
    '[data-role="assistant"]',
    '[aria-label*="assistant"]',
    '[class*="response"][class*="assistant"]',
  ];

  // 응답 블록에서 실제 텍스트만 추출 (ChatGPT 피드백 UI 요소 제외)
  var EXCLUDE_SELECTORS = [
    'button', 'form', '[role="button"]',
    '[data-testid*="thumbs"]', '[data-testid*="feedback"]',
    '[aria-label*="thumbs"]', '[aria-label*="좋아요"]',
    '.flex.gap-3.empty\\:hidden',  // ChatGPT 하단 버튼 행
  ];

  function getCleanText(el) {
    // 복사본 만들어서 UI 버튼 요소 제거 후 텍스트 추출
    try {
      var clone = el.cloneNode(true);
      EXCLUDE_SELECTORS.forEach(function(sel) {
        try {
          clone.querySelectorAll(sel).forEach(function(n) { n.remove(); });
        } catch(e) {}
      });
      return (clone.innerText || clone.textContent || '').trim();
    } catch(e) {
      return (el.innerText || el.textContent || '').trim();
    }
  }

  function extractResponseFromDOM() {
    for (var i = 0; i < AI_RESPONSE_SELECTORS.length; i++) {
      try {
        var els = document.querySelectorAll(AI_RESPONSE_SELECTORS[i]);
        if (els.length > 0) {
          // 마지막 응답 블록의 텍스트 (UI 버튼 제외)
          var lastEl = els[els.length - 1];
          var text = getCleanText(lastEl);
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

  // AI 사이트 UI 면책 문구 패턴 — 응답에서 제거
  var DISCLAIMER_PATTERNS = [
    /ChatGPT는 실수를 할 수 있습니다[\s\S]{0,80}재차 확인하세요[\.\s]*/g,
    /ChatGPT can make mistakes[\s\S]{0,80}important info[\.\s]*/gi,
    /이 성격이 마음에 드시나요\?[\s\S]{0,200}신고하기/g,
    /메시지 ChatGPT/g,
    /Send a message/g,
  ];

  function normalizeAiText(text) {
    if (!text) return '';
    return text
      .replace(/\\r\\n/g, '\\n')
      .replace(/\\u00a0/g, ' ')
      .split('\\n')
      .map(function(line) { return line.trim(); })
      .filter(function(line) { return line.length > 0; })
      .join('\\n')
      .trim();
  }

  function cleanResponse(text) {
    var t = text;
    DISCLAIMER_PATTERNS.forEach(function(p) { t = t.replace(p, ''); });
    return normalizeAiText(t);
  }

  function isDisclaimerOnly(text) {
    if (!text) return true;
    var t = text.trim();
    if (t.length < 5) return true;
    if (/^ChatGPT는 실수를 할 수 있습니다[\s\S]{0,40}재차 확인하세요\.?$/i.test(t)) return true;
    if (/^ChatGPT can make mistakes[\s\S]{0,40}important info\.?$/i.test(t)) return true;
    if (t.indexOf('ChatGPT는 실수를 할 수 있습니다') >= 0 && t.length < 80) return true;
    if (t.indexOf('ChatGPT can make mistakes') >= 0 && t.length < 80) return true;
    return false;
  }

  function captureResponse() {
    if (!isWaitingResponse) return;
    isWaitingResponse = false;
    clearTimeout(responseTimer);
    clearTimeout(maxResponseTimer);

    var responseText = '';

    // 1순위: 사이트별 선택자로 응답 블록 직접 추출
    var domText = extractResponseFromDOM();
    if (domText && domText.length >= 10) {
      responseText = cleanResponse(domText).slice(0, 8000);
    } else {
      // 2순위: 페이지 전체 텍스트 델타
      var fullText = document.body ? document.body.innerText : '';
      if (prePromptTextLength > 0 && fullText.length > prePromptTextLength) {
        responseText = cleanResponse(fullText.slice(prePromptTextLength).trim()).slice(0, 8000);
      }
      // 3순위: 페이지 하단 텍스트 (면책 문구 제거 후)
      if (responseText.length < 10) {
        responseText = cleanResponse(fullText.slice(-8000).trim());
      }
    }

    if (responseText.length >= 5 && !isDisclaimerOnly(responseText)) {
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

  // DOM 변화 감시 → 응답 디바운스 (3초 안정화 대기)
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
      prompt: normalizeAiText(text.trim()).slice(0, 2000),
      is_ai_site: isAiSite(location.href),
    });

    if (isWaitingResponse) {
      clearTimeout(responseTimer);
      clearTimeout(maxResponseTimer);
      // 첫 응답 시작 대기 3초
      responseTimer = setTimeout(captureResponse, 3000);
      // 최대 45초 후 강제 캡처
      maxResponseTimer = setTimeout(function () {
        if (isWaitingResponse) captureResponse();
      }, 45000);
    }
  }

  function getInputText(el) {
    return (el.value || el.innerText || el.textContent || '').trim();
  }

  // ── 입력 요소 추적 ────────────────────────────────────────────────
  function attachPromptTracker(el) {
    if (el._lhTracked) return;
    el._lhTracked = true;

    // Enter 키 감지 제거 — 화면의 전송 버튼 클릭만 수집
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
