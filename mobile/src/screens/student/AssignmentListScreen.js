import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI, assessmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME } from '../../config/api';
import { appAlert } from '../../utils/appAlert';

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

      // 구 시스템 항목: type='assignment'
      const oldItems = (oldList || []).map(a => ({ ...a, _type: 'assignment' }));

      // 신규 시스템 항목: type='assessment'
      const newItems = (newList || []).map(p => ({
        id: p.id,
        _type: 'assessment',
        participation_id: p.id,
        assessment_id: p.assessment_id,
        title: p.assessment_title,
        description: p.assessment_description,
        status: p.status,
        current_step: p.current_step,
        total_steps: p.total_steps,
        invite_code: p.invite_code,
        created_at: p.created_at,
      }));

      // 최신순 정렬
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

  const renderItem = ({ item }) => {
    if (item._type === 'assessment') {
      return <AssessmentCard item={item} navigation={navigation} />;
    }
    return <AssignmentCard item={item} navigation={navigation} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.welcomeBox}>
        <Text style={styles.welcomeText}>
          안녕하세요, <Text style={styles.welcomeName}>{user?.name}</Text>님!
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={item => `${item._type}-${item.id}`}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAll(); }}
              tintColor={THEME.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📚</Text>
              <Text style={styles.emptyTitle}>참여 중인 수행평가가 없습니다</Text>
              <Text style={styles.emptyDesc}>교사에게 수행평가 코드를 받아 참여하세요.</Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}

      <TouchableOpacity
        style={styles.enrollButton}
        onPress={() => navigation.navigate('Enroll')}
      >
        <Text style={styles.enrollButtonText}>+ 수행평가 참여하기</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── 신규 assessments 카드 ──────────────────────────────────────────
function AssessmentCard({ item, navigation }) {
  const statusColor =
    item.status === 'submitted' || item.status === 'graded'
      ? THEME.success
      : THEME.primary;
  const statusLabel =
    item.status === 'submitted' ? '제출 완료' :
    item.status === 'graded'    ? '평가 완료' :
    `${item.current_step || 1}/${item.total_steps || '?'} 단계`;

  return (
    <TouchableOpacity
      style={[styles.card, styles.assessmentCard]}
      onPress={() =>
        navigation.navigate('StageList', {
          participation_id: item.participation_id,
          assessment_id: item.assessment_id,
          title: item.title,
        })
      }
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.inviteCode}>코드: {item.invite_code}</Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(((item.current_step - 1) / Math.max(item.total_steps, 1)) * 100, 100)}%`,
                backgroundColor: statusColor,
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── 구 assignments 카드 ───────────────────────────────────────────
function AssignmentCard({ item, navigation }) {
  const statusInfo =
    item.status === 'completed'
      ? { label: '완료', color: THEME.success }
      : { label: `${item.current_stage_order}/${item.stage_count} 단계`, color: THEME.primary };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('StageList', { assignment: item })}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {item.subject ? <Text style={styles.subject}>{item.subject}</Text> : null}
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.teacherName}>👩‍🏫 {item.teacher_name}</Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(((item.current_stage_order - 1) / Math.max(item.stage_count, 1)) * 100, 100)}%`,
                backgroundColor: item.status === 'completed' ? THEME.success : THEME.primary,
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  welcomeBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: THEME.card, paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  welcomeText: { fontSize: 15, color: THEME.text },
  welcomeName: { fontWeight: 'bold', color: THEME.primary },
  list: { padding: 16 },
  card: {
    backgroundColor: THEME.card, borderRadius: 16, marginBottom: 14,
    padding: 18, shadowColor: THEME.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 8, elevation: 3,
  },
  assessmentCard: {
    borderWidth: 1.5, borderColor: THEME.primary + '55',
  },
  cardHeader: { marginBottom: 12 },
  cardTitleRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  newBadge: {
    backgroundColor: THEME.primary, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
  },
  newBadgeText: { fontSize: 10, color: '#fff', fontWeight: '800' },
  subject: { fontSize: 12, color: THEME.textSecondary, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: THEME.textSecondary, lineHeight: 18 },
  cardFooter: { gap: 8 },
  teacherName: { fontSize: 13, color: THEME.textSecondary },
  inviteCode: { fontSize: 12, color: THEME.textSecondary },
  progressBar: { height: 6, backgroundColor: THEME.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center' },
  enrollButton: {
    margin: 16, backgroundColor: THEME.primary, borderRadius: 14,
    padding: 16, alignItems: 'center',
  },
  enrollButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
