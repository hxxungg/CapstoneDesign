import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  BackHandler, AppState, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}
import { logAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, AI_TOOLS } from '../../config/api';
import ExitWarningModal from '../../components/ExitWarningModal';

export default function BrowserScreen({ navigation, route }) {
  const { stage, assignment } = route.params;
  const { user } = useAuth();

  const [currentUrl, setCurrentUrl] = useState(stage.ai_tools?.[0]
    ? AI_TOOLS.find(t => stage.ai_tools.includes(t.name))?.url || AI_TOOLS[0].url
    : AI_TOOLS[0].url
  );
  const [pageTitle, setPageTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitAttemptCount, setExitAttemptCount] = useState(0);
  const [showToolSelector, setShowToolSelector] = useState(false);

  const webViewRef = useRef(null);
  const pageStartTimeRef = useRef(Date.now());
  const appStateRef = useRef(AppState.currentState);
  const lastLoggedUrlRef = useRef(null);

  const allowedTools = AI_TOOLS.filter(t =>
    !stage.ai_tools || stage.ai_tools.length === 0 || stage.ai_tools.includes(t.name)
  );

  const logPageVisit = async (url, title, duration = 0) => {
    if (!url || url === lastLoggedUrlRef.current) return;
    lastLoggedUrlRef.current = url;
    try {
      await logAPI.record({
        assignment_id: assignment.id,
        stage_id: stage.id,
        stage_order: stage.order_num,
        action_type: 'page_visit',
        url,
        page_title: title || '',
        duration_seconds: Math.floor(duration / 1000),
      });
    } catch (err) {
      console.log('로그 기록 실패:', err.message);
    }
  };

  const handleExitAttempt = async (type) => {
    setExitAttemptCount(prev => prev + 1);
    setShowExitModal(true);
    try {
      await logAPI.recordExitAttempt({
        assignment_id: assignment.id,
        attempt_type: type,
      });
    } catch (err) {
      console.log('이탈 로그 실패:', err.message);
    }
  };

  // 뒤로가기 차단
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
        } else {
          handleExitAttempt('browser_back');
        }
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [canGoBack])
  );

  // 앱 백그라운드 전환 감지
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'active' && nextState === 'background') {
        const duration = Date.now() - pageStartTimeRef.current;
        logPageVisit(currentUrl, pageTitle, duration);
        handleExitAttempt('background');
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [currentUrl, pageTitle]);

  const handleNavigationStateChange = async (navState) => {
    setCanGoBack(navState.canGoBack);

    if (navState.url && navState.url !== currentUrl) {
      const duration = Date.now() - pageStartTimeRef.current;
      await logPageVisit(currentUrl, pageTitle, duration);

      setCurrentUrl(navState.url);
      setPageTitle(navState.title || '');
      pageStartTimeRef.current = Date.now();
      lastLoggedUrlRef.current = null;
    }
  };

  const handleLoadEnd = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    setLoading(false);
    setPageTitle(nativeEvent.title || '');

    const duration = Date.now() - pageStartTimeRef.current;
    logPageVisit(nativeEvent.url, nativeEvent.title, duration);
  };

  const handleShouldStartLoad = (request) => {
    // AI 도구 허용 목록 확인
    if (allowedTools.length > 0) {
      const isAllowed = allowedTools.some(tool =>
        request.url.toLowerCase().includes(new URL(tool.url).hostname.toLowerCase())
      );
      if (!isAllowed && !request.url.startsWith('about:') && !request.url.startsWith('data:')) {
        const hostname = new URL(request.url).hostname;
        Alert.alert(
          '🚫 접근 제한',
          `이 단계에서는 허용된 AI 도구만 사용할 수 있습니다.\n\n"${hostname}"은 허용되지 않은 사이트입니다.`,
          [{ text: '확인', style: 'default' }]
        );
        return false;
      }
    }
    return true;
  };

  const switchTool = (tool) => {
    const duration = Date.now() - pageStartTimeRef.current;
    logPageVisit(currentUrl, pageTitle, duration);
    setCurrentUrl(tool.url);
    lastLoggedUrlRef.current = null;
    pageStartTimeRef.current = Date.now();
    setShowToolSelector(false);
    setLoading(true);
  };

  const currentTool = AI_TOOLS.find(t => currentUrl.toLowerCase().includes(new URL(t.url).hostname.toLowerCase()));

  return (
    <View style={styles.container}>
      <ExitWarningModal
        visible={showExitModal}
        onClose={() => setShowExitModal(false)}
        attemptCount={exitAttemptCount}
      />

      {/* 상단 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.stageLabel}>단계 {stage.order_num}</Text>
          <Text style={styles.stageTitle} numberOfLines={1}>{stage.title}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.aiAllowedBadge}>
            <Text style={styles.aiAllowedText}>✅ AI 허용</Text>
          </View>
        </View>
      </View>

      {/* URL 표시바 */}
      <View style={styles.urlBar}>
        <Text style={styles.urlText} numberOfLines={1}>{currentUrl}</Text>
        {loading && <ActivityIndicator size="small" color={THEME.primary} style={{ marginLeft: 8 }} />}
      </View>

      {/* AI 도구 선택 탭 */}
      {allowedTools.length > 1 && (
        <View style={styles.toolTabs}>
          {allowedTools.map((tool) => {
            const isActive = currentUrl.toLowerCase().includes(new URL(tool.url).hostname.toLowerCase());
            return (
              <TouchableOpacity
                key={tool.name}
                style={[styles.toolTab, isActive && styles.toolTabActive]}
                onPress={() => switchTool(tool)}
              >
                <Text style={styles.toolTabIcon}>{tool.icon}</Text>
                <Text style={[styles.toolTabText, isActive && styles.toolTabTextActive]}>{tool.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* WebView (모바일) / 웹 폴백 */}
      {Platform.OS === 'web' ? (
        <View style={styles.webFallback}>
          <Text style={styles.webFallbackTitle}>🤖 AI 브라우저</Text>
          <Text style={styles.webFallbackDesc}>
            인앱 브라우저는 모바일 앱(Expo Go)에서만 지원됩니다.{'\n'}
            아래 버튼을 눌러 AI 도구를 새 탭에서 열거나,{'\n'}
            핸드폰의 Expo Go 앱으로 테스트하세요.
          </Text>
          <View style={styles.webFallbackTools}>
            {allowedTools.map((tool) => (
              <TouchableOpacity
                key={tool.name}
                style={[styles.webFallbackToolBtn, currentUrl.includes(new URL(tool.url).hostname) && styles.webFallbackToolBtnActive]}
                onPress={() => {
                  logPageVisit(currentUrl, pageTitle, Date.now() - pageStartTimeRef.current);
                  setCurrentUrl(tool.url);
                  Linking.openURL(tool.url);
                }}
              >
                <Text style={styles.webFallbackToolIcon}>{tool.icon}</Text>
                <Text style={styles.webFallbackToolName}>{tool.name}</Text>
                <Text style={styles.webFallbackToolOpen}>새 탭으로 열기 ↗</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.webFallbackNotice}>
            <Text style={styles.webFallbackNoticeText}>
              ⚠️ 허용된 AI: {allowedTools.map(t => t.name).join(', ')}
            </Text>
          </View>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          style={styles.webView}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadEnd={handleLoadEnd}
          onLoadStart={() => setLoading(true)}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={THEME.primary} />
              <Text style={styles.loadingText}>AI 도구를 불러오는 중...</Text>
            </View>
          )}
          userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        />
      )}

      {/* AI 지침 (있을 경우) */}
      {stage.ai_guidance && (
        <View style={styles.guidanceBanner}>
          <Text style={styles.guidanceBannerText}>📌 {stage.ai_guidance}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: THEME.primary, paddingTop: Platform.OS === 'ios' ? 50 : 36,
    paddingBottom: 10, paddingHorizontal: 16,
  },
  headerLeft: { flex: 1 },
  stageLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' },
  stageTitle: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  headerRight: {},
  aiAllowedBadge: { backgroundColor: THEME.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  aiAllowedText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  urlBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2e', paddingHorizontal: 14, paddingVertical: 8,
  },
  urlText: { flex: 1, color: '#aaa', fontSize: 12 },
  toolTabs: {
    flexDirection: 'row', backgroundColor: '#0f0f23',
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  toolTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  toolTabActive: { borderBottomWidth: 2, borderBottomColor: THEME.primary },
  toolTabIcon: { fontSize: 14, marginRight: 4 },
  toolTabText: { fontSize: 11, color: '#888' },
  toolTabTextActive: { color: THEME.primary, fontWeight: '600' },
  webView: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background },
  loadingText: { marginTop: 12, color: THEME.textSecondary, fontSize: 14 },
  guidanceBanner: {
    backgroundColor: THEME.primaryLight, paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: THEME.border,
  },
  guidanceBannerText: { fontSize: 12, color: THEME.primary },
  webFallback: {
    flex: 1, backgroundColor: THEME.background, padding: 24, alignItems: 'center', justifyContent: 'center',
  },
  webFallbackTitle: { fontSize: 28, fontWeight: 'bold', color: THEME.text, marginBottom: 12 },
  webFallbackDesc: {
    fontSize: 14, color: THEME.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28,
  },
  webFallbackTools: { width: '100%', gap: 12 },
  webFallbackToolBtn: {
    backgroundColor: THEME.card, borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: THEME.border,
    flexDirection: 'row', alignItems: 'center',
  },
  webFallbackToolBtnActive: { borderColor: THEME.primary, backgroundColor: THEME.primaryLight },
  webFallbackToolIcon: { fontSize: 24, marginRight: 12 },
  webFallbackToolName: { flex: 1, fontSize: 16, fontWeight: '600', color: THEME.text },
  webFallbackToolOpen: { fontSize: 12, color: THEME.primary, fontWeight: '600' },
  webFallbackNotice: {
    marginTop: 20, backgroundColor: THEME.warningLight, borderRadius: 10,
    padding: 12, width: '100%',
  },
  webFallbackNoticeText: { fontSize: 12, color: THEME.warning, textAlign: 'center', fontWeight: '600' },
});
