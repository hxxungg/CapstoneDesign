import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { THEME, FONTS } from '../../config/api';
import AppShell from '../../components/AppShell';
import GradingRubricTable, { createDefaultRubricState } from '../../components/GradingRubricTable';

const C = THEME;
const F = FONTS;

export default function GradingRubricScreen({ navigation, route }) {
  const assessment = route.params?.assessment ?? null;
  const initialDraft = route.params?.rubricDraft ?? null;

  const [rubric, setRubric] = useState(() => createDefaultRubricState(initialDraft));

  useFocusEffect(
    useCallback(() => {
      if (route.params?.rubricDraft) {
        setRubric(createDefaultRubricState(route.params.rubricDraft));
      }
    }, [route.params?.rubricDraft])
  );

  const goBackWithDraft = () => {
    navigation.navigate('CreateAssignment', {
      assessment,
      rubricDraft: rubric,
    });
  };

  return (
    <AppShell navigation={navigation} currentScreen="create">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: C.background }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.headerRow}>
            <Pressable
              onPress={goBackWithDraft}
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={18} color={C.text} />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={s.pageTag}>평가 설계</Text>
            </View>
          </View>

          <View style={s.section}>
            <GradingRubricTable value={rubric} onChange={setRubric} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

const s = StyleSheet.create({
  scrollContent: { paddingBottom: 60 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
  },
  backBtn: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
  },
  pageTag: {
    fontFamily: F.mono,
    fontSize: 11.5,
    color: C.textSecondary,
    letterSpacing: 1.2,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
});
