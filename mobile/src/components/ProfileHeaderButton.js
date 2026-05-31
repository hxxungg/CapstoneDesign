import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { THEME } from '../config/api';
import { appAlert } from '../utils/appAlert';

// 공통 확인 모달 (로그아웃 / 회원탈퇴 / 기타)
function ConfirmModal({ visible, onClose, icon, iconBg, title, message, confirmText, confirmColor, onConfirm, loading }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={cm.overlay} onPress={onClose}>
        <Pressable style={cm.card} onPress={() => {}}>
          <View style={[cm.iconWrap, { backgroundColor: iconBg }]}>
            <Ionicons name={icon} size={28} color="#fff" />
          </View>
          <Text style={cm.title}>{title}</Text>
          <Text style={cm.message}>{message}</Text>
          <View style={cm.btnRow}>
            <TouchableOpacity style={cm.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={cm.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cm.confirmBtn, { backgroundColor: confirmColor }, loading && cm.disabled]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={cm.confirmText}>{confirmText}</Text>
              }
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ProfileHeaderButton() {
  const { user, logout } = useAuth();

  const [menuVisible, setMenuVisible] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const closeMenu = () => setMenuVisible(false);

  const openPwModal = () => {
    closeMenu();
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setPwModalVisible(true);
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      appAlert('입력 오류', '모든 항목을 입력해주세요.', null, { type: 'warning' });
      return;
    }
    if (newPw.length < 6) {
      appAlert('입력 오류', '새 비밀번호는 6자 이상이어야 합니다.', null, { type: 'warning' });
      return;
    }
    if (newPw !== confirmPw) {
      appAlert('입력 오류', '새 비밀번호가 일치하지 않습니다.', null, { type: 'warning' });
      return;
    }
    setPwLoading(true);
    try {
      await authAPI.changePassword({ current_password: currentPw, new_password: newPw });
      setPwModalVisible(false);
      appAlert('완료', '비밀번호가 변경되었습니다.', null, { type: 'success' });
    } catch (err) {
      appAlert('실패', err.message, null, { type: 'error' });
    } finally {
      setPwLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await authAPI.deleteAccount();
      setDeleteModal(false);
      logout();
    } catch (err) {
      setDeleteModal(false);
      appAlert('오류', err.message, null, { type: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      {/* 헤더 오른쪽 버튼 */}
      <View style={styles.row}>
        <TouchableOpacity style={styles.profileBtn} onPress={() => setMenuVisible(true)} activeOpacity={0.75}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={14} color="#fff" />
          </View>
          <Text style={styles.nameText} numberOfLines={1}>
            {user?.name ?? '사용자'}
          </Text>
          <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={() => setLogoutModal(true)} activeOpacity={0.75}>
          <Ionicons name="log-out-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 드롭다운 메뉴 */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu} statusBarTranslucent>
        <Pressable style={styles.overlay} onPress={closeMenu}>
          <View style={styles.menuCard}>
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatar}>
                <Ionicons name="person" size={18} color={THEME.primary} />
              </View>
              <View>
                <Text style={styles.menuName}>{user?.name ?? '사용자'}</Text>
                <Text style={styles.menuRole}>{user?.role === 'teacher' ? '교사' : '학생'}</Text>
              </View>
            </View>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={openPwModal} activeOpacity={0.7}>
              <Ionicons name="lock-closed-outline" size={18} color={THEME.text} style={styles.menuIcon} />
              <Text style={styles.menuItemText}>비밀번호 변경</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => { closeMenu(); setTimeout(() => setDeleteModal(true), 200); }}
              activeOpacity={0.7}
            >
              <Ionicons name="person-remove-outline" size={18} color={THEME.danger} style={styles.menuIcon} />
              <Text style={[styles.menuItemText, { color: THEME.danger }]}>회원탈퇴</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* 로그아웃 확인 모달 */}
      <ConfirmModal
        visible={logoutModal}
        onClose={() => setLogoutModal(false)}
        icon="log-out-outline"
        iconBg="#F97316"
        title="로그아웃"
        message="로그아웃 하시겠습니까?"
        confirmText="로그아웃"
        confirmColor={THEME.primary}
        onConfirm={() => { setLogoutModal(false); logout(); }}
      />

      {/* 회원탈퇴 확인 모달 */}
      <ConfirmModal
        visible={deleteModal}
        onClose={() => !deleteLoading && setDeleteModal(false)}
        icon="warning-outline"
        iconBg={THEME.danger}
        title="회원탈퇴"
        message={`탈퇴하면 모든 데이터가\n영구적으로 삭제됩니다.\n\n정말 탈퇴하시겠습니까?`}
        confirmText="탈퇴하기"
        confirmColor={THEME.danger}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
      />

      {/* 비밀번호 변경 모달 */}
      <Modal visible={pwModalVisible} transparent animationType="slide" onRequestClose={() => setPwModalVisible(false)} statusBarTranslucent>
        <Pressable style={styles.overlay} onPress={() => setPwModalVisible(false)}>
          <Pressable style={styles.pwCard} onPress={Keyboard.dismiss}>
            <Text style={styles.pwTitle}>비밀번호 변경</Text>
            <Text style={styles.pwLabel}>현재 비밀번호</Text>
            <TextInput style={styles.pwInput} value={currentPw} onChangeText={setCurrentPw} secureTextEntry placeholder="현재 비밀번호" placeholderTextColor="#94A3B8" autoCapitalize="none" />
            <Text style={styles.pwLabel}>새 비밀번호</Text>
            <TextInput style={styles.pwInput} value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="새 비밀번호 (6자 이상)" placeholderTextColor="#94A3B8" autoCapitalize="none" />
            <Text style={styles.pwLabel}>새 비밀번호 확인</Text>
            <TextInput style={styles.pwInput} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry placeholder="새 비밀번호 재입력" placeholderTextColor="#94A3B8" autoCapitalize="none" />
            <View style={styles.pwBtnRow}>
              <TouchableOpacity style={styles.pwCancelBtn} onPress={() => setPwModalVisible(false)} disabled={pwLoading}>
                <Text style={styles.pwCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pwConfirmBtn, pwLoading && styles.btnDisabled]} onPress={handleChangePassword} disabled={pwLoading}>
                {pwLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.pwConfirmText}>변경</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// 공통 확인 모달 스타일
const cm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: THEME.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  disabled: { opacity: 0.6 },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
    gap: 4,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 80,
  },
  logoutBtn: {
    padding: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'ios' ? 96 : 64,
    paddingRight: 12,
  },
  menuCard: {
    backgroundColor: THEME.card,
    borderRadius: 14,
    minWidth: 200,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: THEME.dark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: THEME.primaryLight,
  },
  menuAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuName: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
  },
  menuRole: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: THEME.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  menuIcon: { marginRight: 12 },
  menuItemText: {
    fontSize: 15,
    color: THEME.text,
    fontWeight: '500',
  },
  // 비밀번호 변경
  pwCard: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 24,
    width: '88%',
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: THEME.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 8,
  },
  pwTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  pwLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textSoft,
    marginBottom: 6,
    marginTop: 12,
  },
  pwInput: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: THEME.text,
    backgroundColor: THEME.background,
  },
  pwBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  pwCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  pwCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  pwConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: THEME.primary,
    alignItems: 'center',
  },
  pwConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  btnDisabled: { opacity: 0.6 },
});
