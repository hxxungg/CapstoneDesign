import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, PanResponder, Dimensions, Platform, ActivityIndicator,
  BackHandler, AppState, Linking, TextInput, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI, assessmentAPI, logAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, INAPP_BROWSER_HOME } from '../../config/api';
import {
  stageAllowsAiBrowser,
  getStudentAiBadgeText,
  getStudentAiBadgeColor,
} from '../../config/defaultPerformanceStages';
import ExitWarningModal from '../../components/ExitWarningModal';
import { appAlert } from '../../utils/appAlert';
import { WEBVIEW_LOG_SCRIPT } from '../../utils/webviewInjection';

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
  // participation_id / step_id: 신규 assessments 시스템 (선택적)
  const {
    assignment: initialAssignment,
    participation_id,
    step_id: initialStepId,
    total_steps: routeTotalSteps,
    stage: initialStage,
    assessment: initialAssessment,
  } = route.params;
  const isNewSystem = !!participation_id;
  const [currentStepId, setCurrentStepId] = React.useState(initialStepId);
  const { user } = useAuth();

  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_RATIO);
  const [aiUrl, setAiUrl] = useState(INAPP_BROWSER_HOME);
  const [addressDraft, setAddressDraft] = useState(INAPP_BROWSER_HOME);
  const [aiPageLoading, setAiPageLoading] = useState(true);
  const [canWebViewGoBack, setCanWebViewGoBack] = useState(false);
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

  const webViewRef          = useRef(null);
  const splitRatioRef       = useRef(DEFAULT_RATIO);
  const panStartRatioRef    = useRef(DEFAULT_RATIO);
  const pageStartTimeRef    = useRef(Date.now());
  const visitedAtRef        = useRef(new Date().toISOString());
  const lastLoggedUrlRef    = useRef(null);
  const pendingAiLogIdRef   = useRef(null);
  const appStateRef         = useRef(AppState.currentState);
  const saveWritingTimerRef = useRef(null);
  const writingTextRef = useRef('');
  const panelDragStartRef = useRef({ x: PANEL_INITIAL_LEFT, y: PANEL_INITIAL_TOP });
  const panelResizeStartRef = useRef({ width: PANEL_INITIAL_WIDTH, height: PANEL_INITIAL_HEIGHT });
  const miniDragStartRef = useRef({ x: PANEL_INITIAL_LEFT, y: PANEL_INITIAL_TOP });
  const miniMovedRef = useRef(false);
  const panelPositionRef = useRef({ x: PANEL_INITIAL_LEFT, y: PANEL_INITIAL_TOP });
  const panelSizeRef = useRef({ width: PANEL_INITIAL_WIDTH, height: PANEL_INITIAL_HEIGHT });
  writingTextRef.current = writingText;
  panelPositionRef.current = panelPosition;
  panelSizeRef.current = panelSize;

  const loadAssignment = async () => {
    try {
      if (isNewSystem) {
        // 신규 시스템: StageListScreen에서 넘겨준 stage/assessment 파라미터로 가상 객체 생성
        const s = initialStage;
        const syntheticStage = s ? { ...s, order_num: s.step_order } : null;
        const syntheticAssignment = {
          id: initialAssessment?.id,
          title: initialAssessment?.title,
          studentProgress: {
            current_stage_order: s?.step_order || 1,
            status: 'in_progress',
          },
          stages: syntheticStage ? [syntheticStage] : [],
          stageWritings: {},
        };
        setAssignment(syntheticAssignment);
        if (stageAllowsAiBrowser(syntheticStage)) {
          setAiUrl(INAPP_BROWSER_HOME);
          setAddressDraft(INAPP_BROWSER_HOME);
        }
      } else {
        // 구 시스템
        const data = await assignmentAPI.getDetail(initialAssignment.id);
        setAssignment(data);
        const stageOrder = data.studentProgress?.current_stage_order || 1;
        const stage = data.stages?.find(s => s.order_num === stageOrder);
        if (stageAllowsAiBrowser(stage)) {
          setAiUrl(INAPP_BROWSER_HOME);
          setAddressDraft(INAPP_BROWSER_HOME);
        }
      }
    } catch (err) {
      Alert.alert('오류', err.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadAssignment(); }, []));

  useEffect(() => {
    return () => {
      if (saveWritingTimerRef.current) clearTimeout(saveWritingTimerRef.current);
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

  // ── 신규: URL 방문 로그 ──────────────────────────────────────────
  const logUrl = async (url, title, visitedAt, completeAt) => {
    if (!participation_id || !url) return;
    try {
      await logAPI.recordUrl({
        participation_id,
        step_id: currentStepId || null,
        url,
        page_title: title || '',
        visited_at: visitedAt,
        complete_at: completeAt,
      });
    } catch (err) {
      console.log('URL 로그 실패:', err.message);
    }
  };

  // ── 신규: AI 프롬프트 로그 ───────────────────────────────────────
  const logAiPrompt = async (prompt, url) => {
    if (!participation_id || !prompt) return null;
    try {
      const result = await logAPI.recordAi({
        participation_id,
        step_id: currentStepId || null,
        prompt,
      });
      return result?.id || null;
    } catch (err) {
      console.log('AI 로그 실패:', err.message);
      return null;
    }
  };

  // ── 신규: AI 응답 업데이트 ───────────────────────────────────────
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
        if (lastLoggedUrlRef.current && lastLoggedUrlRef.current !== msg.url) {
          await logUrl(
            lastLoggedUrlRef.current,
            aiUrl,
            visitedAtRef.current,
            new Date().toISOString()
          );
        }
        visitedAtRef.current    = msg.visited_at || new Date().toISOString();
        lastLoggedUrlRef.current = msg.url;
        break;
      }
      case 'ai_prompt': {
        const logId = await logAiPrompt(msg.prompt, msg.url);
        if (logId) {
          pendingAiLogIdRef.current = logId;
          webViewRef.current?.injectJavaScript(
            `window._setPendingAiLogId(${logId}); true;`
          );
        }
        break;
      }
      case 'ai_response': {
        const id = msg.log_id || pendingAiLogIdRef.current;
        await updateAiResponse(id, msg.response);
        pendingAiLogIdRef.current = null;
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
      Alert.alert('저장 실패', err.message || '작성 내용을 저장하지 못했습니다.');
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

  const handleAdvanceStage = async () => {
    if (!assignment) return;

    if (isNewSystem) {
      // 작성 내용 저장 타이머 flush
      if (saveWritingTimerRef.current) {
        clearTimeout(saveWritingTimerRef.current);
        saveWritingTimerRef.current = null;
      }
      try {
        const result = await assessmentAPI.submitStep(participation_id, {
          step_id: currentStepId || null,
          content: writingTextRef.current,
        });

        if (result.status === 'submitted') {
          appAlert('🎉 수행평가 완료!', '모든 단계를 완료하여 제출되었습니다. 수고하셨습니다!', [
            { text: '확인', onPress: () => navigation.goBack() },
          ]);
        } else {
          const nextStage = result.next_step_info;
          const syntheticStage = nextStage ? { ...nextStage, order_num: nextStage.step_order } : null;
          if (nextStage?.id) setCurrentStepId(nextStage.id);
          setAssignment(prev => ({
            ...prev,
            studentProgress: {
              current_stage_order: result.next_step,
              status: 'in_progress',
            },
            stages: syntheticStage ? [syntheticStage] : prev.stages,
            stageWritings: {},
          }));
          setWritingText('');
          appAlert('단계 완료', result.message || `${result.next_step}단계로 이동했습니다.`);
        }
      } catch (err) {
        appAlert('오류', err.message);
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
        appAlert('🎉 수행평가 완료!', '모든 단계를 완료했습니다. 수고하셨습니다!', [
        { text: '확인', onPress: () => navigation.goBack() },
      ]);
      } else {
        loadAssignment();
      }
    } catch (err) {
      appAlert('오류', err.message);
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  const currentStageOrder = assignment?.studentProgress?.current_stage_order || 1;
  const totalStages = routeTotalSteps || assignment?.stages?.length || 0;
  const currentStage = assignment?.stages?.find(s => s.order_num === currentStageOrder);
  const isCompleted = assignment?.studentProgress?.status === 'completed';
  const aiAllowed = stageAllowsAiBrowser(currentStage);
  const previousStageWritings = (assignment?.stages || [])
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
    <View style={styles.container}>
      <ExitWarningModal
        visible={showExitModal}
        onClose={() => setShowExitModal(false)}
        attemptCount={exitAttemptCount}
      />

      {/* ── 상단 헤더 ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.assignmentTitle} numberOfLines={1}>{assignment?.title}</Text>
          <Text style={styles.stageIndicator}>
            {isCompleted ? '✅ 완료' : `단계 ${currentStageOrder} / ${totalStages} • ${currentStage?.title || ''}`}
          </Text>
        </View>
        <View style={[styles.aiBadge, { backgroundColor: getStudentAiBadgeColor(THEME, currentStage) }]}>
          <Text style={styles.aiBadgeText}>{getStudentAiBadgeText(currentStage)}</Text>
        </View>
      </View>

      <View style={aiAllowed ? styles.splitContainer : styles.fullContent}>
        {/* ── 수행평가 패널 ── */}
        <View style={[styles.taskPanel, { flex: aiAllowed ? splitRatio : 1 }]}>
          <ScrollView
            contentContainerStyle={styles.taskScroll}
            keyboardShouldPersistTaps="handled"
          >
            {currentStage?.description ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxLabel}>📋 수행 내용</Text>
                <Text style={styles.infoBoxText}>{currentStage.description}</Text>
              </View>
            ) : (
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>이 단계의 수행평가를 진행하세요.</Text>
              </View>
            )}

            {currentStage?.ai_guidance ? (
              <View style={[styles.infoBox, styles.guidanceBox]}>
                <Text style={styles.infoBoxLabel}>📌 AI 활용 지침</Text>
                <Text style={styles.infoBoxText}>{currentStage.ai_guidance}</Text>
              </View>
            ) : null}

            <View style={styles.writingBox}>
              <View style={styles.writingHeader}>
                <Text style={styles.infoBoxLabel}>✏️ 작성 공간</Text>
              <View style={styles.writingHeaderRight}>
                {currentStageOrder > 1 && (
                  <TouchableOpacity
                    style={styles.prevViewBtn}
                    onPress={() => {
                      setShowPreviousWritingsModal(true);
                      setIsPreviousPanelMinimized(false);
                      setSelectedPreviousStage(null);
                    }}
                  >
                    <Text style={styles.prevViewBtnText}>이전 내용 보기</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.writingSaveHint}>
                  {writingSaveStatus === 'saving'
                    ? '저장 중…'
                    : writingSaveStatus === 'saved'
                      ? '저장됨'
                      : writingSaveStatus === 'error'
                        ? '저장 오류'
                        : '입력 시 자동 저장'}
                </Text>
              </View>
              </View>
              <Text style={styles.writingHint}>
                단계마다 내용이 따로 저장됩니다. 다음 단계로 넘어가기 전에 자동으로 한 번 더 저장됩니다.
              </Text>
              <TextInput
                style={styles.writingInput}
                multiline
                textAlignVertical="top"
                placeholder="이 단계에서 조사·정리·성찰 등 작성할 내용을 입력하세요."
                placeholderTextColor={THEME.textSecondary}
                value={writingText}
                onChangeText={(t) => {
                  setWritingText(t);
                  if (assignment && currentStage) {
                    scheduleSaveWriting(assignment.id, currentStage.id);
                  }
                }}
                onBlur={() => {
                  if (!assignment || !currentStage) return;
                  if (saveWritingTimerRef.current) {
                    clearTimeout(saveWritingTimerRef.current);
                    saveWritingTimerRef.current = null;
                  }
                  persistStageWriting(assignment.id, currentStage.id, writingTextRef.current);
                }}
              />
            </View>

            {!aiAllowed && (
              <View style={[styles.infoBox, styles.noAiBox]}>
                <Text style={styles.noAiIcon}>🚫</Text>
                <Text style={styles.noAiTitle}>AI 사용 제한 단계</Text>
                <Text style={styles.noAiDesc}>교사가 이 단계의 AI 사용을 허용하지 않았습니다.</Text>
              </View>
            )}

            {isCompleted ? (
              <View style={styles.completedBox}>
                <Text style={styles.completedText}>🎉 모든 단계 완료!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.advanceBtn}
                onPress={() => appAlert(
                  currentStageOrder === totalStages ? '수행평가 완료' : '다음 단계로 이동',
                  currentStageOrder === totalStages
                    ? '수행평가를 완료하시겠습니까?'
                    : '현재 단계를 완료하고 다음 단계로 이동하시겠습니까?',
                  [
                    { text: '취소', style: 'cancel' },
                    { text: currentStageOrder === totalStages ? '완료' : '이동', onPress: handleAdvanceStage },
                  ]
                )}
              >
                <Text style={styles.advanceBtnText}>
                  {currentStageOrder === totalStages ? '✅ 수행평가 완료' : '다음 단계로 →'}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* ── 분할선 + AI 브라우저 패널 (AI 허용 시만 표시) ── */}
        {aiAllowed && (
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
                    <TouchableOpacity style={styles.browserUrlGo} onPress={navigateFromAddressBar}>
                      <Text style={styles.browserUrlGoText}>검색</Text>
                    </TouchableOpacity>
                  </View>
                  <WebView
                    ref={webViewRef}
                    source={{ uri: aiUrl }}
                    style={styles.webView}
                    onLoadStart={() => setAiPageLoading(true)}
                    onLoadEnd={(e) => {
                      setAiPageLoading(false);
                      // duration 버그 수정: completeAt을 현재 시각으로 기록
                      logUrl(
                        e.nativeEvent.url,
                        e.nativeEvent.title,
                        visitedAtRef.current,
                        new Date().toISOString()
                      );
                    }}
                    onNavigationStateChange={(state) => {
                      setCanWebViewGoBack(state.canGoBack);
                      if (state.url && state.url !== aiUrl) {
                        // 이전 URL 체류 완료
                        logUrl(aiUrl, state.title || '', visitedAtRef.current, new Date().toISOString());
                        setAiUrl(state.url);
                        setAddressDraft(state.url);
                        visitedAtRef.current    = new Date().toISOString();
                        lastLoggedUrlRef.current = null;
                        pageStartTimeRef.current = Date.now();
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
      </View>

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
                      key={item.stageId}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background },
  loadingText: { marginTop: 12, color: THEME.textSecondary, fontSize: 14 },

  // 헤더
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: THEME.primary,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 10, paddingHorizontal: 16,
  },
  headerLeft: { flex: 1, marginRight: 10 },
  assignmentTitle: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  stageIndicator: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  aiBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  aiBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // 수행평가 패널
  splitContainer: { flex: 1, flexDirection: 'row' },
  fullContent: { flex: 1 },
  taskPanel: { backgroundColor: THEME.background },
  taskScroll: { padding: 14, gap: 10 },
  infoBox: {
    backgroundColor: THEME.card, borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  infoBoxLabel: { fontSize: 12, fontWeight: '700', color: THEME.primary, marginBottom: 6 },
  infoBoxText: { fontSize: 14, color: THEME.text, lineHeight: 20 },
  guidanceBox: { borderLeftWidth: 3, borderLeftColor: THEME.primary },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  writingHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prevViewBtn: {
    backgroundColor: THEME.primaryLight,
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  prevViewBtnText: {
    color: THEME.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  writingSaveHint: { fontSize: 11, color: THEME.textSecondary, fontWeight: '600' },
  writingHint: { fontSize: 12, color: THEME.textSecondary, marginBottom: 10, lineHeight: 17 },
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
  advanceBtn: {
    backgroundColor: THEME.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4,
  },
  advanceBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  completedBox: {
    backgroundColor: THEME.successLight, borderRadius: 12, padding: 16, alignItems: 'center',
  },
  completedText: { fontSize: 16, fontWeight: 'bold', color: THEME.success },

  // 분할선
  divider: {
    width: DIVIDER_WIDTH, backgroundColor: '#1a1a2e',
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
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a2e', paddingHorizontal: 10, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  browserUrlInput: {
    flex: 1, color: '#eee', fontSize: 13,
    backgroundColor: '#0f0f23', borderRadius: 8, paddingHorizontal: 10, paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    borderWidth: 1, borderColor: '#333',
  },
  browserUrlGo: {
    backgroundColor: THEME.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
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
