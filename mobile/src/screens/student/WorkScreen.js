import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  PanResponder, Dimensions, Platform, ActivityIndicator,
  BackHandler, AppState, Linking, TextInput, Keyboard, Pressable, Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '../../utils/appAlert';
import { VALIDATION } from '../../utils/uiCopy';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI, assessmentAPI, logAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, FONTS, INAPP_BROWSER_HOME } from '../../config/api';
import {
  stageAllowsAiBrowser,
  stageIsConditionalAi,
  stageIsUnrestrictedAiBrowser,
  getStudentAiBadgeText,
  getStudentAiBadgeColor,
} from '../../config/defaultPerformanceStages';
import ExitWarningModal from '../../components/ExitWarningModal';
import AppShell from '../../components/AppShell';
import { ConditionalUnlockDivider } from '../../components/SimilarityActivityPanel';
import { WEBVIEW_LOG_SCRIPT } from '../../utils/webviewInjection';
import { normalizeAiText } from '../../utils/normalizeAiText';
import useVisualKeyboardHeight from '../../hooks/useVisualKeyboardHeight';
import useVisualViewportPin from '../../hooks/useVisualViewportPin';

const C = THEME;
const F = FONTS;

function fmtDeadline(str) {
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d)) return null;
  // 현재 시간과 마감시간 실시간 비교
  const diffMs = d - new Date();
  if (diffMs <= 0) return '마감됨';
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins  = Math.floor((totalSec % 3600) / 60);
  const secs  = totalSec % 60;
  if (days >= 1)  return `${days}일 ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')} 남음`;
  if (hours >= 1) return `곧 마감 · ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  return `곧 마감 · ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

const AI_TAB_LABEL = { disallowed: 'AI 비활성', conditional: 'AI 조건부', allowed: 'AI 활성' };

let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const DIVIDER_WIDTH = 22;
const MIN_RATIO = 0.28;
const MAX_RATIO = 0.72;
const DEFAULT_RATIO = 0.42;
const PANEL_MARGIN = 10;
const PANEL_INITIAL_WIDTH = Math.min(Math.max(Math.floor(SCREEN_WIDTH * 0.46), 360), 780);
const PANEL_INITIAL_HEIGHT = Math.floor(SCREEN_HEIGHT * 0.76);
const PANEL_MIN_WIDTH = 280;
const PANEL_MIN_HEIGHT = 200;
const PANEL_INITIAL_TOP = Platform.OS === 'ios' ? 90 : 76;
const PANEL_INITIAL_LEFT = Math.max(PANEL_MARGIN, SCREEN_WIDTH - PANEL_INITIAL_WIDTH - 14);

export default function WorkScreen({ navigation, route }) {
  const {
    assignment: initialAssignment,
    participation_id,
    step_id,
    stage: initialStage,
    assessment: initialAssessment,
    total_steps: initialTotalSteps,
  } = route.params || {};
  const isNewSystem = !!participation_id;
  const { user } = useAuth();
  const keyboardHeight = useVisualKeyboardHeight();

  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previousSubmissions, setPreviousSubmissions] = useState([]);
  const [currentStepId, setCurrentStepId] = useState(step_id);
  // 단계 탭 상태
  const [allStages, setAllStages] = useState([]);
  const [viewedStageOrder, setViewedStageOrder] = useState(null);
  // 제출/다음 단계 확인 모달
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  // 최종 제출 동의 모달
  const [consentOpen, setConsentOpen] = useState(false);
  // 결과 알림 모달 { title, body, btnLabel, onClose, tone: 'success'|'warn'|'error' }
  const [resultModal, setResultModal] = useState(null);

  const showResult = (title, body, tone = 'success', onClose = null, btnLabel = '확인') => {
    setResultModal({ title, body, tone, onClose, btnLabel });
  };
  const [splitRatio, setSplitRatio] = useState(DEFAULT_RATIO);
  const [aiUrl, setAiUrl] = useState(INAPP_BROWSER_HOME);
  const [addressDraft, setAddressDraft] = useState(INAPP_BROWSER_HOME);
  const [aiPageLoading, setAiPageLoading] = useState(true);
  const [canWebViewGoBack, setCanWebViewGoBack] = useState(false);
  const [canWebViewGoForward, setCanWebViewGoForward] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitAttemptCount, setExitAttemptCount] = useState(0);
  const [writingText, setWritingText] = useState('');
  const [writingSaveStatus, setWritingSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [showPreviousWritingsModal, setShowPreviousWritingsModal] = useState(false);
  const [isPreviousPanelMinimized, setIsPreviousPanelMinimized] = useState(false);
  const [selectedPreviousStage, setSelectedPreviousStage] = useState(null);
  const [panelPosition, setPanelPosition] = useState({
    x: PANEL_INITIAL_LEFT,
    y: PANEL_INITIAL_TOP,
  });
  const [panelSize, setPanelSize] = useState({
    width: PANEL_INITIAL_WIDTH,
    height: PANEL_INITIAL_HEIGHT,
  });
  /** 조건부 AI — 단계별 웹뷰 해제 여부 */
  const [browserUnlockedByStep, setBrowserUnlockedByStep] = useState({});

  const webViewRef          = useRef(null);
  const loadingTimerRef     = useRef(null);
  const splitRatioRef       = useRef(DEFAULT_RATIO);
  const panStartRatioRef    = useRef(DEFAULT_RATIO);
  const pageStartTimeRef    = useRef(Date.now());
  const visitedAtRef        = useRef(new Date().toISOString());
  const lastLoggedUrlRef    = useRef(null);
  const pendingAiLogIdRef   = useRef(null);
  const pendingAiResponseRef = useRef(null); // logId 도착 전에 응답이 먼저 온 경우 임시 보관
  const localAiLogsRef = useRef([]); // { localId, step_id, prompt, response, logged_at, complete_at }
  const localAiLogIdCounterRef = useRef(1);
  const localUrlLogsRef = useRef([]); // { step_id, url, search_query, visited_at, complete_at }
  /** 조건부 AI — 웹뷰 해제 시 작성 스냅샷 (제출 시 서버 저장) */
  const unlockSnapshotByStepRef = useRef({});
  const appStateRef         = useRef(AppState.currentState);
  const saveWritingTimerRef = useRef(null);
  const writingScrollRef = useRef(null);
  const writingInputRef = useRef(null);
  const writingDockRef = useRef(null);
  const leftColumnRef = useRef(null);
  const writingYRef = useRef(0);
  const writingActiveRef = useRef(false);
  const writingTextRef = useRef('');
  useVisualViewportPin(writingDockRef, leftColumnRef, {
    dockId: 'work-writing-dock',
    anchorId: 'work-left-column',
    isActiveRef: writingActiveRef,
  });
  const panelDragStartRef = useRef({ x: PANEL_INITIAL_LEFT, y: PANEL_INITIAL_TOP });
  const panelResizeStartRef = useRef({ width: PANEL_INITIAL_WIDTH, height: PANEL_INITIAL_HEIGHT });
  const miniDragStartRef = useRef({ x: PANEL_INITIAL_LEFT, y: PANEL_INITIAL_TOP });
  const miniMovedRef = useRef(false);
  const panelPositionRef = useRef({ x: PANEL_INITIAL_LEFT, y: PANEL_INITIAL_TOP });
  const panelSizeRef = useRef({ width: PANEL_INITIAL_WIDTH, height: PANEL_INITIAL_HEIGHT });
  writingTextRef.current = writingText;

  const scrollWritingIntoView = useCallback(() => {
    const delay = Platform.OS === 'ios' ? 320 : 200;
    setTimeout(() => {
      writingScrollRef.current?.scrollTo({
        y: Math.max(0, writingYRef.current - 8),
        animated: true,
      });
    }, delay);
  }, []);

  const dismissWritingKeyboard = useCallback(() => {
    writingActiveRef.current = false;
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    if (keyboardHeight <= 0) return undefined;
    scrollWritingIntoView();
    return undefined;
  }, [keyboardHeight, scrollWritingIntoView]);

  panelPositionRef.current = panelPosition;
  panelSizeRef.current = panelSize;

  const loadAssignment = async () => {
    try {
      if (isNewSystem) {
        // 참여 전체 데이터 fetch (단계 목록 포함)
        const res = await assessmentAPI.getParticipationDetail(participation_id);
        const steps = res.steps || [];
        const currentOrder = res.current_step || 1;

        // 단계 탭에 쓸 전체 단계 배열
        setAllStages(steps);
        setViewedStageOrder(currentOrder);

        // 현재 단계 step ID
        const currentStepObj = steps.find(s => s.step_order === currentOrder);
        setCurrentStepId(currentStepObj?.id || null);

        // WorkScreen 내부에서 쓸 assignment 객체 구성
        const allStagesNorm = steps.map(s => ({ ...s, order_num: s.step_order }));
        const syntheticAssignment = {
          id: res.assessment_id,
          title: res.title,
          subject: res.subject ?? null,
          deadline: res.deadline ?? null,
          studentProgress: { current_stage_order: currentOrder, status: res.status },
          stages: allStagesNorm,
          stageWritings: {},
        };
        setAssignment(syntheticAssignment);

        const curStage = allStagesNorm.find(s => s.order_num === currentOrder);
        if (stageIsUnrestrictedAiBrowser(curStage)) {
          setAiUrl(INAPP_BROWSER_HOME);
          setAddressDraft(INAPP_BROWSER_HOME);
        }

        // 이전 단계 제출 내용
        try {
          const subs = await assessmentAPI.getPreviousSubmissions(participation_id);
          setPreviousSubmissions(subs || []);
        } catch (e) {
          setPreviousSubmissions([]);
        }
      } else {
        // 구 시스템
        const data = await assignmentAPI.getDetail(initialAssignment.id);
        setAssignment(data);
        const stageOrder = data.studentProgress?.current_stage_order || 1;
        const stage = data.stages?.find(s => s.order_num === stageOrder);
        setAllStages((data.stages || []).map(s => ({ ...s, step_order: s.order_num })));
        setViewedStageOrder(stageOrder);
        if (stageIsUnrestrictedAiBrowser(stage)) {
          setAiUrl(INAPP_BROWSER_HOME);
          setAddressDraft(INAPP_BROWSER_HOME);
        }
      }
    } catch (err) {
      appAlert('오류', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadAssignment(); }, []));

  useEffect(() => {
    return () => {
      if (saveWritingTimerRef.current) clearTimeout(saveWritingTimerRef.current);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading || !assignment) return;
    const order = assignment.studentProgress?.current_stage_order || 1;
    const stage = assignment.stages?.find((s) => s.order_num === order);
    if (!stage) {
      setWritingText('');
      return;
    }
    const sw = assignment.stageWritings || {};
    const row = sw[stage.id] ?? sw[String(stage.id)];
    setWritingText(row?.content ?? '');
    setWritingSaveStatus('idle');
  }, [loading, assignment?.id, assignment?.studentProgress?.current_stage_order]);

  // 뒤로가기 차단
  useFocusEffect(useCallback(() => {
    const onBackPress = () => {
      if (canWebViewGoBack && webViewRef.current) {
        webViewRef.current.goBack();
      } else {
        handleExitAttempt('back_button');
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [canWebViewGoBack]));

  // 백그라운드 감지
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'active' && nextState === 'background') {
        handleExitAttempt('background');
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [assignment]);

  const handleExitAttempt = async (type) => {
    setExitAttemptCount(prev => prev + 1);
    setShowExitModal(true);
    try {
      await logAPI.recordExitAttempt({
        assignment_id: assignment?.id || initialAssignment?.id,
        attempt_type: type,
      });
    } catch (err) {}
  };

  // URL에서 검색어 추출 (Google, Naver, Bing, DuckDuckGo, Daum)
  const extractSearchQuery = (url) => {
    try {
      const u = new URL(url);
      if (/google\./i.test(u.hostname))        return u.searchParams.get('q');
      if (/naver\.com/i.test(u.hostname))      return u.searchParams.get('query') || u.searchParams.get('q');
      if (/bing\.com/i.test(u.hostname))       return u.searchParams.get('q');
      if (/duckduckgo\.com/i.test(u.hostname)) return u.searchParams.get('q');
      if (/yahoo\.com/i.test(u.hostname))      return u.searchParams.get('p') || u.searchParams.get('q');
      if (/daum\.net/i.test(u.hostname))       return u.searchParams.get('q');
    } catch (_) {}
    return null;
  };

  // ── URL 방문 로그: 수행평가 중에는 기기 메모리에만 저장 (동의 후 서버 전송) ──
  const bufferUrl = (url, visitedAt, completeAt) => {
    if (!participation_id || !url || !currentStepId) return;
    localUrlLogsRef.current.push({
      step_id: currentStepId,
      url,
      search_query: extractSearchQuery(url) || undefined,
      visited_at: visitedAt,
      complete_at: completeAt,
    });
  };

  const logUrl = async (url, visitedAt, completeAt) => {
    if (isNewSystem) {
      bufferUrl(url, visitedAt, completeAt);
      return;
    }
    if (!participation_id || !url || !currentStepId) return;
    try {
      await logAPI.recordUrl({
        participation_id,
        step_id: currentStepId,
        url,
        search_query: extractSearchQuery(url) || undefined,
        visited_at: visitedAt,
        complete_at: completeAt,
      });
    } catch (err) {
      console.log('URL 로그 실패:', err.message, err.detail || '');
    }
  };

  const uploadLocalUrlLogs = async () => {
    const logs = localUrlLogsRef.current.filter(log => log.url?.trim());
    if (logs.length === 0) return;
    await logAPI.recordUrlBulk({
      participation_id,
      logs: logs.map(({ step_id, url, search_query, visited_at, complete_at }) => ({
        step_id,
        url,
        search_query,
        visited_at,
        complete_at,
      })),
    });
    localUrlLogsRef.current = [];
  };

  // ── AI 로그: 수행평가 중에는 기기 메모리에만 저장 (동의 후 서버 전송) ──
  const flushAiLogsCompleteAt = (stepId, completeAt) => {
    if (!stepId || !completeAt) return;
    localAiLogsRef.current.forEach((log) => {
      if (log.step_id === stepId && !log.complete_at) {
        log.complete_at = completeAt;
      }
    });
  };

  const bufferAiPrompt = (prompt) => {
    if (!participation_id || !prompt || !currentStepId) return null;
    const localId = localAiLogIdCounterRef.current++;
    localAiLogsRef.current.push({
      localId,
      step_id: currentStepId,
      prompt: normalizeAiText(prompt),
      response: '',
      logged_at: new Date().toISOString(),
      complete_at: null,
    });
    return localId;
  };

  const bufferAiResponse = (localId, response) => {
    if (!localId || !response) return;
    const text = normalizeAiText(response);
    if (!text || isInvalidAiResponse(text)) return;
    const entry = localAiLogsRef.current.find(log => log.localId === localId);
    if (entry) entry.response = text;
  };

  const isInvalidAiResponse = (text) => {
    const t = text.trim();
    if (t.length < 10) return true;
    if (/^ChatGPT는 실수를 할 수 있습니다[\s\S]{0,40}재차 확인하세요\.?$/i.test(t)) return true;
    if (/^ChatGPT can make mistakes[\s\S]{0,40}important info\.?$/i.test(t)) return true;
    if (t.includes('ChatGPT는 실수를 할 수 있습니다') && t.length < 80) return true;
    if (t.includes('ChatGPT can make mistakes') && t.length < 80) return true;
    return false;
  };

  const uploadLocalAiLogs = async () => {
    const logs = localAiLogsRef.current.filter(log =>
      log.prompt?.trim() && log.response?.trim() && !isInvalidAiResponse(log.response)
    );
    if (logs.length === 0) return;
    await logAPI.recordAiBulk({
      participation_id,
      logs: logs.map(({ step_id, prompt, response, logged_at, complete_at }) => ({
        step_id,
        prompt,
        response: response || '',
        logged_at,
        complete_at,
      })),
    });
    localAiLogsRef.current = [];
    pendingAiLogIdRef.current = null;
    pendingAiResponseRef.current = null;
  };

  // ── 구 시스템: AI 프롬프트/응답 즉시 서버 저장 ───────────────────
  const logAiPrompt = async (prompt) => {
    if (!participation_id || !prompt || !currentStepId) return null;
    try {
      const result = await logAPI.recordAi({
        participation_id,
        step_id: currentStepId,
        prompt,
      });
      return result?.id || null;
    } catch (err) {
      console.log('AI 로그 실패:', err.message);
      return null;
    }
  };

  const updateAiResponse = async (logId, response) => {
    if (!logId || !response) return;
    try {
      await logAPI.updateAiResponse(logId, { response });
    } catch (err) {
      console.log('AI 응답 업데이트 실패:', err.message);
    }
  };

  // ── WebView → RN 메시지 수신 ─────────────────────────────────────
  const handleWebViewMessage = async (data) => {
    let msg;
    try { msg = typeof data === 'string' ? JSON.parse(data) : data; }
    catch (e) { return; }

    switch (msg.type) {
      case 'page_load': {
        // URL 로깅은 onNavigationStateChange 단독 처리 — 여기서는 방문 시각만 갱신
        if (msg.visited_at) {
          visitedAtRef.current = msg.visited_at;
        }
        break;
      }
      case 'ai_prompt': {
        console.log('[AI프롬프트] 수신:', msg.prompt?.slice(0, 30));
        const logId = isNewSystem
          ? bufferAiPrompt(msg.prompt)
          : await logAiPrompt(msg.prompt);
        console.log('[AI프롬프트] 저장 완료, logId:', logId);
        if (logId) {
          pendingAiLogIdRef.current = logId;
          webViewRef.current?.injectJavaScript(
            `window._setPendingAiLogId(${logId}); true;`
          );
          if (pendingAiResponseRef.current) {
            console.log('[AI프롬프트] 임시 보관된 응답 저장 시도:', pendingAiResponseRef.current?.length, '자');
            if (isNewSystem) {
              bufferAiResponse(logId, pendingAiResponseRef.current);
            } else {
              await updateAiResponse(logId, pendingAiResponseRef.current);
            }
            pendingAiResponseRef.current = null;
            pendingAiLogIdRef.current = null;
          }
        }
        break;
      }
      case 'ai_response': {
        const id = msg.log_id || pendingAiLogIdRef.current;
        console.log('[AI응답] log_id:', msg.log_id, 'pendingId:', pendingAiLogIdRef.current, 'response길이:', msg.response?.length);
        if (id) {
          if (isNewSystem) {
            bufferAiResponse(id, msg.response);
          } else {
            await updateAiResponse(id, msg.response);
          }
          pendingAiLogIdRef.current = null;
          pendingAiResponseRef.current = null;
        } else {
          pendingAiResponseRef.current = msg.response;
          console.log('[AI응답] logId 없음 — 임시 보관:', msg.response?.length, '자');
        }
        break;
      }
      default:
        break;
    }
  };

  const persistStageWriting = async (assignmentId, stageId, text) => {
    // 신규 시스템은 별도 저장 엔드포인트 미사용
    if (isNewSystem) {
      setWritingSaveStatus('saved');
      setTimeout(() => setWritingSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1600);
      return true;
    }
    if (!assignmentId || !stageId) return true;
    setWritingSaveStatus('saving');
    try {
      await assignmentAPI.saveStageWriting(assignmentId, stageId, text);
      setWritingSaveStatus('saved');
      setTimeout(() => setWritingSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1600);
      return true;
    } catch (err) {
      setWritingSaveStatus('error');
      appAlert('저장 실패', err.message || '작성 내용을 저장하지 못했습니다.', null, { type: 'error' });
      return false;
    }
  };

  const scheduleSaveWriting = (assignmentId, stageId) => {
    if (saveWritingTimerRef.current) clearTimeout(saveWritingTimerRef.current);
    saveWritingTimerRef.current = setTimeout(() => {
      saveWritingTimerRef.current = null;
      persistStageWriting(assignmentId, stageId, writingTextRef.current);
    }, 900);
  };

  const handleAdvanceStage = async (consentGiven = false) => {
    if (!assignment) return;

    if (!writingTextRef.current || !writingTextRef.current.trim()) {
      showResult(
        VALIDATION.workContent,
        '이 단계의 내용을 작성한 후 다음 단계로 이동할 수 있습니다.',
        'warn'
      );
      return;
    }

    if (isNewSystem) {
      const stepCompleteAt = new Date().toISOString();
      // 마지막으로 열려있던 URL 기록 flush (complete_at = 단계 완료 시각)
      if (lastLoggedUrlRef.current && visitedAtRef.current) {
        logUrl(lastLoggedUrlRef.current, visitedAtRef.current, stepCompleteAt);
        lastLoggedUrlRef.current = null;
      }
      // 현재 단계 AI 로그에 complete_at 기록
      flushAiLogsCompleteAt(currentStepId, stepCompleteAt);
      // 작성 내용 저장 타이머 flush
      if (saveWritingTimerRef.current) {
        clearTimeout(saveWritingTimerRef.current);
        saveWritingTimerRef.current = null;
      }
      try {
        if (consentGiven) {
          await uploadLocalAiLogs();
          await uploadLocalUrlLogs();
        }

        const currentOrder = assignment?.studentProgress?.current_stage_order || 1;
        const totalStageCount = allStages.length || assignment?.stages?.length || 0;
        const isFinalStepSubmit = currentOrder >= totalStageCount;
        const stepUnlockSnapshots = isFinalStepSubmit
          ? Object.entries(unlockSnapshotByStepRef.current)
              .map(([snapStepId, snap]) => ({
                step_id: Number(snapStepId),
                content_at_unlock: snap.content_at_unlock,
                browser_unlocked_at: snap.browser_unlocked_at,
              }))
              .filter(
                (snap) =>
                  Number.isFinite(snap.step_id) &&
                  typeof snap.content_at_unlock === 'string' &&
                  snap.content_at_unlock.trim()
              )
          : [];
        const result = await assessmentAPI.submitStep(participation_id, {
          step_id: currentStepId || null,
          content: writingTextRef.current,
          consent_given: consentGiven,
          ...(stepUnlockSnapshots.length ? { step_unlock_snapshots: stepUnlockSnapshots } : {}),
        });

        if (result.status === 'submitted') {
          showResult(
            '수행평가 완료!',
            '모든 단계를 완료하여 제출되었습니다.\n수고하셨습니다!',
            'success',
            () => navigation.popToTop(),
            '홈으로'
          );
        } else {
          const nextStage = result.next_step_info;
          const syntheticStage = nextStage ? { ...nextStage, order_num: nextStage.step_order } : null;
          setAssignment(prev => {
            // 기존 stages 배열의 총 길이(totalStages)를 유지하면서 현재 단계만 교체
            const updatedStages = (prev.stages || []).map(stg =>
              syntheticStage && stg.order_num === syntheticStage.order_num
                ? syntheticStage
                : stg
            );
            return {
              ...prev,
              studentProgress: {
                current_stage_order: result.next_step,
                status: 'in_progress',
              },
              stages: updatedStages.length > 0 ? updatedStages : prev.stages,
              stageWritings: {},
            };
          });
          setWritingText('');

          // 현재 단계 ID 및 탭 상태 갱신
          if (result.next_step_info?.id) {
            setCurrentStepId(result.next_step_info.id);
          }
          if (result.next_step) {
            setViewedStageOrder(result.next_step);
          }
          try {
            const subs = await assessmentAPI.getPreviousSubmissions(participation_id);
            setPreviousSubmissions(subs || []);
          } catch (e) {}

          showResult(
            '단계 완료',
            result.message || `${result.next_step}단계로 이동했습니다.`,
            'success'
          );
        }
      } catch (err) {
        showResult('오류', err.message || '알 수 없는 오류가 발생했습니다.', 'error');
      }
      return;
  }

  const order = assignment.studentProgress?.current_stage_order || 1;
    const stage = assignment.stages?.find((s) => s.order_num === order);
    if (stage) {
      if (saveWritingTimerRef.current) {
        clearTimeout(saveWritingTimerRef.current);
        saveWritingTimerRef.current = null;
      }
      const saved = await persistStageWriting(assignment.id, stage.id, writingTextRef.current);
      if (!saved) return;
    }
    try {
      const result = await assignmentAPI.updateProgress(assignment.id, {
        next_stage_order: order + 1,
      });
      if (result.status === 'completed') {
        showResult(
          '수행평가 완료!',
          '모든 단계를 완료했습니다.\n수고하셨습니다!',
          'success',
          () => navigation.popToTop(),
          '홈으로'
        );
      } else {
        loadAssignment();
      }
    } catch (err) {
      showResult('오류', err.message || '알 수 없는 오류가 발생했습니다.', 'error');
    }
  };

  // 드래그 핸들 (분할선 이동)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartRatioRef.current = splitRatioRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const availableWidth = SCREEN_WIDTH - DIVIDER_WIDTH;
        const delta = gestureState.dx / availableWidth;
        const newRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, panStartRatioRef.current + delta));
        splitRatioRef.current = newRatio;
        setSplitRatio(newRatio);
      },
    })
  ).current;

  const panelPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panelDragStartRef.current = panelPositionRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const nextX = panelDragStartRef.current.x + gestureState.dx;
        const nextY = panelDragStartRef.current.y + gestureState.dy;
        setPanelPosition({ x: nextX, y: nextY });
      },
    })
  ).current;

  const panelResizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panelResizeStartRef.current = panelSizeRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const nextWidth = Math.max(PANEL_MIN_WIDTH, panelResizeStartRef.current.width + gestureState.dx);
        const nextHeight = Math.max(PANEL_MIN_HEIGHT, panelResizeStartRef.current.height + gestureState.dy);
        setPanelSize({ width: nextWidth, height: nextHeight });
      },
    })
  ).current;

  const miniPanelResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        miniDragStartRef.current = panelPositionRef.current;
        miniMovedRef.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2) {
          miniMovedRef.current = true;
        }
        const nextX = miniDragStartRef.current.x + gestureState.dx;
        const nextY = miniDragStartRef.current.y + gestureState.dy;
        setPanelPosition({ x: nextX, y: nextY });
      },
      onPanResponderRelease: () => {
        if (!miniMovedRef.current) {
          setIsPreviousPanelMinimized(false);
        }
      },
    })
  ).current;

  // ── 마감 카운트다운 — 매초 현재 시간 기준으로 재계산 ─────────────────────
  const [deadlineLabel, setDeadlineLabel] = useState(() => fmtDeadline(assignment?.deadline));
  useEffect(() => {
    // 마감시간 없으면 초기화만
    if (!assignment?.deadline) { setDeadlineLabel(null); return; }
    // 즉시 한 번 계산
    setDeadlineLabel(fmtDeadline(assignment.deadline));
    // 1초마다 현재 시간 vs 마감시간 비교 갱신
    const id = setInterval(() => {
      setDeadlineLabel(fmtDeadline(assignment.deadline));
    }, 1000);
    return () => clearInterval(id);
  }, [assignment?.deadline]);
  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  const currentStageOrder = assignment?.studentProgress?.current_stage_order || 1;
  const totalStages = allStages.length || assignment?.stages?.length || 0;
  const viewOrder = viewedStageOrder ?? currentStageOrder;
  const currentStage = assignment?.stages?.find(s => s.order_num === currentStageOrder);
  const viewedStage = assignment?.stages?.find(s => s.order_num === viewOrder) || currentStage;
  const isCompleted = assignment?.studentProgress?.status === 'completed' || assignment?.studentProgress?.status === 'submitted';
  const isCurrentStageView = viewOrder === currentStageOrder && !isCompleted;
  const stepBrowserUnlocked = !!(currentStepId && browserUnlockedByStep[currentStepId]);
  const showWebViewPanel = isCurrentStageView && (
    stageIsUnrestrictedAiBrowser(viewedStage)
    || (stageIsConditionalAi(viewedStage) && stepBrowserUnlocked)
  );
  const isConditionalLocked = isCurrentStageView && stageIsConditionalAi(viewedStage) && !stepBrowserUnlocked;
  const conditionalUnlockSnap = currentStepId
    ? unlockSnapshotByStepRef.current[currentStepId]
    : null;
  const showConditionalWritingSplit =
    isCurrentStageView &&
    stageIsConditionalAi(viewedStage) &&
    stepBrowserUnlocked &&
    !!conditionalUnlockSnap?.content_at_unlock?.trim();
  const lockedWritingPrefix = showConditionalWritingSplit
    ? conditionalUnlockSnap.content_at_unlock
    : '';
  const unlockedWritingSuffix = showConditionalWritingSplit
    ? (writingText.startsWith(lockedWritingPrefix)
        ? writingText.slice(lockedWritingPrefix.length)
        : '')
    : writingText;
  const isViewingPast = viewOrder < currentStageOrder;
  const isViewingFuture = viewOrder > currentStageOrder && !isCompleted;
  const previousStageWritings = isNewSystem
    ? previousSubmissions
        .filter((s) => Number(s.step_id) !== Number(currentStepId))
        .map((s) => ({
          key: String(s.id),           // submission 고유 id
          stageId: s.step_id,
          orderNum: s.step_order || 0,
          title: s.step_title || `${s.step_order || '?'}단계`,
          content: s.content || '',
        }))
        .filter((item) => item.content.trim().length > 0)
    : (assignment?.stages || [])
        .filter((stage) => stage.order_num < currentStageOrder)
        .sort((a, b) => a.order_num - b.order_num)
        .map((stage) => {
          const sw = assignment?.stageWritings || {};
          const row = sw[stage.id] ?? sw[String(stage.id)];
          return {
            stageId: stage.id,
            orderNum: stage.order_num,
            title: stage.title,
            content: row?.content ?? '',
          };
        })
        .filter((item) => item.content.trim().length > 0);

  const handleUnlockBrowser = () => {
    if (!currentStepId || !stageIsConditionalAi(viewedStage)) return;
    appAlert(
      '웹뷰 열기',
      '지금까지 작성한 내용은 「독립 사고」 구간으로 기록됩니다.\n이후 AI·웹 검색을 사용할 수 있습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '웹뷰 열기',
          onPress: () => {
            const snapshot = writingTextRef.current ?? '';
            const unlockedAt = new Date().toISOString();
            unlockSnapshotByStepRef.current[currentStepId] = {
              content_at_unlock: snapshot,
              browser_unlocked_at: unlockedAt,
            };
            setBrowserUnlockedByStep((prev) => ({ ...prev, [currentStepId]: true }));
            setAiUrl(INAPP_BROWSER_HOME);
            setAddressDraft(INAPP_BROWSER_HOME);
            lastLoggedUrlRef.current = null;
            pageStartTimeRef.current = Date.now();
            visitedAtRef.current = unlockedAt;
            Keyboard.dismiss();
            setTimeout(() => writingInputRef.current?.focus(), 120);
          },
        },
      ]
    );
  };

  const handleWritingChange = (text) => {
    setWritingText(text);
    if (assignment && currentStage) {
      scheduleSaveWriting(assignment.id, currentStage.id);
    }
  };

  const navigateFromAddressBar = () => {
    const raw = addressDraft.trim();
    if (!raw) return;
    const u = /^https?:\/\//i.test(raw)
      ? raw
      : `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
    Keyboard.dismiss();
    setAiUrl(u);
    setAddressDraft(u);
    setAiPageLoading(true);
    lastLoggedUrlRef.current = null;
    pageStartTimeRef.current = Date.now();
  };

  return (
    <AppShell
      navigation={navigation}
      currentScreen="home"
      guardAssessmentExit={!isCompleted}
      onAssessmentExitAttempt={handleExitAttempt}
    >
    <View style={styles.container}>
      <ExitWarningModal
        visible={showExitModal}
        onClose={() => setShowExitModal(false)}
        attemptCount={exitAttemptCount}
      />

      {/* ── 제출/다음 단계 확인 모달 (ConfirmDialog 스타일) ── */}
      <Modal
        visible={submitConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSubmitConfirmOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          style={scm.overlay}
          onPress={() => setSubmitConfirmOpen(false)}
        >
          <Pressable style={scm.card} onPress={() => {}}>
            <Text style={scm.title}>
              {currentStageOrder === totalStages ? '수행평가 완료' : '다음 단계로 이동'}
            </Text>
            <Text style={scm.body}>
              {currentStageOrder === totalStages
                ? '이 수행평가를 최종 제출하시겠습니까?\n제출 후에는 내용을 수정할 수 없습니다.'
                : '현재 단계를 완료하고 다음 단계로 이동하시겠습니까?'}
            </Text>
            <View style={scm.btnRow}>
              <Pressable
                style={[scm.btn, scm.btnCancel]}
                onPress={() => setSubmitConfirmOpen(false)}
              >
                <Text style={scm.btnCancelText}>취소</Text>
              </Pressable>
              <Pressable
                style={[scm.btn, scm.btnConfirm]}
                onPress={() => {
                  setSubmitConfirmOpen(false);
                  if (currentStageOrder === totalStages) {
                    setConsentOpen(true);
                  } else {
                    handleAdvanceStage(false);
                  }
                }}
              >
                <Text style={scm.btnConfirmText}>
                  {currentStageOrder === totalStages ? '제출하기' : '다음 단계'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 최종 제출 동의 모달 ── */}
      <Modal
        visible={consentOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConsentOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={scm.overlay} onPress={() => setConsentOpen(false)}>
          <Pressable style={scm.card} onPress={() => {}}>
            <Text style={scm.title}>개인정보 수집 동의</Text>
            <Text style={scm.body}>
              {'학생이 작성한 수행평가 내용, AI 프롬프트·응답, 방문 URL 기록은 선생님께 전달될 수 있습니다.\n\n동의하시겠습니까?'}
            </Text>
            <View style={scm.btnRow}>
              <Pressable
                style={[scm.btn, scm.btnCancel]}
                onPress={() => setConsentOpen(false)}
              >
                <Text style={scm.btnCancelText}>미동의</Text>
              </Pressable>
              <Pressable
                style={[scm.btn, scm.btnConfirm]}
                onPress={() => {
                  setConsentOpen(false);
                  handleAdvanceStage(true);
                }}
              >
                <Text style={scm.btnConfirmText}>동의</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 결과 알림 모달 (단계 완료 / 수행평가 완료 / 경고 / 오류) ── */}
      {resultModal && (
        <Modal
          visible={!!resultModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            const cb = resultModal.onClose;
            setResultModal(null);
            cb?.();
          }}
          statusBarTranslucent
        >
          <Pressable
            style={scm.overlay}
            onPress={() => {
              const cb = resultModal.onClose;
              setResultModal(null);
              cb?.();
            }}
          >
            <Pressable style={scm.card} onPress={() => {}}>
              <Text style={scm.title}>{resultModal.title}</Text>
              <Text style={scm.body}>{resultModal.body}</Text>
              <View style={scm.btnRow}>
                <Pressable
                  style={[scm.btn, scm.btnConfirm]}
                  onPress={() => {
                    const cb = resultModal.onClose;
                    setResultModal(null);
                    cb?.();
                  }}
                >
                  <Text style={scm.btnConfirmText}>{resultModal.btnLabel}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── 왼쪽 작업열 + 오른쪽 브라우저 — 작성창만 visualViewport/키보드 높이만큼 위로 ── */}
      <View style={[styles.bodyRow, showWebViewPanel && styles.splitContainer]}>
        <KeyboardAvoidingView
          ref={leftColumnRef}
          nativeID="work-left-column"
          style={[
            styles.leftWorkColumn,
            { flex: showWebViewPanel ? splitRatio : 1 },
          ]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={Platform.OS !== 'web'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
        <View style={styles.leftWorkInner}>
      {/* ── 헤더 (expo/AssessmentScreen.tsx 디자인 파일 1:1) ── */}
      <Pressable style={[nh.wrap, styles.headerNoShrink]} onPress={dismissWritingKeyboard}>
        {/* 상단 행: 뒤로가기 | 메타+제목 | 마감배지 | 눈 | 제출 */}
        <View style={nh.topRow}>
          <Pressable
            style={({ pressed }) => [nh.backBtn, pressed && { opacity: 0.6 }]}
            onPress={() => handleExitAttempt('back_button')}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={16} color={C.textSoft} />
          </Pressable>

          <View style={nh.titleWrap}>
            {assignment?.subject ? (
              <Text style={nh.meta} numberOfLines={1} ellipsizeMode="tail">
                {assignment.subject}
              </Text>
            ) : null}
            <Text style={nh.title} numberOfLines={1} ellipsizeMode="tail">
              {assignment?.title}
            </Text>
          </View>

          <View style={nh.actions}>
            {deadlineLabel && (
              <View style={nh.deadlineBadge}>
                <Text style={nh.deadlineText}>{deadlineLabel}</Text>
              </View>
            )}
            {isConditionalLocked && (
              <Pressable
                style={({ pressed }) => [nh.webviewBtn, pressed && { opacity: 0.75 }]}
                onPress={handleUnlockBrowser}
              >
                <Ionicons name="globe-outline" size={14} color={C.primary} />
                <Text style={nh.webviewBtnText}>웹뷰 보기</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [nh.submitBtn, (pressed || isCompleted) && { opacity: 0.7 }]}
              onPress={() => setSubmitConfirmOpen(true)}
              disabled={isCompleted || viewOrder !== currentStageOrder}
            >
              <Ionicons name="checkmark" size={14} color="#fff" />
              <Text style={nh.submitBtnText}>
                {isCompleted ? '완료됨' : '제출'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Stepper: 단계 탭 row — 디자인 파일과 동일 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={nh.tabsRow}
        >
          {allStages.map((stage) => {
            const order = stage.step_order || stage.order_num || 0;
            const isViewed = order === viewOrder;
            const isDone = (order < currentStageOrder) || (isCompleted && order <= currentStageOrder);
            const aiMode = stage.ai_mode ?? (stage.ai_permission === 'denied' ? 'disallowed' : stage.ai_permission ?? 'disallowed');
            return (
              <Pressable
                key={stage.id ?? order}
                style={[nh.tab, isViewed && nh.tabActive]}
                onPress={() => {
                  dismissWritingKeyboard();
                  setViewedStageOrder(order);
                }}
              >
                {/* 숫자/체크 배지 */}
                <View style={[
                  nh.tabBadge,
                  isViewed && nh.tabBadgeActive,
                  isDone && !isViewed && nh.tabBadgeDone,
                ]}>
                  {isDone && !isViewed
                    ? <Ionicons name="checkmark" size={12} color="#fff" />
                    : <Text style={[nh.tabBadgeNum, isViewed && nh.tabBadgeNumActive]}>
                        {String(order).padStart(2, '0')}
                      </Text>
                  }
                </View>
                {/* 제목 + AI 모드 */}
                <View style={nh.tabInfo}>
                  <Text
                    style={[nh.tabTitle, isViewed && nh.tabTitleActive]}
                    numberOfLines={1}
                  >
                    {stage.title}
                  </Text>
                  <Text style={[nh.tabAiLabel, isViewed && nh.tabAiLabelActive]}>
                    {AI_TAB_LABEL[aiMode] ?? aiMode}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Pressable>

      {/* ── 과거 단계 읽기 전용 뷰 ── */}
      {isViewingPast && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          style={{ flex: 1, backgroundColor: C.background }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Pressable onPress={dismissWritingKeyboard} style={{ flexGrow: 1, gap: 12 }}>
          {(() => {
            const sub = previousSubmissions.find(s => (s.step_order || 0) === viewOrder);
            return sub ? (
              <>
                <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ fontFamily: F.sansMedium, fontSize: 12, color: C.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {viewOrder}단계 · {viewedStage?.title} — 제출 완료 (읽기 전용)
                  </Text>
                  <Text style={{ fontFamily: F.sans, fontSize: 14.5, color: C.text, lineHeight: 22 }}>{sub.content}</Text>
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.textSecondary }}>이 단계의 제출 내용을 불러올 수 없습니다.</Text>
              </View>
            );
          })()}
          </Pressable>
        </ScrollView>
      )}

      {/* ── 미래 단계 잠김 ── */}
      {isViewingFuture && (
        <Pressable
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.background }}
          onPress={dismissWritingKeyboard}
        >
          <Ionicons name="lock-closed-outline" size={36} color={C.textSecondary} style={{ marginBottom: 12 }} />
          <Text style={{ fontFamily: F.sansSemi, fontSize: 15, color: C.text, marginBottom: 6 }}>아직 잠긴 단계입니다</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.textSecondary, textAlign: 'center' }}>
            이전 단계를 완료해야 진행할 수 있습니다.
          </Text>
        </Pressable>
      )}

      {/* ── 현재 단계 작업 영역 (수행 내용 → 작성 공간 순서, 키보드 시 위로 이동) ── */}
      {!isViewingPast && !isViewingFuture && (
          <View style={styles.taskBody}>
            <ScrollView
              ref={writingScrollRef}
              style={styles.taskScrollView}
              contentContainerStyle={[
                styles.taskScroll,
                Platform.OS !== 'web' && keyboardHeight > 0 && {
                  paddingBottom: keyboardHeight + 24,
                },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
            <Pressable onPress={dismissWritingKeyboard} style={styles.taskScrollInner}>
            {currentStage?.description ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxLabel}>📋 수행 내용</Text>
                <Text style={styles.infoBoxText}>{currentStage.description}</Text>
              </View>
            ) : (
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>이 단계의 수행평가를 진행할 수 있습니다.</Text>
              </View>
            )}

            {currentStage?.ai_guidance ? (
              <View style={[styles.infoBox, styles.guidanceBox]}>
                <Text style={styles.infoBoxLabel}>📌 AI 활용 지침</Text>
                <Text style={styles.infoBoxText}>{currentStage.ai_guidance}</Text>
              </View>
            ) : null}

            {/* 작성 공간 — 평소엔 수행 내용 바로 아래, 키보드 시에만 위로 고정 */}
            <View
              ref={writingDockRef}
              nativeID="work-writing-dock"
              onLayout={(e) => { writingYRef.current = e.nativeEvent.layout.y; }}
            >
            <View style={styles.writingBox}>
              <View style={styles.writingHeader}>
                <Text style={styles.infoBoxLabel}>✏️ 작성 공간</Text>
              </View>
              <Text style={styles.writingHint}>
                {showConditionalWritingSplit
                  ? '웹뷰 열기 이전 내용은 수정할 수 없습니다. 구분선 아래에서 이어서 작성하세요.'
                  : '단계마다 내용이 따로 저장됩니다. 다음 단계로 넘어가기 전에 자동으로 한 번 더 저장됩니다.'}
              </Text>
              {showConditionalWritingSplit ? (
                <>
                  <Text style={styles.lockedWritingText}>{lockedWritingPrefix}</Text>
                  <ConditionalUnlockDivider unlockedAt={conditionalUnlockSnap.browser_unlocked_at} />
                  <TextInput
                    ref={writingInputRef}
                    style={styles.writingInput}
                    multiline
                    textAlignVertical="top"
                    placeholder="AI·웹 검색 후 이어서 작성할 내용"
                    placeholderTextColor={THEME.textSecondary}
                    value={unlockedWritingSuffix}
                    editable={!isCompleted}
                    showSoftInputOnFocus
                    {...(Platform.OS === 'web' ? { inputMode: 'text' } : {})}
                    onFocus={() => {
                      writingActiveRef.current = true;
                      scrollWritingIntoView();
                    }}
                    onChangeText={(t) => handleWritingChange(lockedWritingPrefix + t)}
                    onBlur={() => {
                      writingActiveRef.current = false;
                      if (!assignment || !currentStage) return;
                      if (saveWritingTimerRef.current) {
                        clearTimeout(saveWritingTimerRef.current);
                        saveWritingTimerRef.current = null;
                      }
                      persistStageWriting(assignment.id, currentStage.id, writingTextRef.current);
                    }}
                  />
                </>
              ) : (
                <TextInput
                  ref={writingInputRef}
                  style={styles.writingInput}
                  multiline
                  textAlignVertical="top"
                  placeholder="조사·정리·성찰 등 작성할 내용"
                  placeholderTextColor={THEME.textSecondary}
                  value={writingText}
                  editable={!isCompleted}
                  showSoftInputOnFocus
                  {...(Platform.OS === 'web' ? { inputMode: 'text' } : {})}
                  onFocus={() => {
                    writingActiveRef.current = true;
                    scrollWritingIntoView();
                  }}
                  onChangeText={handleWritingChange}
                  onBlur={() => {
                    writingActiveRef.current = false;
                    if (!assignment || !currentStage) return;
                    if (saveWritingTimerRef.current) {
                      clearTimeout(saveWritingTimerRef.current);
                      saveWritingTimerRef.current = null;
                    }
                    persistStageWriting(assignment.id, currentStage.id, writingTextRef.current);
                  }}
                />
              )}
            </View>
            </View>

            {isConditionalLocked && (
              <View style={[styles.infoBox, styles.conditionalAiBox]}>
                <Text style={styles.conditionalAiIcon}>📋</Text>
                <Text style={styles.conditionalAiTitle}>AI·웹 조건부 단계</Text>
                <Text style={styles.conditionalAiDesc}>
                  먼저 스스로 생각하며 작성하세요.{'\n'}
                  준비가 되면 상단 「웹뷰 보기」를 눌러 AI·웹 검색을 시작할 수 있습니다.
                </Text>
              </View>
            )}

            {isCurrentStageView && !stageAllowsAiBrowser(viewedStage) && (
              <View style={[styles.infoBox, styles.noAiBox]}>
                <Text style={styles.noAiIcon}>🚫</Text>
                <Text style={styles.noAiTitle}>AI 사용 제한 단계</Text>
                <Text style={styles.noAiDesc}>교사가 이 단계의 AI 사용을 허용하지 않았습니다.</Text>
              </View>
            )}

            {isCompleted && (
              <View style={styles.completedBox}>
                <Text style={styles.completedText}>🎉 모든 단계 완료!</Text>
              </View>
            )}
            </Pressable>
            </ScrollView>
          </View>
      )}{/* end 현재 단계 작업 영역 */}

        </View>
        </KeyboardAvoidingView>

        {/* ── 분할선 + AI 브라우저 패널 (허용·조건부 해제 후 표시) ── */}
        {showWebViewPanel && (
          <>
            <View style={styles.divider} {...panResponder.panHandlers}>
              <View style={styles.dividerHandle} />
              <Text style={styles.dividerHint}>좌우 드래그</Text>
            </View>

            <View style={[styles.browserPanel, { flex: 1 - splitRatio }]}>
              {Platform.OS === 'web' ? (
                <View style={styles.webFallback}>
                  <Text style={styles.webFallbackTitle}>📱 인앱 브라우저</Text>
                  <Text style={styles.webFallbackDesc}>
                    WebView는 모바일 앱(Expo Go)에서만 동작합니다.{'\n'}
                    웹에서는 검색만 외부 브라우저로 열 수 있습니다.
                  </Text>
                  <TouchableOpacity
                    style={styles.webFallbackBtn}
                    onPress={() => Linking.openURL('https://www.google.com')}
                  >
                    <Text style={styles.webFallbackBtnText}>Google 검색 열기 ↗</Text>
                  </TouchableOpacity>
                </View>
              ) : WebView ? (
                <>
                  <View style={styles.browserUrlBar}>
                    {/* 뒤로 */}
                    <TouchableOpacity
                      style={[styles.browserNavBtn, !canWebViewGoBack && styles.browserNavBtnDisabled]}
                      onPress={() => canWebViewGoBack && webViewRef.current?.goBack()}
                      activeOpacity={canWebViewGoBack ? 0.7 : 1}
                    >
                      <Text style={styles.browserNavBtnText}>‹</Text>
                    </TouchableOpacity>
                    {/* 앞으로 */}
                    <TouchableOpacity
                      style={[styles.browserNavBtn, !canWebViewGoForward && styles.browserNavBtnDisabled]}
                      onPress={() => canWebViewGoForward && webViewRef.current?.goForward()}
                      activeOpacity={canWebViewGoForward ? 0.7 : 1}
                    >
                      <Text style={styles.browserNavBtnText}>›</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.browserUrlInput}
                      value={addressDraft}
                      onChangeText={setAddressDraft}
                      onSubmitEditing={navigateFromAddressBar}
                      placeholder="검색어 (https://… 직접 입력 가능)"
                      placeholderTextColor="#666"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      returnKeyType="go"
                    />
                    {/* 새로고침 */}
                    <TouchableOpacity
                      style={styles.browserNavBtn}
                      onPress={() => webViewRef.current?.reload()}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.browserNavBtnText}>↺</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.browserUrlGo} onPress={navigateFromAddressBar}>
                      <Text style={styles.browserUrlGoText}>검색</Text>
                    </TouchableOpacity>
                  </View>
                  <WebView
                    ref={webViewRef}
                    source={{ uri: aiUrl }}
                    style={styles.webView}
                    onLoadStart={() => {
                      setAiPageLoading(true);
                      // 최대 6초 후 강제 해제 (캐시 복원 등 onLoadEnd 미발화 대비)
                      clearTimeout(loadingTimerRef.current);
                      loadingTimerRef.current = setTimeout(() => {
                        setAiPageLoading(false);
                      }, 6000);
                    }}
                    onLoadEnd={() => {
                      clearTimeout(loadingTimerRef.current);
                      setAiPageLoading(false);
                    }}
                    onNavigationStateChange={(state) => {
                      setCanWebViewGoBack(state.canGoBack);
                      setCanWebViewGoForward(state.canGoForward);

                      // 로딩 완료 처리 — onLoadEnd 미발화 시 여기서 확실히 해제
                      if (!state.loading) {
                        clearTimeout(loadingTimerRef.current);
                        setAiPageLoading(false);
                      }

                      const newUrl = state.url;

                      // 로딩 중이거나 중간 리다이렉트 URL은 기록하지 않음
                      // state.loading === true 인 동안은 최종 URL이 아닐 수 있음
                      if (state.loading) return;

                      // 의미 없는 중간 URL 필터 (인증 리다이렉트, 빈 URL 등)
                      const isSkipUrl = (u) => {
                        if (!u) return true;
                        if (u === 'about:blank') return true;
                        // 인증/OAuth 중간 단계 URL — 최종 목적지가 아님
                        if (/\/auth\/|\/oauth\/|\/sso\/|\/login\?|\/callback\?/.test(u)) return true;
                        return false;
                      };

                      if (
                        !isSkipUrl(newUrl) &&
                        newUrl !== lastLoggedUrlRef.current
                      ) {
                        // 이전 URL 체류 완료 로그
                        if (lastLoggedUrlRef.current) {
                          logUrl(
                            lastLoggedUrlRef.current,
                            visitedAtRef.current,
                            new Date().toISOString()
                          );
                        }
                        // 새 URL 추적 시작
                        lastLoggedUrlRef.current = newUrl;
                        visitedAtRef.current     = new Date().toISOString();
                        pageStartTimeRef.current = Date.now();
                        setAddressDraft(newUrl);
                      }
                    }}
                    onShouldStartLoadWithRequest={(req) => {
                      const url = req.url;
                      if (/^https?:\/\//i.test(url) || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) {
                        return true;
                      }
                      if (/^(mailto|tel|sms):/i.test(url)) {
                        Linking.openURL(url).catch(() => {});
                        return false;
                      }
                      return true;
                    }}
                    injectedJavaScript={WEBVIEW_LOG_SCRIPT}
                    onMessage={(e) => handleWebViewMessage(e.nativeEvent.data)}
                    javaScriptEnabled
                    domStorageEnabled
                    userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                  />
                  {aiPageLoading && (
                    <View style={styles.aiLoadingOverlay}>
                      <ActivityIndicator size="large" color={THEME.primary} />
                      <Text style={styles.aiLoadingText}>페이지 불러오는 중...</Text>
                    </View>
                  )}
                </>
              ) : null}
            </View>
          </>
        )}
      </View>{/* end bodyRow */}

      {showPreviousWritingsModal && (
        <View pointerEvents="box-none" style={styles.floatingPanelHost}>
          {isPreviousPanelMinimized ? (
            <View
              style={[styles.floatingMiniToggle, { left: panelPosition.x, top: panelPosition.y }]}
              {...miniPanelResponder.panHandlers}
            >
              <Text style={styles.floatingMiniText}>이전</Text>
            </View>
          ) : (
            <View style={[styles.floatingPanel, { left: panelPosition.x, top: panelPosition.y, width: panelSize.width, height: panelSize.height }]}>
              <View style={styles.floatingPanelHeader} {...panelPanResponder.panHandlers}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>이전 단계 작성 내용</Text>
                  <Text style={styles.modalSubTitle}>읽기 전용 · 헤더 드래그로 이동</Text>
                </View>
                <View style={styles.floatingHeaderActions}>
                  <TouchableOpacity
                    style={styles.floatingMinBtn}
                    onPress={() => setIsPreviousPanelMinimized(true)}
                  >
                    <Text style={styles.floatingMinText}>—</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.floatingCloseBtn}
                    onPress={() => {
                      setShowPreviousWritingsModal(false);
                      setIsPreviousPanelMinimized(false);
                      setSelectedPreviousStage(null);
                    }}
                  >
                    <Text style={styles.floatingCloseText}>X</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                {previousStageWritings.length === 0 ? (
                  <Text style={styles.modalEmpty}>이전 단계가 없거나 저장된 작성 내용이 없습니다.</Text>
                ) : selectedPreviousStage ? (
                  <View style={styles.prevDetailWrap}>
                    <TouchableOpacity
                      style={styles.prevBackBtn}
                      onPress={() => setSelectedPreviousStage(null)}
                    >
                      <Text style={styles.prevBackBtnText}>← 전체 목록 보기</Text>
                    </TouchableOpacity>
                    <View style={styles.prevItemBox}>
                      <Text style={styles.prevItemTitle}>
                        단계 {selectedPreviousStage.orderNum}. {selectedPreviousStage.title}
                      </Text>
                      <Text style={styles.prevItemContent}>{selectedPreviousStage.content}</Text>
                    </View>
                  </View>
                ) : (
                  previousStageWritings.map((item) => (
                    <TouchableOpacity
                      key={item.key || String(item.stageId)}
                      style={styles.prevPreviewItem}
                      onPress={() => setSelectedPreviousStage(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.prevItemTitle}>단계 {item.orderNum}. {item.title}</Text>
                      <Text style={styles.prevPreviewContent} numberOfLines={1} ellipsizeMode="tail">
                        {item.content}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <View style={styles.resizeHandleWrap} {...panelResizeResponder.panHandlers}>
                <View style={styles.resizeHandleInner} />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
    </AppShell>
  );
}

// ── 헤더 스타일 (expo/AssessmentScreen.tsx 디자인 파일 1:1) ──────────────────
const nh = StyleSheet.create({
  // 전체 헤더 래퍼: 밝은 cream 배경
  wrap: {
    backgroundColor: C.card,
    paddingTop: Platform.OS === 'ios' ? 50 : 34,
  },
  // ── 상단 행: 뒤로 + 메타/제목 + 우측 액션 ──
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 24,
    gap: 16,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  titleWrap: { flex: 1 },
  meta: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary, letterSpacing: 0.5, marginBottom: 2 },
  title: { fontFamily: F.serifMedItalic, fontSize: 19, color: C.text, letterSpacing: -0.2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deadlineBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: C.warningLight,
  },
  deadlineText: { fontFamily: F.sansMedium, fontSize: 11.5, color: C.warning, letterSpacing: 0.15 },
  webviewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.primary,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  webviewBtnText: { fontFamily: F.sansBold, fontSize: 13, color: C.primary },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  submitBtnText: { fontFamily: F.sansBold, fontSize: 13, color: '#fff' },

  // ── 단계 탭 행 (stepper) ──
  tabsRow: {
    flexDirection: 'row', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  // 탭 카드: 기본 = 테두리만 있는 투명 카드
  tab: {
    flex: 1, padding: 10, borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: C.border,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minWidth: 80,
  },
  // 현재(active) 탭: 어두운 navy 배경
  tabActive: { backgroundColor: C.dark, borderColor: C.dark },

  // 탭 내부 숫자/체크 배지
  tabBadge: {
    width: 24, height: 24, borderRadius: 6, flexShrink: 0,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: C.primary, borderWidth: 0 },
  tabBadgeDone:   { backgroundColor: C.dark, borderWidth: 0 },

  tabBadgeNum: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary },
  tabBadgeNumActive: { color: '#fff' },

  // 탭 텍스트 영역
  tabInfo: { flex: 1, minWidth: 0 },
  tabTitle: { fontFamily: F.sansMedium, fontSize: 12.5, color: C.text },
  tabTitleActive: { fontFamily: F.sansSemi, color: '#fff' },
  tabAiLabel: { marginTop: 2, fontFamily: F.sans, fontSize: 10.5, color: C.textSecondary },
  tabAiLabelActive: { color: 'rgba(255,255,255,0.6)' },
});
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background },
  loadingText: { marginTop: 12, color: THEME.textSecondary, fontSize: 14 },

  bodyRow: { flex: 1, minHeight: 0 },
  leftWorkColumn: {
    minHeight: 0,
    backgroundColor: THEME.background,
  },
  leftWorkInner: { flex: 1, minHeight: 0 },
  headerNoShrink: { flexShrink: 0 },
  splitContainer: { flex: 1, flexDirection: 'row' },
  fullContent: { flex: 1 },
  taskBody: { flex: 1, minHeight: 0, flexShrink: 1 },
  taskScrollView: { flex: 1, minHeight: 0 },
  taskScroll: { padding: 14, paddingBottom: 8, flexGrow: 1 },
  taskScrollInner: { gap: 10 },
  infoBox: {
    backgroundColor: THEME.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: THEME.border,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  infoBoxLabel: { fontSize: 11.5, fontWeight: '700', color: THEME.textSecondary, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  infoBoxText: { fontSize: 14, color: THEME.text, lineHeight: 21 },
  guidanceBox: { borderLeftWidth: 3, borderLeftColor: THEME.primary, backgroundColor: THEME.primaryLight },
  writingBox: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  writingHeader: {
    marginBottom: 6,
  },
  writingHint: { fontSize: 12, color: THEME.textSecondary, marginBottom: 10, lineHeight: 17 },
  lockedWritingText: {
    fontSize: 15,
    color: THEME.text,
    lineHeight: 22,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 4,
  },
  writingInput: {
    minHeight: 160,
    maxHeight: 320,
    fontSize: 15,
    color: THEME.text,
    lineHeight: 22,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 12,
    backgroundColor: THEME.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  noAiBox: { alignItems: 'center', paddingVertical: 10, borderLeftWidth: 3, borderLeftColor: THEME.danger },
  noAiIcon: { fontSize: 32, marginBottom: 8 },
  noAiTitle: { fontSize: 15, fontWeight: 'bold', color: THEME.danger, marginBottom: 4 },
  noAiDesc: { fontSize: 13, color: THEME.textSecondary, textAlign: 'center' },
  conditionalAiBox: {
    alignItems: 'center', paddingVertical: 10, borderLeftWidth: 3, borderLeftColor: THEME.warning,
  },
  conditionalAiIcon: { fontSize: 28, marginBottom: 6 },
  conditionalAiTitle: { fontSize: 15, fontWeight: 'bold', color: THEME.warning, marginBottom: 4 },
  conditionalAiDesc: { fontSize: 13, color: THEME.textSecondary, textAlign: 'center', lineHeight: 20 },
  advanceBtn: {
    backgroundColor: THEME.dark, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4,
  },
  advanceBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
  completedBox: {
    backgroundColor: THEME.successLight, borderRadius: 12, padding: 16, alignItems: 'center',
  },
  completedText: { fontSize: 16, fontWeight: 'bold', color: THEME.success },

  // 분할선
  divider: {
    width: DIVIDER_WIDTH, backgroundColor: THEME.dark,
    justifyContent: 'center', alignItems: 'center',
  },
  dividerHandle: {
    width: 4, height: 44, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)', marginBottom: 6,
  },
  dividerHint: { fontSize: 9, color: 'rgba(255,255,255,0.5)' },

  // AI 브라우저 패널
  browserPanel: { position: 'relative', backgroundColor: '#000' },
  browserUrlBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME.dark, paddingHorizontal: 6, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  browserNavBtn: {
    width: 32, height: 32, justifyContent: 'center', alignItems: 'center',
    borderRadius: 6, marginHorizontal: 2,
  },
  browserNavBtnDisabled: { opacity: 0.3 },
  browserNavBtnText: { color: '#fff', fontSize: 20, fontWeight: '600', lineHeight: 24 },
  browserUrlInput: {
    flex: 1, color: '#eee', fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginHorizontal: 4,
  },
  browserUrlGo: {
    backgroundColor: THEME.primary, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
  },
  browserUrlGoText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  webView: { flex: 1 },
  aiLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: THEME.background,
    justifyContent: 'center', alignItems: 'center',
  },
  aiLoadingText: { marginTop: 10, color: THEME.textSecondary, fontSize: 13 },

  // 웹 폴백
  webFallback: {
    flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: THEME.background,
  },
  webFallbackTitle: { fontSize: 20, fontWeight: 'bold', color: THEME.text, marginBottom: 8 },
  webFallbackDesc: { fontSize: 13, color: THEME.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  webFallbackBtn: {
    width: '100%', backgroundColor: THEME.card, borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: THEME.border, marginBottom: 8,
  },
  webFallbackBtnText: { fontSize: 15, fontWeight: '600', color: THEME.primary },

  // 이전 내용 보기 플로팅 패널 (비차단)
  floatingPanelHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
  floatingPanel: {
    position: 'absolute',
    backgroundColor: THEME.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  floatingPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 10,
    backgroundColor: THEME.background,
    borderRadius: 10,
    padding: 8,
  },
  floatingCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCloseText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  floatingHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  floatingMinBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingMinText: { color: THEME.text, fontSize: 13, fontWeight: '800' },
  floatingMiniToggle: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  floatingMiniText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: THEME.text },
  modalSubTitle: { fontSize: 12, color: THEME.textSecondary, marginTop: 4, marginBottom: 10 },
  modalScroll: { flex: 1 },
  modalScrollContent: { paddingBottom: 8, gap: 10 },
  modalEmpty: { color: THEME.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 18 },
  prevDetailWrap: { gap: 8 },
  prevBackBtn: {
    alignSelf: 'flex-start',
    backgroundColor: THEME.primaryLight,
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  prevBackBtnText: { color: THEME.primary, fontSize: 12, fontWeight: '700' },
  prevPreviewItem: {
    backgroundColor: THEME.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
  },
  prevItemBox: {
    backgroundColor: THEME.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
  },
  prevItemTitle: { fontSize: 13, fontWeight: '700', color: THEME.primary, marginBottom: 6 },
  prevPreviewContent: { fontSize: 13, color: THEME.textSecondary, lineHeight: 20 },
  prevItemContent: { fontSize: 14, color: THEME.text, lineHeight: 21 },
  resizeHandleWrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandleInner: {
    width: 12,
    height: 12,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: THEME.primary,
    transform: [{ rotate: '0deg' }],
  },
});

// ── 제출/다음 단계 확인 모달 스타일 (앱 전체 ConfirmDialog와 동일) ────────────
const scm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,27,45,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: 340, padding: 28, borderRadius: 16,
    backgroundColor: C.background, gap: 16,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  title: { fontFamily: F.serifKo, fontSize: 22, color: C.text },
  body:  { fontFamily: F.sans, fontSize: 14, color: C.textSoft, lineHeight: 21 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnCancel:  { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  btnConfirm: { backgroundColor: C.dark },
  btnCancelText:  { fontFamily: F.sansMedium, fontSize: 15, color: C.textSecondary },
  btnConfirmText: { fontFamily: F.sansMedium, fontSize: 15, color: '#fff' },
});
