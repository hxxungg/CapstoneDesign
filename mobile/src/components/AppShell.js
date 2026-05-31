import React, { useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput,
  TouchableOpacity, StyleSheet, useWindowDimensions,
  ActivityIndicator, Keyboard, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { THEME, FONTS } from '../config/api';
import { appAlert } from '../utils/appAlert';
import EnrollCodeModal from './EnrollCodeModal';

const C = THEME;
const F = FONTS;

// ── BrandMark ───────────────────────────────────────────────────────────────
function BrandMark({ size = 36 }) {
  return (
    <View style={[bm.wrap, { width: size, height: size, borderRadius: size * 0.22 }]}>
      <Text style={[bm.text, { fontSize: size * 0.32, lineHeight: size * 0.36 }]}>AI</Text>
      <View style={[bm.dot, {
        right: size * 0.18, bottom: size * 0.18,
        width: size * 0.08, height: size * 0.08, borderRadius: size * 0.04,
      }]} />
    </View>
  );
}
const bm = StyleSheet.create({
  wrap: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  text: { color: '#fff', fontFamily: F.sansBold, letterSpacing: -1, includeFontPadding: false },
  dot:  { position: 'absolute', backgroundColor: C.primary },
});

// ── ConfirmDialog (디자인 파일 스타일) ───────────────────────────────────────
function ConfirmDialog({ visible, title, body, confirmLabel, danger, onConfirm, onCancel, loading }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={cd.overlay} onPress={onCancel}>
        <Pressable style={cd.card} onPress={() => {}}>
          <Text style={cd.title}>{title}</Text>
          <Text style={cd.body}>{body}</Text>
          <View style={cd.btnRow}>
            <Pressable
              onPress={onCancel}
              disabled={loading}
              style={({ pressed }) => [cd.btn, cd.btnCancel, pressed && { opacity: 0.7 }]}
            >
              <Text style={cd.btnCancelText}>취소</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={loading}
              style={({ pressed }) => [
                cd.btn,
                danger ? cd.btnDanger : cd.btnPrimary,
                (pressed || loading) && { opacity: 0.7 },
              ]}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={cd.btnConfirmText}>{confirmLabel}</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const cd = StyleSheet.create({
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
  btnPrimary: { backgroundColor: C.dark },
  btnDanger:  { backgroundColor: C.danger },
  btnCancelText:  { fontFamily: F.sansMedium, fontSize: 15, color: C.textSecondary },
  btnConfirmText: { fontFamily: F.sansMedium, fontSize: 15, color: '#fff' },
});

// ── 설정 모달 (비밀번호 변경 + 회원탈퇴) ────────────────────────────────────
function SettingsModal({ visible, onClose }) {
  const { logout } = useAuth();
  const [view, setView] = useState('main'); // 'main' | 'password' | 'deleteConfirm'
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [pwLoading, setPwLoading]   = useState(false);
  const [delLoading, setDelLoading] = useState(false);

  const close = () => { setView('main'); onClose(); };

  const handleChangePw = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      appAlert('입력 오류', '모든 항목을 입력해주세요.', null, { type: 'warning' }); return;
    }
    if (newPw.length < 6) {
      appAlert('입력 오류', '새 비밀번호는 6자 이상이어야 합니다.', null, { type: 'warning' }); return;
    }
    if (newPw !== confirmPw) {
      appAlert('입력 오류', '새 비밀번호가 일치하지 않습니다.', null, { type: 'warning' }); return;
    }
    setPwLoading(true);
    try {
      await authAPI.changePassword({ current_password: currentPw, new_password: newPw });
      close();
      appAlert('완료', '비밀번호가 변경되었습니다.', null, { type: 'success' });
    } catch (err) {
      appAlert('실패', err.message, null, { type: 'error' });
    } finally { setPwLoading(false); }
  };

  const handleDelete = async () => {
    setDelLoading(true);
    try {
      await authAPI.deleteAccount();
      close();
      logout();
    } catch (err) {
      setDelLoading(false);
      setView('main');
      appAlert('오류', err.message, null, { type: 'error' });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable style={sm.overlay} onPress={close}>
        <Pressable style={sm.card} onPress={Keyboard.dismiss}>

          {view === 'main' && (
            <>
              <Text style={sm.title}>설정</Text>

              <Pressable style={sm.menuItem} onPress={() => setView('password')}>
                <Text style={sm.menuItemText}>🔒  비밀번호 변경</Text>
                <Text style={sm.menuChev}>›</Text>
              </Pressable>

              <View style={sm.divider} />

              <Pressable style={sm.menuItem} onPress={() => setView('deleteConfirm')}>
                <Text style={[sm.menuItemText, { color: C.danger }]}>⚠  회원탈퇴</Text>
                <Text style={[sm.menuChev, { color: C.danger }]}>›</Text>
              </Pressable>

              <Pressable style={sm.closeBtn} onPress={close}>
                <Text style={sm.closeBtnText}>닫기</Text>
              </Pressable>
            </>
          )}

          {view === 'password' && (
            <>
              <Text style={sm.title}>비밀번호 변경</Text>
              <Text style={sm.fieldLabel}>현재 비밀번호</Text>
              <TextInput
                style={sm.input} value={currentPw} onChangeText={setCurrentPw}
                secureTextEntry placeholder="현재 비밀번호"
                placeholderTextColor={C.textFaint} autoCapitalize="none"
              />
              <Text style={sm.fieldLabel}>새 비밀번호</Text>
              <TextInput
                style={sm.input} value={newPw} onChangeText={setNewPw}
                secureTextEntry placeholder="새 비밀번호 (6자 이상)"
                placeholderTextColor={C.textFaint} autoCapitalize="none"
              />
              <Text style={sm.fieldLabel}>새 비밀번호 확인</Text>
              <TextInput
                style={sm.input} value={confirmPw} onChangeText={setConfirmPw}
                secureTextEntry placeholder="새 비밀번호 재입력"
                placeholderTextColor={C.textFaint} autoCapitalize="none"
              />
              <View style={sm.btnRow}>
                <Pressable style={[cd.btn, cd.btnCancel]} onPress={() => setView('main')} disabled={pwLoading}>
                  <Text style={cd.btnCancelText}>취소</Text>
                </Pressable>
                <Pressable style={[cd.btn, cd.btnPrimary, pwLoading && { opacity: 0.6 }]} onPress={handleChangePw} disabled={pwLoading}>
                  {pwLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={cd.btnConfirmText}>변경</Text>}
                </Pressable>
              </View>
            </>
          )}

          {view === 'deleteConfirm' && (
            <>
              <Text style={sm.title}>회원탈퇴</Text>
              <Text style={sm.body}>탈퇴하면 모든 데이터가 영구적으로 삭제됩니다.{'\n\n'}정말 탈퇴하시겠습니까?</Text>
              <View style={sm.btnRow}>
                <Pressable style={[cd.btn, cd.btnCancel]} onPress={() => setView('main')} disabled={delLoading}>
                  <Text style={cd.btnCancelText}>취소</Text>
                </Pressable>
                <Pressable style={[cd.btn, cd.btnDanger, delLoading && { opacity: 0.6 }]} onPress={handleDelete} disabled={delLoading}>
                  {delLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={cd.btnConfirmText}>탈퇴하기</Text>}
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const sm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,27,45,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: 340, padding: 28, borderRadius: 16,
    backgroundColor: C.background, gap: 12,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  title:     { fontFamily: F.serifKo, fontSize: 22, color: C.text, marginBottom: 4 },
  body:      { fontFamily: F.sans, fontSize: 14, color: C.textSoft, lineHeight: 21 },
  menuItem:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  menuItemText: { fontFamily: F.sansMedium, fontSize: 15, color: C.text },
  menuChev:  { fontFamily: F.sans, fontSize: 20, color: C.textSecondary },
  divider:   { height: 1, backgroundColor: C.border },
  fieldLabel:{ fontFamily: F.sansMedium, fontSize: 12.5, color: C.textSoft, marginTop: 4 },
  input: {
    height: 46, paddingHorizontal: 14,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
    fontFamily: F.sans, fontSize: 15, color: C.text,
  },
  btnRow:    { flexDirection: 'row', gap: 10, marginTop: 8 },
  closeBtn:  { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, marginTop: 4 },
  closeBtnText: { fontFamily: F.sansMedium, fontSize: 14, color: C.textSecondary },
});

// ── AppShell ─────────────────────────────────────────────────────────────────
const NAV_STUDENT = [
  { id: 'home',   label: '내 수행평가' },
  { id: 'enroll', label: '수행평가 참여' },
];
const NAV_TEACHER = [
  { id: 'home',   label: '홈' },
  { id: 'create', label: '평가 생성' },
  { id: 'invite', label: '초대 코드 확인' },
];

export default function AppShell({ children, navigation, currentScreen = 'home', onEnroll, onInviteCode, onEnrolled }) {
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= 700;
  const isTeacher = user?.role === 'teacher';
  const navItems = isTeacher ? NAV_TEACHER : NAV_STUDENT;

  const [logoutOpen, setLogoutOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const openEnroll = () => {
    if (onEnroll) {
      onEnroll();
      return;
    }
    setEnrollOpen(true);
  };

  const handleNav = (id) => {
    if (id === 'home') {
      // 이미 홈이면 아무것도 안 함, 아니면 홈으로 이동
      if (currentScreen !== 'home') {
        navigation.navigate(isTeacher ? 'TeacherDashboard' : 'AssignmentList');
      }
      return;
    }
    if (id === 'enroll')  { openEnroll(); return; }
    if (id === 'create')  navigation.navigate('CreateAssignment');
    if (id === 'log')     navigation.navigate('Analytics');
    if (id === 'invite')  {
      if (onInviteCode) { onInviteCode(); return; }
      // onInviteCode 없는 화면(서브 화면)에서는 홈으로 이동 후 모달 열기
      navigation.navigate(isTeacher ? 'TeacherDashboard' : 'AssignmentList', { openInviteCode: true });
      return;
    }
  };

  const userName = user?.name || '';
  // 학생: "○○고 2-4" / 교사: "○○고 · 국어"
  const schoolInfo = isTeacher
    ? [user?.school, user?.subject].filter(Boolean).join(' · ')
    : [user?.school, [user?.grade, user?.class_num].filter(Boolean).join('-')].filter(Boolean).join(' ');

  if (!isWide) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, paddingTop: insets.top }}>
        {children}
        {/* 모달은 폰에서도 동작 */}
        <ConfirmDialog
          visible={logoutOpen}
          title="로그아웃"
          body="로그아웃 하시겠습니까?"
          confirmLabel="로그아웃"
          onCancel={() => setLogoutOpen(false)}
          onConfirm={() => { setLogoutOpen(false); logout(); }}
        />
        <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {!isTeacher && (
          <EnrollCodeModal
            visible={enrollOpen}
            onClose={() => setEnrollOpen(false)}
            navigation={navigation}
            onJoined={onEnrolled}
          />
        )}
      </View>
    );
  }

  // ── 태블릿 사이드바 레이아웃 ────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.background, paddingTop: insets.top }}>
    <View style={s.shell}>
      {/* 사이드바 */}
      <View style={s.sidebar}>
        {/* 브랜드 */}
        <View style={s.brand}>
          <BrandMark size={36} />
          <Text style={s.brandName}>AI나침반</Text>
        </View>

        {/* 네비게이션 */}
        <View style={s.navList}>
          {navItems.map(it => {
            const active = currentScreen === it.id;
            return (
              <Pressable
                key={it.id}
                onPress={() => handleNav(it.id)}
                style={({ pressed }) => [
                  s.navItem,
                  active && s.navItemActive,
                  !active && pressed && s.navItemPressed,
                ]}
              >
                <Text style={[s.navLabel, active && s.navLabelActive]}>{it.label}</Text>
                {active && <View style={s.navDot} />}
              </Pressable>
            );
          })}
        </View>

        <View style={{ flex: 1 }} />

        {/* 유저 카드 */}
        <View style={s.userCard}>
          <View style={[s.avatar, { backgroundColor: isTeacher ? C.goldSoft || '#F2E9D2' : C.primaryLight }]}>
            <Text style={[s.avatarText, { color: isTeacher ? C.secondary : C.primary }]}>
              {userName.slice(0, 1)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={s.userName}>{userName}</Text>
            <Text numberOfLines={1} style={s.userSub}>{isTeacher ? '교사' : '학생'}{schoolInfo ? ` · ${schoolInfo}` : ''}</Text>
          </View>
        </View>

        {/* 설정 */}
        <Pressable
          onPress={() => setSettingsOpen(true)}
          style={({ pressed }) => [s.sideBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}
        >
          <Text style={s.sideBtnText}>⚙  설정</Text>
        </Pressable>

        {/* 로그아웃 */}
        <Pressable
          onPress={() => setLogoutOpen(true)}
          style={({ pressed }) => [s.sideBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}
        >
          <Text style={s.sideBtnText}>↩  로그아웃</Text>
        </Pressable>

        <Text style={s.sidebarFooter}>© 2026 AI나침반</Text>
      </View>

      {/* 콘텐츠 */}
      <View style={{ flex: 1 }}>
        {children}
      </View>

      {/* 모달 */}
      <ConfirmDialog
        visible={logoutOpen}
        title="로그아웃"
          body="로그아웃 하시겠습니까?"
        confirmLabel="로그아웃"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => { setLogoutOpen(false); logout(); }}
      />
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {!isTeacher && (
        <EnrollCodeModal
          visible={enrollOpen}
          onClose={() => setEnrollOpen(false)}
          navigation={navigation}
          onJoined={onEnrolled}
        />
      )}
    </View>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: C.background },

  sidebar: {
    width: 232, backgroundColor: C.dark,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingBottom: 22 },
  brandName: { fontFamily: F.sansBold, fontSize: 16, color: '#fff', letterSpacing: -0.2 },
  brandSub:  { fontFamily: F.mono, fontSize: 9.5, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginTop: 2 },

  navList:   { gap: 2 },
  navItem: {
    height: 42, paddingHorizontal: 12, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  navItemActive:  { backgroundColor: 'rgba(255,255,255,0.08)' },
  navItemPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  navLabel:       { fontFamily: F.sans, fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  navLabelActive: { fontFamily: F.sansMedium, color: '#fff' },
  navDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary },

  userCard: {
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
  },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.sansSemi, fontSize: 13 },
  userName: { color: '#fff', fontFamily: F.sansMedium, fontSize: 13 },
  userSub:  { color: 'rgba(255,255,255,0.55)', fontFamily: F.sans, fontSize: 11 },

  sideBtn: {
    height: 36, paddingHorizontal: 12, borderRadius: 8, justifyContent: 'center',
  },
  sideBtnText: { fontFamily: F.sans, fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  sidebarFooter: {
    marginTop: 12,
    paddingHorizontal: 12,
    fontFamily: F.mono,
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
  },
});
