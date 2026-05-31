import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, Modal, Clipboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { assessmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, FONTS } from '../../config/api';
import { appAlert } from '../../utils/appAlert';
import AppShell from '../../components/AppShell';

const C = THEME;
const F = FONTS;

function formatDateTime(date = new Date()) {
  const d = new Date(date);
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const h    = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12  = h % 12 === 0 ? 12 : h % 12;
  const min  = String(d.getMinutes()).padStart(2, '0');
  const ymd  = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return `${ymd} · ${days[d.getDay()]} · ${ampm} ${h12}:${min}`;
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function TeacherDashboard({ navigation, route }) {
  const { user } = useAuth();
  const [assessments, setAssessments]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [myInviteCode, setMyInviteCode]   = useState(null);
  const [codesLoading, setCodesLoading]   = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [deleting, setDeleting]           = useState(false);
  const [editLoading, setEditLoading]     = useState(null);
  const [codeTarget, setCodeTarget]       = useState(null); // { title, invite_code }

  const loadAssessments = async () => {
    try {
      const data = await assessmentAPI.getList();
      setAssessments(data);
    } catch {
      // 무시
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    loadAssessments();
    // 서브 화면에서 초대코드 확인 버튼 눌렀을 때 자동으로 모달 열기
    if (route?.params?.openInviteCode) {
      openCodeModal();
      navigation.setParams({ openInviteCode: false });
    }
  }, [route?.params?.openInviteCode]));

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

  const handleEditPress = async (item) => {
    setEditLoading(item.id);
    try {
      const detail = await assessmentAPI.getDetail(item.id);
      navigation.navigate('CreateAssignment', { assessment: detail });
    } catch (err) {
      appAlert('오류', err.message);
    } finally {
      setEditLoading(null);
    }
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

  const active = assessments.filter(a => a.status === 'active');
  const closed = assessments.filter(a => a.status !== 'active');

  return (
    <AppShell navigation={navigation} currentScreen="home" onInviteCode={openCodeModal}>
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAssessments(); }}
              tintColor={C.primary} colors={[C.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* ── 인사말 ─────────────────────────────────── */}
          <View style={s.greeting}>
            <Text style={s.greetingDate}>{formatDateTime()}</Text>
            <Text style={s.greetingDesc}>
              {loading
                ? '수행평가를 불러오는 중...'
                : active.length > 0
                  ? `진행 중인 수행평가가 ${active.length}건 있어요.`
                  : '현재 진행 중인 수행평가가 없어요.'
              }
            </Text>
          </View>

          {/* ── KPI ─────────────────────────────────────── */}
          {!loading && (
            <View style={s.kpiStrip}>
              <View style={s.kpiItem}>
                <Text style={s.kpiValue}>{active.length}</Text>
                <Text style={s.kpiLabel}>진행 중</Text>
              </View>
              <View style={s.kpiDivider} />
              <View style={s.kpiItem}>
                <Text style={s.kpiValue}>{closed.length}</Text>
                <Text style={s.kpiLabel}>마감</Text>
              </View>
              <View style={s.kpiDivider} />
              <View style={s.kpiItem}>
                <Text style={s.kpiValue}>{assessments.length}</Text>
                <Text style={s.kpiLabel}>전체</Text>
              </View>
            </View>
          )}

          {/* ── 목록 ─────────────────────────────────────── */}
          {loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          ) : assessments.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="document-text-outline" size={32} color={C.textSecondary} />
              </View>
              <Text style={s.emptyTitle}>생성된 수행평가가 없습니다</Text>
              <Text style={s.emptyDesc}>왼쪽 탭의 평가 생성을 눌러 수행평가를 만드세요.</Text>
            </View>
          ) : (
            <View style={s.section}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>내 수행평가</Text>
                <Text style={s.sectionCount}>{assessments.length}건</Text>
              </View>
              <View style={s.pastList}>
                {assessments.map((item, i) => {
                  const isActive = item.status === 'active';
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => navigation.navigate('StudentList', { assessmentId: item.id, title: item.title })}
                      style={({ pressed }) => [
                        s.pastRow,
                        i > 0 && s.pastBorder,
                        { backgroundColor: pressed ? C.cardLo : 'transparent' },
                      ]}
                    >
                      {/* 날짜 */}
                      <Text style={s.pastDate} numberOfLines={2}>
                        {fmtDate(item.created_at)}
                      </Text>

                      {/* 제목 + 단계 */}
                      <View style={{ flex: 1 }}>
                        <Text style={s.pastSubject} numberOfLines={1}>
                          {(item.step_count ?? 0)}단계
                        </Text>
                        <Text style={s.pastTitle} numberOfLines={2}>{item.title}</Text>
                      </View>

                      {/* 상태 + 초대코드 + 편집 + 삭제 + 화살표 */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[s.statusBadge, isActive ? s.statusActive : s.statusClosed]}>
                          <View style={[s.statusDot, { backgroundColor: isActive ? C.success : C.textFaint }]} />
                          <Text style={[s.statusText, { color: isActive ? C.success : C.textSecondary }]}>
                            {isActive ? '활성' : '마감'}
                          </Text>
                        </View>
                        <Pressable
                          onPress={(e) => { e.stopPropagation?.(); setCodeTarget({ title: item.title, invite_code: item.invite_code }); }}
                          hitSlop={8}
                          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                        >
                          <Ionicons name="key-outline" size={15} color={C.primary} />
                        </Pressable>
                        <Pressable
                          onPress={(e) => { e.stopPropagation?.(); handleEditPress(item); }}
                          hitSlop={8}
                          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                          disabled={editLoading !== null}
                        >
                          {editLoading === item.id
                            ? <ActivityIndicator size="small" color={C.textSecondary} />
                            : <Ionicons name="pencil-outline" size={15} color={C.textSecondary} />
                          }
                        </Pressable>
                        <Pressable
                          onPress={(e) => { e.stopPropagation?.(); setDeleteTarget({ id: item.id, title: item.title }); }}
                          hitSlop={8}
                          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                        >
                          <Ionicons name="trash-outline" size={15} color={C.danger} />
                        </Pressable>
                        <Ionicons name="chevron-forward" size={16} color={C.textFaint} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>

        {/* ── 수행평가별 초대코드 모달 ──────────────────── */}
        <Modal visible={!!codeTarget} transparent animationType="fade" onRequestClose={() => setCodeTarget(null)} statusBarTranslucent>
          <Pressable style={s.overlay} onPress={() => setCodeTarget(null)}>
            <Pressable style={s.modalBox} onPress={() => {}}>
              <Text style={s.modalTitle}>초대 코드 확인</Text>
              <Text style={s.modalSub} numberOfLines={2}>{codeTarget?.title}</Text>
              <View style={{
                backgroundColor: C.primaryLight, borderRadius: 14,
                borderWidth: 1, borderColor: C.primary + '30',
                paddingVertical: 20, paddingHorizontal: 20,
                alignItems: 'center', marginVertical: 8,
              }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.primary, letterSpacing: 1.2, marginBottom: 6 }}>
                  수행평가 초대 코드
                </Text>
                <Text style={{ fontFamily: F.monoMed ?? F.mono, fontSize: 30, color: C.primary, letterSpacing: 6 }}>
                  {codeTarget?.invite_code ?? '-'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable
                  style={({ pressed }) => [s.copyBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                  onPress={() => codeTarget?.invite_code && copyCode(codeTarget.invite_code)}
                >
                  <Ionicons name="copy-outline" size={14} color={C.primary} />
                  <Text style={[s.copyBtnText, { marginLeft: 4 }]}>코드 복사</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.modalCloseBtn, { flex: 1 }, pressed && { opacity: 0.7 }]}
                  onPress={() => setCodeTarget(null)}
                >
                  <Text style={s.modalCloseTxt}>닫기</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── 수업 초대 코드 모달 (사이드바) ───────────── */}
        <Modal visible={codeModalVisible} transparent animationType="fade" onRequestClose={() => setCodeModalVisible(false)} statusBarTranslucent>
          <Pressable style={s.overlay} onPress={() => setCodeModalVisible(false)}>
            <Pressable style={s.modalBox} onPress={() => {}}>
              <Text style={s.modalTitle}>수업 초대 코드</Text>
              <Text style={s.modalSub}>학생 회원가입 시 사용하는 코드입니다</Text>
              {codesLoading ? (
                <ActivityIndicator color={C.primary} style={{ marginVertical: 24 }} />
              ) : (
                <View style={s.codeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.codeTitle}>나의 초대 코드</Text>
                    <Text style={s.codeValue}>{myInviteCode || '-'}</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [s.copyBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => myInviteCode && copyCode(myInviteCode)}
                  >
                    <Text style={s.copyBtnText}>복사</Text>
                  </Pressable>
                </View>
              )}
              <Pressable style={({ pressed }) => [s.modalCloseBtn, pressed && { opacity: 0.7 }]} onPress={() => setCodeModalVisible(false)}>
                <Text style={s.modalCloseTxt}>닫기</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── 삭제 모달 ─────────────────────────────────── */}
        <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteTarget(null)} statusBarTranslucent>
          <View style={s.overlay}>
            <View style={s.modalBox}>
              <View style={s.deleteIconWrap}>
                <Ionicons name="trash-outline" size={28} color={C.danger} />
              </View>
              <Text style={s.modalTitle}>수행평가 삭제</Text>
              <Text style={s.deleteMsg}>
                <Text style={{ fontFamily: F.sansBold, color: C.text }}>"{deleteTarget?.title}"</Text>
                {'\n'}을(를) 삭제하시겠습니까?{'\n'}
                <Text style={{ color: C.danger, fontSize: 13 }}>이 작업은 취소할 수 없습니다.</Text>
              </Text>
              <View style={s.deleteBtns}>
                <Pressable
                  style={({ pressed }) => [s.deleteCancelBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  <Text style={s.deleteCancelTxt}>취소</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.deleteConfirmBtn, (pressed || deleting) && { opacity: 0.7 }]}
                  onPress={handleDeleteConfirm}
                  disabled={deleting}
                >
                  {deleting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.deleteConfirmTxt}>삭제</Text>
                  }
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </AppShell>
  );
}

const s = StyleSheet.create({
  content: { paddingBottom: 60 },

  // 인사말
  greeting: {
    paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 0,
  },
  greetingDate: {
    fontFamily: F.mono, fontSize: 11.5, color: C.textSecondary,
    letterSpacing: 1.5, marginBottom: 10,
  },
  greetingName: {
    fontFamily: F.serifKo, fontSize: 32, color: C.text,
    letterSpacing: -0.5, lineHeight: 42, marginBottom: 10,
  },
  greetingDesc: {
    fontFamily: F.sans, fontSize: 14.5, color: C.textSoft, lineHeight: 22,
  },

  // KPI
  kpiStrip: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingVertical: 16,
  },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiValue: { fontFamily: F.sansBold, fontSize: 22, color: C.text, letterSpacing: -0.5 },
  kpiLabel: { fontFamily: F.sans, fontSize: 11.5, color: C.textSecondary, marginTop: 2 },
  kpiDivider: { width: 1, backgroundColor: C.border, marginVertical: 6 },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },

  // 섹션
  section: { paddingHorizontal: 16, marginBottom: 12 },
  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 14, paddingHorizontal: 2,
  },
  sectionTitle: { fontFamily: F.sansSemi, fontSize: 16, color: C.text },
  sectionCount: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary },

  // 목록 (학생 pastList 동일 스타일)
  pastList: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, overflow: 'hidden',
  },
  pastRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  pastBorder: { borderTopWidth: 1, borderTopColor: C.borderSoft },
  pastDate:    { width: 76, fontFamily: F.mono, fontSize: 11, color: C.textSecondary, lineHeight: 16, flexShrink: 0 },
  pastSubject: { fontFamily: F.sans, fontSize: 11, color: C.textSecondary, marginBottom: 3 },
  pastTitle:   { fontFamily: F.serifKo, fontSize: 15, color: C.text, lineHeight: 21 },

  // 상태 뱃지
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusActive: { backgroundColor: C.successLight },
  statusClosed: { backgroundColor: C.borderSoft },
  statusDot:  { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontFamily: F.sansSemi, fontSize: 11 },

  // 빈 상태
  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyTitle: { fontFamily: F.sansSemi, fontSize: 17, color: C.text, marginBottom: 8 },
  emptyDesc:  { fontFamily: F.sans, fontSize: 13.5, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },

  // 모달
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,27,45,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalBox: {
    width: 340, padding: 24, borderRadius: 16,
    backgroundColor: C.background,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  modalTitle: { fontFamily: F.serifKo, fontSize: 20, color: C.text, marginBottom: 4, textAlign: 'center' },
  modalSub:   { fontFamily: F.sans, fontSize: 13, color: C.textSecondary, marginBottom: 20, textAlign: 'center' },
  codeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, marginBottom: 4,
  },
  codeTitle: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, marginBottom: 4 },
  codeValue: { fontFamily: F.mono, fontSize: 22, color: C.primary, letterSpacing: 2 },
  copyBtn:     { backgroundColor: C.primaryLight, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, marginLeft: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  copyBtnText: { fontFamily: F.sansSemi, fontSize: 13, color: C.primary },
  modalCloseBtn: { marginTop: 14, alignItems: 'center', padding: 12, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  modalCloseTxt: { fontFamily: F.sansMedium, fontSize: 14, color: C.textSecondary },

  deleteIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.dangerLight, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  deleteMsg: { fontFamily: F.sans, fontSize: 14.5, color: C.text, textAlign: 'center', lineHeight: 24, marginVertical: 10 },
  deleteBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  deleteCancelBtn:  { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  deleteConfirmBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.danger },
  deleteCancelTxt:  { fontFamily: F.sansMedium, fontSize: 15, color: C.textSecondary },
  deleteConfirmTxt: { fontFamily: F.sansMedium, fontSize: 15, color: '#fff' },
});
