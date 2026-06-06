import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { THEME, FONTS } from '../config/api';

const C = THEME;
const F = FONTS;

export default function MasterHubScreen({ navigation }) {
  const { user, setMasterViewMode } = useAuth();

  const goTeacher = () => {
    setMasterViewMode('teacher');
    navigation.navigate('TeacherDashboard');
  };

  const goStudent = () => {
    setMasterViewMode('student');
    navigation.navigate('AssignmentList');
  };

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.badge}>MASTER</Text>
        <Text style={s.title}>관리자 화면</Text>
        <Text style={s.sub}>{user?.email}</Text>
        <Text style={s.desc}>교사·학생 화면의 전체 데이터를 조회할 수 있습니다.</Text>
      </View>

      <Pressable style={({ pressed }) => [s.card, pressed && s.cardPressed]} onPress={goTeacher}>
        <View style={[s.iconWrap, { backgroundColor: C.primaryLight }]}>
          <Ionicons name="school-outline" size={28} color={C.primary} />
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardTitle}>교사 화면</Text>
          <Text style={s.cardDesc}>모든 수행평가, 학생 분석, 채점 정보</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />
      </Pressable>

      <Pressable style={({ pressed }) => [s.card, pressed && s.cardPressed]} onPress={goStudent}>
        <View style={[s.iconWrap, { backgroundColor: C.successLight }]}>
          <Ionicons name="person-outline" size={28} color={C.success} />
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardTitle}>학생 화면</Text>
          <Text style={s.cardDesc}>모든 학생의 참여·제출·수행 기록</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: C.background,
    padding: 24,
    gap: 16,
    justifyContent: 'center',
  },
  header: { marginBottom: 12, gap: 6 },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: F.mono,
    fontSize: 11,
    color: C.primary,
    backgroundColor: C.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  title: { fontFamily: F.serifKo, fontSize: 28, color: C.text },
  sub: { fontFamily: F.sans, fontSize: 14, color: C.textSecondary },
  desc: { fontFamily: F.sans, fontSize: 13, color: C.textSoft, lineHeight: 20, marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardPressed: { opacity: 0.85 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontFamily: F.sansSemi, fontSize: 17, color: C.text },
  cardDesc: { fontFamily: F.sans, fontSize: 13, color: C.textSecondary, lineHeight: 18 },
});
