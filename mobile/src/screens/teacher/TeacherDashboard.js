import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { assignmentAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { THEME } from '../../config/api';

export default function TeacherDashboard({ navigation }) {
  const { user, logout } = useAuth();
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
    useCallback(() => { loadAssignments(); }, [])
  );

  const handleDelete = (item) => {
    Alert.alert(
      '수행평가 삭제',
      `"${item.title}"을 삭제하시겠습니까?\n이 작업은 취소할 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            try {
              await assignmentAPI.delete(item.id);
              loadAssignments();
            } catch (err) {
              Alert.alert('오류', err.message);
            }
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
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.assignment_code}</Text>
            <Text style={styles.statLabel}>참여 코드</Text>
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
      <View style={styles.welcomeBox}>
        <View>
          <Text style={styles.welcomeText}>안녕하세요, <Text style={styles.welcomeName}>{user?.name}</Text> 선생님!</Text>
          <Text style={styles.teacherCode}>교사 코드: <Text style={styles.teacherCodeValue}>{user?.teacher_code}</Text></Text>
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
  teacherCode: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  teacherCodeValue: { fontWeight: '700', color: THEME.secondary, letterSpacing: 1 },
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
});
