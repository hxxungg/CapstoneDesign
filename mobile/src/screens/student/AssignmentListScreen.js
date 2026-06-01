import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI, assessmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME, FONTS } from '../../config/api';
import { appAlert } from '../../utils/appAlert';
import AppShell from '../../components/AppShell';

const C = THEME;
const F = FONTS;

// ── 날짜·시간 포맷 ───────────────────────────────────────────────────────────
function formatDateTime(date = new Date()) {
  const d = new Date(date);
  const days  = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const h     = d.getHours();
  const ampm  = h < 12 ? '오전' : '오후';
  const h12   = h % 12 === 0 ? 12 : h % 12;
  const min   = String(d.getMinutes()).padStart(2, '0');
  const ymd   = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return `${ymd} · ${days[d.getDay()]} · ${ampm} ${h12}:${min}`;
}

// 완료 시간 포맷 (예: 2026.05.02 오후 2:30)
function formatDoneTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const h    = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12  = h % 12 === 0 ? 12 : h % 12;
  const min  = String(d.getMinutes()).padStart(2, '0');
  const ymd  = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return `${ymd} ${ampm} ${h12}:${min}`;
}

// ── 상태 뱃지 ────────────────────────────────────────────────────────────────
function StatusBadge({ label, color }) {
  return (
    <View style={[bd.wrap, { backgroundColor: color + '18' }]}>
      <Text style={[bd.text, { color }]}>{label}</Text>
    </View>
  );
}
const bd = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  text: { fontFamily: F.sansSemi, fontSize: 11.5 },
});

// ── 수행평가 카드 (디자인 파일 AssessmentCard 기반) ──────────────────────────
function AssessmentCard({ item, onPress }) {
  const isDone = item.status === 'submitted' || item.status === 'graded' || item.status === 'completed';
  const statusColor = isDone ? C.success : C.primary;
  const statusLabel =
    item.status === 'submitted' ? '제출 완료' :
    item.status === 'graded'    ? '평가 완료' :
    item.status === 'completed' ? '완료' :
    item.total_steps
      ? `${item.current_step || 1} / ${item.total_steps} 단계`
      : item.stage_count
        ? `${item.current_stage_order || 1} / ${item.stage_count} 단계`
        : '진행 중';

  const totalSteps = item.total_steps || item.stage_count || 1;
  const currentStep = item.current_step || item.current_stage_order || 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ac.card, { opacity: pressed ? 0.85 : 1 }]}
    >
      {/* 상단 */}
      <View style={ac.top}>
        <StatusBadge label={statusLabel} color={statusColor} />
        {item.invite_code ? (
          <Text style={ac.code}>코드 {item.invite_code}</Text>
        ) : item.subject ? (
          <Text style={ac.code}>{item.subject}</Text>
        ) : null}
      </View>

      {/* 제목 */}
      <Text style={ac.title} numberOfLines={2}>{item.title}</Text>
      {item.description ? (
        <Text style={ac.desc} numberOfLines={2}>{item.description}</Text>
      ) : null}

      {/* 단계 도트 (디자인 파일 스타일) */}
      <View style={ac.dots}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View key={i} style={[ac.dot, { backgroundColor: i < currentStep ? C.text : C.border }]} />
        ))}
      </View>

      {/* 하단 */}
      <View style={ac.footer}>
        {item.teacher_name ? (
          <Text style={ac.teacher}>{item.teacher_name} 선생님</Text>
        ) : (
          <Text style={ac.teacher}>{currentStep} of {totalSteps} 단계</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[ac.action, { color: statusColor }]}>
            {isDone ? '결과 보기' : currentStep === 0 ? '참여하기' : '이어서'}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={statusColor} />
        </View>
      </View>
    </Pressable>
  );
}

const ac = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 14, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
    gap: 12,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 6, elevation: 2,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { fontFamily: F.mono, fontSize: 11, color: C.textFaint, letterSpacing: 0.5 },
  title: {
    fontFamily: F.serifKo, fontSize: 18,
    color: C.text, letterSpacing: -0.2, lineHeight: 26,
  },
  desc: { fontFamily: F.sans, fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  dots: { flexDirection: 'row', gap: 4 },
  dot:  { flex: 1, height: 3, borderRadius: 2 },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 10,
  },
  teacher: { fontFamily: F.mono, fontSize: 11.5, color: C.textSecondary },
  action:  { fontFamily: F.sansMedium, fontSize: 13 },
});

// ── 메인 화면 ────────────────────────────────────────────────────────────────
export default function AssignmentListScreen({ navigation }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = async () => {
    try {
      const results = await Promise.allSettled([
        assignmentAPI.getList(),
        assessmentAPI.getMyParticipations(),
      ]);
      const oldList = results[0].status === 'fulfilled' ? results[0].value : [];
      const newList = results[1].status === 'fulfilled' ? results[1].value : [];
      const oldItems = (oldList || []).map(a => ({ ...a, _type: 'assignment' }));
      const newItems = (newList || []).map(p => ({
        id: p.id, _type: 'assessment',
        participation_id: p.id, assessment_id: p.assessment_id,
        title: p.assessment_title, description: p.assessment_description,
        status: p.status, current_step: p.current_step, total_steps: p.total_steps,
        invite_code: p.invite_code, created_at: p.created_at,
      }));
      const merged = [...newItems, ...oldItems].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setItems(merged);
    } catch (err) {
      appAlert('오류', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  const handlePress = (item) => {
    if (item._type === 'assessment') {
      const isDone = item.status === 'submitted' || item.status === 'completed' || item.status === 'graded';
      if (isDone) {
        // 완료된 수행평가 → 자기 분석 리포트
        navigation.navigate('StudentSelfReport', {
          participationId: item.participation_id,
          assessmentTitle: item.title,
        });
      } else {
        navigation.navigate('Work', { participation_id: item.participation_id });
      }
    } else {
      navigation.navigate('StageList', { assignment: item });
    }
  };

  const inProgress = items.filter(i => i.status !== 'submitted' && i.status !== 'graded' && i.status !== 'completed');
  const done       = items.filter(i => i.status === 'submitted' || i.status === 'graded' || i.status === 'completed');

  return (
    <AppShell navigation={navigation} currentScreen="home" onEnrolled={loadAll}>
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAll(); }}
            tintColor={C.primary} colors={[C.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── 인사말 ─────────────────────────────────────────── */}
        <View style={s.greeting}>
          <Text style={s.greetingDate}>{formatDateTime()}</Text>
          <Text style={s.greetingDesc}>
            {loading
              ? '수행평가를 불러오는 중...'
              : inProgress.length > 0
                ? `진행 중인 수행평가가 ${inProgress.length}건 있습니다.`
                : '현재 진행 중인 수행평가가 없습니다.'
            }
          </Text>
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        ) : (
          <>
            {/* ── 진행 중 ─────────────────────────────────────── */}
            {inProgress.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHead}>
                  <Text style={s.sectionTitle}>참여 중인 수행평가</Text>
                  <Text style={s.sectionCount}>{inProgress.length}건</Text>
                </View>
                {inProgress.map(item => (
                  <AssessmentCard key={`${item._type}-${item.id}`} item={item} onPress={() => handlePress(item)} />
                ))}
              </View>
            )}

            {/* ── 완료 ────────────────────────────────────────── */}
            {done.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHead}>
                  <Text style={s.sectionTitle}>완료된 수행평가</Text>
                  <Text style={s.sectionCount}>{done.length}건</Text>
                </View>
                <View style={s.pastList}>
                  {done.map((item, i) => (
                    <Pressable
                      key={`${item._type}-${item.id}`}
                      onPress={() => handlePress(item)}
                      style={({ pressed }) => [
                        s.pastRow,
                        i > 0 && s.pastBorder,
                        { backgroundColor: pressed ? C.cardLo : 'transparent' },
                      ]}
                    >
                      {/* 날짜 (날짜만, 시간 제외) */}
                      <Text style={s.pastDate} numberOfLines={2}>
                        {(item.updated_at || item.created_at)
                          ? (() => { const d = new Date(item.updated_at || item.created_at); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })()
                          : ''}
                      </Text>

                      {/* 과목 + 제목 */}
                      <View style={{ flex: 1 }}>
                        <Text style={s.pastSubject} numberOfLines={1}>
                          {item.subject || '수행평가'}
                        </Text>
                        <Text style={s.pastTitle} numberOfLines={2}>{item.title}</Text>
                      </View>

                      {/* 상태 + 화살표 */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <StatusBadge
                          label={item.status === 'graded' ? '평가 완료' : '제출 완료'}
                          color={C.success}
                        />
                        <Ionicons name="chevron-forward" size={16} color={C.textFaint} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* ── 빈 상태 ─────────────────────────────────────── */}
            {items.length === 0 && (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Ionicons name="book-outline" size={32} color={C.textSecondary} />
                </View>
                <Text style={s.emptyTitle}>참여 중인 수행평가가 없습니다</Text>
                <Text style={s.emptyDesc}>교사에게 수행평가 코드를 받아 참여할 수 있습니다.</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
    </AppShell>
  );
}

const s = StyleSheet.create({
  content: { paddingBottom: 60 },

  // 인사말
  greeting: {
    paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32,
    gap: 0,
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

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },

  // 섹션
  section: { paddingHorizontal: 16, marginBottom: 12 },
  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 14, paddingHorizontal: 2,
  },
  sectionTitle: { fontFamily: F.sansSemi, fontSize: 16, color: C.text },
  sectionCount: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary },

  // 완료 목록
  pastList: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, overflow: 'hidden',
  },
  pastRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  pastBorder: { borderTopWidth: 1, borderTopColor: C.borderSoft },
  pastDate:    { width: 80, fontFamily: F.mono, fontSize: 11, color: C.textSecondary, lineHeight: 16, marginRight: 12, flexShrink: 0 },
  pastSubject: { fontFamily: F.sans, fontSize: 11, color: C.textSecondary, marginBottom: 3 },
  pastTitle:   { fontFamily: F.serifKo, fontSize: 15, color: C.text, lineHeight: 21 },

  // 빈 상태
  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyTitle: { fontFamily: F.sansSemi, fontSize: 17, color: C.text, marginBottom: 8 },
  emptyDesc: { fontFamily: F.sans, fontSize: 13.5, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },

});
