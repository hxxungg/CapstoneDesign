import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, Clipboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assessmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME } from '../../config/api';
import { appAlert } from '../../utils/appAlert';

export default function TeacherDashboard({ navigation }) {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 초대 코드 확인 모달 (교사 class 코드)
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [myInviteCode, setMyInviteCode] = useState(null);
  const [codesLoading, setCodesLoading] = useState(false);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title }
  const [deleting, setDeleting] = useState(false);

  const loadAssessments = async () => {
    try {
      const data = await assessmentAPI.getList();
      setAssessments(data);
    } catch (err) {
      // 목록 로드 실패 시 무시
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadAssessments(); }, []));

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
    appAlert('복사 완료', `코드 ${code}가 복사되었습니다.`);
  };

  const confirmDelete = (item) => {
    setDeleteTarget({ id: item.id, title: item.title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await assessmentAPI.remove(deleteTarget.id);
      setDeleteTarget(null);
      await loadAssessments();
    } catch (err) {
      setDeleteTarget(null);
      appAlert('오류', err.message);
    } finally {
      setDeleting(false);
    }
  };

  const statusLabel = (status) => status === 'active' ? '● 활성' : '○ 마감';
  const statusColor = (status) => status === 'active' ? THEME.success : THEME.textSecondary;
  const statusBg = (status) => status === 'active' ? THEME.successLight : '#f5f5f5';

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardMain}
        onPress={() => navigation.navigate('AssignmentDetail', { assignment: item })}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusBg(item.status) }]}>
            <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
              {statusLabel(item.status)}
            </Text>
          </View>
          {item.invite_code && (
            <TouchableOpacity style={styles.codeChip} onPress={() => copyCode(item.invite_code)}>
              <Text style={styles.codeChipText}>🔑 {item.invite_code}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <View style={styles.cardStats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.step_count ?? 0}</Text>
            <Text style={styles.statLabel}>단계</Text>
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
          onPress={() => confirmDelete(item)}
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
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={assessments}
          renderItem={renderItem}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAssessments(); }}
              tintColor={THEME.primary}
            />
          }
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

      {/* 교사 클래스 초대 코드 모달 */}
      <Modal visible={codeModalVisible} transparent animationType="fade" onRequestClose={() => setCodeModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCodeModalVisible(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>수업 초대 코드</Text>
            <Text style={styles.modalSubtitle}>학생 회원가입 시 사용하는 코드입니다</Text>
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

      {/* 수행평가 삭제 확인 모달 */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.deleteModalIcon}>🗑️</Text>
            <Text style={styles.modalTitle}>수행평가 삭제</Text>
            <Text style={styles.deleteModalMsg}>
              <Text style={styles.deleteModalTitle}>"{deleteTarget?.title}"</Text>
              {'\n'}을(를) 삭제하시겠습니까?{'\n'}
              <Text style={styles.deleteModalWarn}>이 작업은 취소할 수 없습니다.</Text>
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={[styles.deleteModalBtn, styles.deleteModalCancelBtn]}
                onPress={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                <Text style={styles.deleteModalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteModalBtn, styles.deleteModalConfirmBtn, deleting && styles.btnDisabled]}
                onPress={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.deleteModalConfirmText}>삭제</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  list: { padding: 16 },
  card: {
    backgroundColor: THEME.card, borderRadius: 16, marginBottom: 14,
    shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  cardMain: { padding: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  codeChip: {
    backgroundColor: THEME.primaryLight, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, borderColor: THEME.primary,
  },
  codeChipText: { fontSize: 12, color: THEME.primary, fontWeight: '700', letterSpacing: 1 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: THEME.textSecondary, lineHeight: 18, marginBottom: 12 },
  cardStats: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 15, fontWeight: 'bold', color: THEME.primary },
  statLabel: { fontSize: 11, color: THEME.textSecondary, marginTop: 2 },
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
  // 공통 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 4, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: THEME.textSecondary, marginBottom: 20, textAlign: 'center' },
  codeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: THEME.border },
  codeInfo: { flex: 1 },
  codeTitle: { fontSize: 13, color: THEME.textSecondary, marginBottom: 4 },
  codeValue: { fontSize: 20, fontWeight: 'bold', color: THEME.primary, letterSpacing: 2 },
  copyButton: { backgroundColor: THEME.primaryLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 12 },
  copyButtonText: { fontSize: 13, color: THEME.primary, fontWeight: '700' },
  modalCloseButton: { marginTop: 20, alignItems: 'center', padding: 12, backgroundColor: THEME.background, borderRadius: 10 },
  modalCloseText: { fontSize: 14, color: THEME.textSecondary, fontWeight: '600' },
  // 삭제 모달
  deleteModalIcon: { fontSize: 40, textAlign: 'center', marginBottom: 12 },
  deleteModalMsg: { fontSize: 15, color: THEME.text, textAlign: 'center', lineHeight: 24, marginVertical: 12 },
  deleteModalTitle: { fontWeight: 'bold', color: THEME.text },
  deleteModalWarn: { fontSize: 13, color: THEME.danger },
  deleteModalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  deleteModalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  deleteModalCancelBtn: { backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border },
  deleteModalConfirmBtn: { backgroundColor: THEME.danger },
  deleteModalCancelText: { fontSize: 15, fontWeight: '600', color: THEME.textSecondary },
  deleteModalConfirmText: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
});
