import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, Clipboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI, assessmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME } from '../../config/api';
import { appAlert } from '../../utils/appAlert';

export default function TeacherDashboard({ navigation }) {
  const { user, logout } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [myInviteCode, setMyInviteCode] = useState(null);
  const [codesLoading, setCodesLoading] = useState(false);

  const loadAssignments = async () => {
    try {
      const data = await assignmentAPI.getList();
      setAssignments(data);
    } catch (err) {
      // 아직 구현 중인 API - 무시
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openCodeModal = async () => {
    setCodeModalVisible(true);
    if (myInviteCode) return;
    setCodesLoading(true);
    try {
      const data = await assessmentAPI.getMyInviteCode();
      setMyInviteCode(data.invite_code);
    } catch (err) {
      appAlert('오류', err.message);
    } finally {
      setCodesLoading(false);
    }
  };

  const copyCode = (code) => {
    Clipboard.setString(code);
    appAlert('복사 완료', `초대 코드 ${code}가 복사되었습니다.`);
  };

  useFocusEffect(
    useCallback(() => { loadAssignments(); }, [])
  );

  const handleDelete = (item) => {
    appAlert(
      '수행평가 삭제',
      `"${item.title}"을 삭제하시겠습니까?\n이 작업은 취소할 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: () => {
            const id = Number(item.id);
            setTimeout(() => {
              (async () => {
                try {
                  await assignmentAPI.remove(id);
                  await loadAssignments();
                } catch (err) {
                  appAlert('오류', err.message);
                }
              })();
            }, 0);
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardMain}
        onPress={() => navigation.navigate('AssignmentDetail', { assignment: item })}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          {item.subject && <Text style={styles.subject}>{item.subject}</Text>}
          <View style={[styles.statusBadge, { backgroundColor: item.is_active ? THEME.successLight : '#f5f5f5' }]}>
            <Text style={[styles.statusText, { color: item.is_active ? THEME.success : THEME.textSecondary }]}>
              {item.is_active ? '● 활성' : '○ 비활성'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.description && <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>}
        <View style={styles.cardStats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.stage_count}</Text>
            <Text style={styles.statLabel}>단계</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.student_count}</Text>
            <Text style={styles.statLabel}>참여 학생</Text>
          </View>
        </View>
      </TouchableOpacity>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Analytics', { assignmentId: item.id, title: item.title })}
        >
          <Text style={styles.actionButtonText}>📊 분석</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonDanger]}
          onPress={() => handleDelete(item)}
        >
          <Text style={styles.actionButtonTextDanger}>🗑 삭제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.welcomeBox}>
        <View style={styles.welcomeLeft}>
          <Text style={styles.welcomeText}>
            안녕하세요, <Text style={styles.welcomeName}>{user?.name}</Text> 선생님!
          </Text>
          <TouchableOpacity style={styles.codeButton} onPress={openCodeModal}>
            <Text style={styles.codeButtonText}>초대 코드 확인</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={assignments}
          renderItem={renderItem}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAssignments(); }} tintColor={THEME.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>생성된 수행평가가 없습니다</Text>
              <Text style={styles.emptyDesc}>아래 버튼을 눌러 수행평가를 생성하세요.</Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('CreateAssignment')}
      >
        <Text style={styles.createButtonText}>+ 수행평가 생성</Text>
      </TouchableOpacity>

      {/* 초대 코드 팝업 */}
      <Modal
        visible={codeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCodeModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCodeModalVisible(false)}
        >
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>수행평가 초대 코드</Text>
            <Text style={styles.modalSubtitle}>학생들에게 코드를 공유하세요</Text>

            {codesLoading ? (
              <ActivityIndicator color={THEME.primary} style={{ marginVertical: 24 }} />
            ) : (
              <View style={styles.codeRow}>
                <View style={styles.codeInfo}>
                  <Text style={styles.codeTitle}>나의 초대 코드</Text>
                  <Text style={styles.codeValue}>{myInviteCode || '-'}</Text>
                </View>
                <TouchableOpacity style={styles.copyButton} onPress={() => myInviteCode && copyCode(myInviteCode)}>
                  <Text style={styles.copyButtonText}>복사</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCodeModalVisible(false)}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  welcomeBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: THEME.card, paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  welcomeLeft: { flex: 1 },
  welcomeText: { fontSize: 15, color: THEME.text },
  welcomeName: { fontWeight: 'bold', color: THEME.primary },
  codeButton: {
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: THEME.primaryLight, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: THEME.primary,
  },
  codeButtonText: { fontSize: 12, color: THEME.primary, fontWeight: '700' },
  logoutText: { fontSize: 13, color: THEME.textSecondary },
  list: { padding: 16 },
  card: {
    backgroundColor: THEME.card, borderRadius: 16, marginBottom: 14,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  cardMain: { padding: 18 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subject: { fontSize: 12, color: THEME.textSecondary, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: THEME.textSecondary, lineHeight: 18, marginBottom: 12 },
  cardStats: { flexDirection: 'row', alignItems: 'center' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 15, fontWeight: 'bold', color: THEME.primary },
  statLabel: { fontSize: 11, color: THEME.textSecondary, marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: THEME.border },
  cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: THEME.border },
  actionButton: { flex: 1, padding: 12, alignItems: 'center', borderRightWidth: 1, borderRightColor: THEME.border },
  actionButtonDanger: { borderRightWidth: 0 },
  actionButtonText: { fontSize: 13, color: THEME.primary, fontWeight: '600' },
  actionButtonTextDanger: { fontSize: 13, color: THEME.danger, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: THEME.textSecondary },
  createButton: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    backgroundColor: THEME.primary, borderRadius: 14, padding: 16, alignItems: 'center',
    shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '85%', maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: THEME.textSecondary, marginBottom: 20 },
  emptyCodeText: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', lineHeight: 22, marginVertical: 16 },
  codeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: THEME.border },
  codeInfo: { flex: 1 },
  codeTitle: { fontSize: 13, color: THEME.textSecondary, marginBottom: 4 },
  codeValue: { fontSize: 20, fontWeight: 'bold', color: THEME.primary, letterSpacing: 2 },
  copyButton: { backgroundColor: THEME.primaryLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 12 },
  copyButtonText: { fontSize: 13, color: THEME.primary, fontWeight: '700' },
  modalCloseButton: { marginTop: 20, alignItems: 'center', padding: 12, backgroundColor: THEME.background, borderRadius: 10 },
  modalCloseText: { fontSize: 14, color: THEME.textSecondary, fontWeight: '600' },
});
