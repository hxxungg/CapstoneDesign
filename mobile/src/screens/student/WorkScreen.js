import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, PanResponder, Dimensions, Platform, ActivityIndicator,
  BackHandler, AppState, Linking, TextInput, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI, logAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, INAPP_BROWSER_HOME } from '../../config/api';
import {
  stageAllowsAiBrowser,
  getStudentAiBadgeText,
  getStudentAiBadgeColor,
} from '../../config/defaultPerformanceStages';
import ExitWarningModal from '../../components/ExitWarningModal';

let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HEADER_HEIGHT = Platform.OS === 'ios' ? 110 : 90;
const DIVIDER_HEIGHT = 30;
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.75;
const DEFAULT_RATIO = 0.42;

export default function WorkScreen({ navigation, route }) {
  const { assignment: initialAssignment } = route.params;
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

  const webViewRef = useRef(null);
  const splitRatioRef = useRef(DEFAULT_RATIO);
  const panStartRatioRef = useRef(DEFAULT_RATIO);
  const pageStartTimeRef = useRef(Date.now());
  const lastLoggedUrlRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const saveWritingTimerRef = useRef(null);
  const writingTextRef = useRef('');
  writingTextRef.current = writingText;

  const loadAssignment = async () => {
    try {
      const data = await assignmentAPI.getDetail(initialAssignment.id);
      setAssignment(data);

      const stageOrder = data.studentProgress?.current_stage_order || 1;
      const stage = data.stages?.find(s => s.order_num === stageOrder);
      if (stageAllowsAiBrowser(stage)) {
        setAiUrl(INAPP_BROWSER_HOME);
        setAddressDraft(INAPP_BROWSER_HOME);
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
        assignment_id: assignment?.id || initialAssignment.id,
        attempt_type: type,
      });
    } catch (err) {}
  };

  const logPageVisit = async (url, title, duration = 0) => {
    if (!url || url === lastLoggedUrlRef.current || !currentStage) return;
    lastLoggedUrlRef.current = url;
    try {
      await logAPI.record({
        assignment_id: assignment.id,
        stage_id: currentStage.id,
        stage_order: currentStage.order_num,
        action_type: 'page_visit',
        url,
        page_title: title || '',
        duration_seconds: Math.floor(duration / 1000),
      });
    } catch (err) {}
  };

  const persistStageWriting = async (assignmentId, stageId, text) => {
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
        Alert.alert('🎉 수행평가 완료!', '모든 단계를 완료했습니다. 수고하셨습니다!');
        navigation.goBack();
      } else {
        loadAssignment();
      }
    } catch (err) {
      Alert.alert('오류', err.message);
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
        const availableHeight = SCREEN_HEIGHT - HEADER_HEIGHT - DIVIDER_HEIGHT;
        const delta = gestureState.dy / availableHeight;
        const newRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, panStartRatioRef.current + delta));
        splitRatioRef.current = newRatio;
        setSplitRatio(newRatio);
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
  const totalStages = assignment?.stages?.length || 0;
  const currentStage = assignment?.stages?.find(s => s.order_num === currentStageOrder);
  const isCompleted = assignment?.studentProgress?.status === 'completed';
  const aiAllowed = stageAllowsAiBrowser(currentStage);

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
              onPress={() => Alert.alert(
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

      {/* ── 분할선 (AI 허용 시만 표시) ── */}
      {aiAllowed && (
        <View style={styles.divider} {...panResponder.panHandlers}>
          <View style={styles.dividerHandle} />
          <Text style={styles.dividerHint}>드래그하여 위·아래 크기 조절</Text>
        </View>
      )}

      {/* ── AI 브라우저 패널 (AI 허용 시만 표시) ── */}
      {aiAllowed && (
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
                  logPageVisit(e.nativeEvent.url, e.nativeEvent.title, 0);
                }}
                onNavigationStateChange={(state) => {
                  setCanWebViewGoBack(state.canGoBack);
                  if (state.url && state.url !== aiUrl) {
                    setAiUrl(state.url);
                    setAddressDraft(state.url);
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
    height: DIVIDER_HEIGHT, backgroundColor: '#1a1a2e',
    justifyContent: 'center', alignItems: 'center',
  },
  dividerHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)', marginBottom: 2,
  },
  dividerHint: { fontSize: 10, color: 'rgba(255,255,255,0.45)' },

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
});
