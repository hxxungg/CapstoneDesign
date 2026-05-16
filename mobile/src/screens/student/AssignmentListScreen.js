import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME } from '../../config/api';

export default function AssignmentListScreen({ navigation }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAssignments = async () => {
    try {
      const data = await assignmentAPI.getList();
      setAssignments(data);
    } catch (err) {
      Alert.alert('오류', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAssignments();
    }, [])
  );

  const getStatusLabel = (status, currentStage, stageCount) => {
    if (status === 'completed') return { label: '완료', color: THEME.success };
    return { label: `${currentStage}/${stageCount} 단계`, color: THEME.primary };
  };

  const renderItem = ({ item }) => {
    const statusInfo = getStatusLabel(item.status, item.current_stage_order, item.stage_count);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('StageList', { assignment: item })}
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            {item.subject && <Text style={styles.subject}>{item.subject}</Text>}
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
          </View>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.description && <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>}
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
                }
              ]}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.welcomeBox}>
        <Text style={styles.welcomeText}>안녕하세요, <Text style={styles.welcomeName}>{user?.name}</Text>님!</Text>
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
  cardHeader: { marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  subject: { fontSize: 12, color: THEME.textSecondary, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: THEME.textSecondary, lineHeight: 18 },
  cardFooter: { gap: 8 },
  teacherName: { fontSize: 13, color: THEME.textSecondary },
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
