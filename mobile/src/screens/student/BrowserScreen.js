import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  BackHandler, AppState, ActivityIndicator, Platform, Linking,
  TextInput, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}
import { logAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, INAPP_BROWSER_HOME } from '../../config/api';
import ExitWarningModal from '../../components/ExitWarningModal';

export default function BrowserScreen({ navigation, route }) {
  const { stage, assignment } = route.params;
  const { user } = useAuth();

  const [currentUrl, setCurrentUrl] = useState(INAPP_BROWSER_HOME);
  const [addressDraft, setAddressDraft] = useState(INAPP_BROWSER_HOME);
  const [pageTitle, setPageTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitAttemptCount, setExitAttemptCount] = useState(0);
  const webViewRef = useRef(null);
  const pageStartTimeRef = useRef(Date.now());
  const appStateRef = useRef(AppState.currentState);
  const lastLoggedUrlRef = useRef(null);

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
      setAddressDraft(navState.url);
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
    const url = request.url;
    if (/^https?:\/\//i.test(url) || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) {
      return true;
    }
    if (/^(mailto|tel|sms):/i.test(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return true;
  };

  const normalizeAndNavigate = (raw) => {
    const q = raw.trim();
    if (!q) return;
    const u = /^https?:\/\//i.test(q)
      ? q
      : `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    Keyboard.dismiss();
    setCurrentUrl(u);
    setAddressDraft(u);
    setLoading(true);
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

      {/* 상단 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.stageLabel}>단계 {stage.order_num}</Text>
          <Text style={styles.stageTitle} numberOfLines={1}>{stage.title}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.aiAllowedBadge}>
            <Text style={styles.aiAllowedText}>🌐 인앱 브라우저</Text>
          </View>
        </View>
      </View>

      {/* 주소창 */}
      <View style={styles.urlBar}>
        <TextInput
          style={styles.urlInput}
          value={addressDraft}
          onChangeText={setAddressDraft}
          onSubmitEditing={() => normalizeAndNavigate(addressDraft)}
          placeholder="검색어 (https://… 직접 입력 가능)"
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
        />
        <TouchableOpacity style={styles.urlGoBtn} onPress={() => normalizeAndNavigate(addressDraft)}>
          <Text style={styles.urlGoBtnText}>검색</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator size="small" color={THEME.primary} style={{ marginLeft: 6 }} />}
      </View>

      {/* WebView (모바일) / 웹 폴백 */}
      {Platform.OS === 'web' ? (
        <View style={styles.webFallback}>
          <Text style={styles.webFallbackTitle}>🌐 브라우저</Text>
          <Text style={styles.webFallbackDesc}>
            인앱 WebView는 모바일 앱(Expo Go)에서만 지원됩니다.{'\n'}
            웹에서는 Google 검색만 새 탭으로 열 수 있습니다.
          </Text>
          <TouchableOpacity
            style={styles.webFallbackBtn}
            onPress={() => Linking.openURL('https://www.google.com')}
          >
            <Text style={styles.webFallbackBtnText}>Google 검색 열기 ↗</Text>
          </TouchableOpacity>
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
              <Text style={styles.loadingText}>페이지를 불러오는 중...</Text>
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
    backgroundColor: '#1a1a2e', paddingHorizontal: 10, paddingVertical: 8,
    gap: 8,
  },
  urlInput: {
    flex: 1, color: '#eee', fontSize: 14,
    backgroundColor: '#0f0f23', borderRadius: 8, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderWidth: 1, borderColor: '#333',
  },
  urlGoBtn: {
    backgroundColor: THEME.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
  },
  urlGoBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
    fontSize: 14, color: THEME.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 20,
  },
  webFallbackBtn: {
    width: '100%', backgroundColor: THEME.card, borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: THEME.border, alignItems: 'center',
  },
  webFallbackBtnText: { fontSize: 16, fontWeight: '600', color: THEME.primary },
});
