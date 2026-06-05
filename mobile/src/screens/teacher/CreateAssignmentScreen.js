import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { assessmentAPI } from '../../services/api';
import { THEME, FONTS } from '../../config/api';
import {
  AI_MODE,
  AI_MODE_LABELS,
  DEFAULT_CONDITIONAL_GUIDANCE,
  getDefaultStagesForNewAssignment,
} from '../../config/defaultPerformanceStages';
import { appAlert } from '../../utils/appAlert';
import { VALIDATION } from '../../utils/uiCopy';
import AppShell from '../../components/AppShell';

const C = THEME;
const F = FONTS;


// ── 스크롤 휠 피커 (iOS 알람 스타일) ─────────────────────────────────────────
const WHEEL_ITEM_H = 48;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD = WHEEL_ITEM_H * Math.floor(WHEEL_VISIBLE / 2);

function WheelPicker({ data, value, onChange }) {
  const ref = useRef(null);
  // 렌더링에 영향 없이 현재 스크롤 인덱스를 추적
  const pendingIdx = useRef(data.indexOf(value));

  useEffect(() => {
    const i = data.indexOf(value);
    if (i < 0) return;
    // requestAnimationFrame: 레이아웃 완료 후 즉시 이동 (web/native 모두 안전)
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollTo({ y: i * WHEEL_ITEM_H, animated: false });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // 스크롤 중 실시간 업데이트 — 스크롤할 때마다 WHEEL_ITEM_H/2 단위로 발화
  const onScroll = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
    const clamped = Math.max(0, Math.min(i, data.length - 1));
    if (pendingIdx.current !== clamped) {
      pendingIdx.current = clamped;
      onChange(data[clamped]);
    }
  };

  // 관성 스크롤 끝날 때 최종 확정
  const onSnap = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
    const clamped = Math.max(0, Math.min(i, data.length - 1));
    pendingIdx.current = clamped;
    onChange(data[clamped]);
  };

  return (
    <View style={{ width: 72, height: WHEEL_ITEM_H * WHEEL_VISIBLE, overflow: 'hidden' }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={WHEEL_ITEM_H / 2}
        contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
        onScroll={onScroll}
        onMomentumScrollEnd={onSnap}
        onScrollEndDrag={onSnap}
      >
        {data.map((item, i) => {
          const sel = item === value;
          return (
            <Pressable
              key={i}
              style={[wh.item, sel && wh.itemSel]}
              onPress={() => {
                pendingIdx.current = i;
                onChange(item);
                ref.current?.scrollTo({ y: i * WHEEL_ITEM_H, animated: true });
              }}
            >
              <Text style={[wh.itemText, sel && wh.itemTextSel]}>
                {String(item).padStart(2, '0')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const wh = StyleSheet.create({
  item: {
    height: WHEEL_ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginHorizontal: 2,
  },
  itemSel: {
    backgroundColor: C.primaryLight,
  },
  itemText:    { fontFamily: F.sans,     fontSize: 17, color: C.textFaint },
  itemTextSel: { fontFamily: F.sansBold, fontSize: 24, color: C.primary },
});
// ─────────────────────────────────────────────────────────────────────────────

// ── 커스텀 달력 + 타임피커 (웹/iOS/Android 공통) ─────────────────────────────
const WEEKDAYS = ['일','월','화','수','목','금','토'];
const MONTHS   = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function InlineDateTimePicker({ value, onConfirm, onCancel }) {
  const init = value instanceof Date && !isNaN(value) ? value : new Date();
  const [viewYear,  setViewYear]  = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth()); // 0-indexed
  const [selYear,   setSelYear]   = useState(init.getFullYear());
  const [selMonth,  setSelMonth]  = useState(init.getMonth());
  const [selDay,    setSelDay]    = useState(init.getDate());
  const [hour,      setHour]      = useState(init.getHours());
  const [min,       setMin]       = useState(init.getMinutes());
  const [step,      setStep]      = useState('date'); // 'date' | 'time'

  const today = new Date();
  today.setHours(0,0,0,0);

  /* 달력 셀 배열 생성 */
  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=일
  const daysInM  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInM; d++) cells.push(d);

  const isSelected = (d) => d === selDay && viewMonth === selMonth && viewYear === selYear;
  const isPast = (d) => {
    const cell = new Date(viewYear, viewMonth, d);
    cell.setHours(0,0,0,0);
    return cell < today;
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const selectDay = (d) => {
    if (!d || isPast(d)) return;
    setSelDay(d); setSelMonth(viewMonth); setSelYear(viewYear);
  };


  const confirm = () => onConfirm(new Date(selYear, selMonth, selDay, hour, min, 0));

  const selDisplay = `${selYear}.${String(selMonth+1).padStart(2,'0')}.${String(selDay).padStart(2,'0')}`;

  return (
    <View style={dpf.card}>
      {/* ── 날짜 달력 ── */}
      {step === 'date' && (
        <>
          {/* 월 헤더 */}
          <View style={dpf.calHeader}>
            <Pressable onPress={prevMonth} style={({ pressed }) => [dpf.navBtn, pressed && { opacity: 0.5 }]}>
              <Text style={dpf.navBtnText}>‹</Text>
            </Pressable>
            <Text style={dpf.calTitle}>{viewYear}년 {MONTHS[viewMonth]}</Text>
            <Pressable onPress={nextMonth} style={({ pressed }) => [dpf.navBtn, pressed && { opacity: 0.5 }]}>
              <Text style={dpf.navBtnText}>›</Text>
            </Pressable>
          </View>

          {/* 요일 헤더 */}
          <View style={dpf.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={w} style={[dpf.weekLabel, i === 0 && { color: C.danger }, i === 6 && { color: '#2A5FE0' }]}>{w}</Text>
            ))}
          </View>

          {/* 날짜 그리드 */}
          <View style={dpf.grid}>
            {cells.map((d, i) => {
              const past = d ? isPast(d) : false;
              const sel  = d ? isSelected(d) : false;
              const sun  = i % 7 === 0;
              const sat  = i % 7 === 6;
              return (
                <Pressable
                  key={i}
                  onPress={() => selectDay(d)}
                  style={[dpf.cell, sel && dpf.cellSel, (!d || past) && dpf.cellDisabled]}
                >
                  {d ? (
                    <Text style={[
                      dpf.cellText,
                      sel  && dpf.cellTextSel,
                      past && dpf.cellTextDisabled,
                      !sel && sun && { color: C.danger },
                      !sel && sat && { color: '#2A5FE0' },
                    ]}>{d}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* 버튼 행 */}
          <View style={dpf.btnRow}>
            <Pressable style={[dpf.btn, dpf.btnCancel]} onPress={onCancel}>
              <Text style={dpf.btnCancelText}>취소</Text>
            </Pressable>
            <Pressable style={[dpf.btn, dpf.btnConfirm]} onPress={() => setStep('time')}>
              <Text style={dpf.btnConfirmText}>{selDisplay}  →  시간 선택</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ── 시간 선택 (스크롤 휠) ── */}
      {step === 'time' && (
        <>
          <Text style={dpf.calTitle}>{selDisplay}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={{ fontFamily: F.sansMedium, fontSize: 11, color: C.textSecondary }}>시</Text>
              <WheelPicker data={HOURS}   value={hour} onChange={setHour} />
            </View>
            {/* ":" — 휠 피커 높이(48*5=240) 절반에 맞춤 */}
            <Text style={[dpf.timeSep, { marginBottom: 48 * Math.floor(5 / 2) - 8 }]}>:</Text>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={{ fontFamily: F.sansMedium, fontSize: 11, color: C.textSecondary }}>분</Text>
              <WheelPicker data={MINUTES} value={min}  onChange={setMin}  />
            </View>
          </View>

          <View style={dpf.btnRow}>
            <Pressable style={[dpf.btn, dpf.btnCancel]} onPress={() => setStep('date')}>
              <Text style={dpf.btnCancelText}>← 날짜</Text>
            </Pressable>
            <Pressable style={[dpf.btn, dpf.btnConfirm]} onPress={confirm}>
              <Text style={dpf.btnConfirmText}>확인</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const dpf = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: 10, gap: 6,
  },
  // 달력 헤더
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  calTitle:  { fontFamily: F.sansBold, fontSize: 13, color: C.text, textAlign: 'center' },
  navBtn:    { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: C.background },
  navBtnText:{ fontSize: 16, color: C.textSecondary, lineHeight: 20 },
  // 요일 헤더
  weekRow:   { flexDirection: 'row' },
  weekLabel: { flex: 1, textAlign: 'center', fontFamily: F.sansMedium, fontSize: 10, color: C.textSecondary, paddingVertical: 2 },
  // 날짜 그리드
  grid:      { flexDirection: 'row', flexWrap: 'wrap' },
  cell:      { width: `${100/7}%`, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  cellSel:   { backgroundColor: C.dark },
  cellDisabled: { opacity: 0.3 },
  cellText:  { fontFamily: F.sans, fontSize: 12, color: C.text },
  cellTextSel: { fontFamily: F.sansBold, color: '#fff' },
  cellTextDisabled: { color: C.textFaint },
  // 시간 피커
  timeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 6 },
  timeCol:   { alignItems: 'center', gap: 4 },
  timeArrow: { padding: 8 },
  timeArrowText: { fontSize: 16, color: C.textSecondary },
  timeBox:   { flexDirection: 'row', alignItems: 'baseline', gap: 3,
    backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
  },
  timeVal:   { fontFamily: F.sansBold, fontSize: 28, color: C.text },
  timeUnit:  { fontFamily: F.sans, fontSize: 12, color: C.textSecondary },
  timeSep:   { fontFamily: F.sansBold, fontSize: 26, color: C.textSecondary, marginBottom: 4 },
  timeHint:  { fontFamily: F.sans, fontSize: 10, color: C.textFaint, textAlign: 'center' },
  // 공통 버튼
  btnRow:    { flexDirection: 'row', gap: 8, marginTop: 2 },
  btn:       { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { backgroundColor: C.background, borderWidth: 1, borderColor: C.border },
  btnConfirm:{ backgroundColor: C.dark },
  btnCancelText:  { fontFamily: F.sansMedium, fontSize: 12, color: C.textSecondary },
  btnConfirmText: { fontFamily: F.sansMedium, fontSize: 12, color: '#fff' },
});

const dpModal = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,27,45,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: 360, maxWidth: '100%',
    backgroundColor: C.background, borderRadius: 16, padding: 16,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  title: {
    fontFamily: F.sansSemi, fontSize: 16, color: C.text,
    marginBottom: 8, textAlign: 'center',
  },
});
// ─────────────────────────────────────────────────────────────────────────────

const AI_OPTIONS = [
  {
    key: AI_MODE.DISALLOWED,
    label: 'AI 비활성',
    sub: 'AI·웹 패널이 학생에게 표시되지 않습니다.',
    fg: C.textSoft,
    bg: C.card,
    bd: C.border,
  },
  {
    key: AI_MODE.CONDITIONAL,
    label: '조건부',
    sub: '교사가 설정한 지침 범위 내에서 AI를 활용합니다.',
    fg: C.secondary,
    bg: '#F2E9D2',
    bd: 'transparent',
  },
  {
    key: AI_MODE.ALLOWED,
    label: 'AI 활성',
    sub: '학생이 자유롭게 AI와 웹을 탐색할 수 있습니다.',
    fg: C.primaryDark,
    bg: C.primaryLight,
    bd: 'transparent',
  },
];

// ── 단계 편집 모달 ────────────────────────────────────────────────────────────
function StageEditModal({ visible, stage, onSave, onClose }) {
  const [title, setTitle]       = useState(stage?.title || '');
  const [desc, setDesc]         = useState(stage?.description || '');

  React.useEffect(() => {
    if (visible) { setTitle(stage?.title || ''); setDesc(stage?.description || ''); }
  }, [visible, stage]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={se.overlay} onPress={onClose}>
        <Pressable style={se.card} onPress={Keyboard.dismiss}>
          <Text style={se.title}>단계 편집</Text>

          <Text style={se.label}>단계 제목</Text>
          <TextInput
            style={se.input}
            value={title}
            onChangeText={setTitle}
            placeholder="단계 제목"
            placeholderTextColor={C.textFaint}
          />

          <Text style={se.label}>단계 설명</Text>
          <TextInput
            style={[se.input, se.textArea]}
            value={desc}
            onChangeText={setDesc}
            placeholder="이 단계에서 학생이 해야 할 내용"
            placeholderTextColor={C.textFaint}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={se.btnRow}>
            <Pressable
              style={({ pressed }) => [se.btn, se.btnCancel, pressed && { opacity: 0.7 }]}
              onPress={onClose}
            >
              <Text style={se.btnCancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [se.btn, se.btnPrimary, pressed && { opacity: 0.7 }]}
              onPress={() => { onSave(title, desc); onClose(); }}
            >
              <Text style={se.btnPrimaryText}>저장</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const { Keyboard } = require('react-native');
const se = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,27,45,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: 340, padding: 28, borderRadius: 16,
    backgroundColor: C.background, gap: 8,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  title: { fontFamily: F.serifKo, fontSize: 22, color: C.text, marginBottom: 6 },
  label: { fontFamily: F.sansMedium, fontSize: 12.5, color: C.textSoft, marginTop: 6 },
  input: {
    height: 46, paddingHorizontal: 14,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
    fontFamily: F.sans, fontSize: 15, color: C.text,
  },
  textArea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  btnCancel:  { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  btnPrimary: { flex: 1, backgroundColor: C.dark },
  btnCancelText:  { fontFamily: F.sansMedium, fontSize: 14, color: C.textSecondary },
  btnPrimaryText: { fontFamily: F.sansMedium, fontSize: 14, color: '#fff' },
});

// ── AI 모드 선택 모달 ─────────────────────────────────────────────────────────
function AiModeModal({ visible, currentMode, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={am.overlay} onPress={onClose}>
        <Pressable style={am.card} onPress={() => {}}>
          <Text style={am.title}>AI 허용 기준</Text>
          <Text style={am.body}>이 단계에서 학생의 AI 사용 방식을 선택할 수 있습니다.</Text>
          <View style={am.optionList}>
            {AI_OPTIONS.map((opt) => {
              const active = currentMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={({ pressed }) => [
                    am.option,
                    active && am.optionActive,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => { onSelect(opt.key); onClose(); }}
                >
                  <View style={[am.dot, { backgroundColor: opt.fg }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[am.optionLabel, { color: opt.fg }]}>{opt.label}</Text>
                    <Text style={am.optionSub}>{opt.sub}</Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={18} color={opt.fg} />}
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={({ pressed }) => [am.closeBtn, pressed && { opacity: 0.7 }]}
            onPress={onClose}
          >
            <Text style={am.closeBtnText}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const am = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,27,45,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: 340, padding: 28, borderRadius: 16,
    backgroundColor: C.background, gap: 14,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  title: { fontFamily: F.serifKo, fontSize: 22, color: C.text },
  body:  { fontFamily: F.sans, fontSize: 14, color: C.textSoft, lineHeight: 21, marginTop: -4 },
  optionList: { gap: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  optionActive: { borderColor: C.primary, backgroundColor: C.primaryLight + '40' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  optionLabel: { fontFamily: F.sansSemi, fontSize: 14, marginBottom: 2 },
  optionSub:   { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  closeBtn: {
    marginTop: 4, alignItems: 'center', padding: 12,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  closeBtnText: { fontFamily: F.sansMedium, fontSize: 14, color: C.textSecondary },
});

// ── 메인 화면 ──────────────────────────────────────────────────────────────────
export default function CreateAssignmentScreen({ navigation, route }) {
  const editTarget = route?.params?.assessment ?? null;
  const isEdit = editTarget !== null;

  const [title, setTitle]         = useState(editTarget?.title ?? '');
  const [subject, setSubject]     = useState(editTarget?.subject ?? '');
  const [targetClass, setTargetClass] = useState(editTarget?.target_class ?? '');
  // deadline: Date 객체로 관리, null이면 미설정
  const parseDeadlineDate = (val) => {
    if (!val) return null;
    const d = new Date(val.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  };
  const [deadlineDate, setDeadlineDate] = useState(() => parseDeadlineDate(editTarget?.deadline ?? null));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerTempDate, setPickerTempDate] = useState(null);

  // DB 전송용 문자열 (YYYY-MM-DD HH:MM:SS) — 로컬 시간 그대로 전송
  const pad = n => String(n).padStart(2, '0');
  const deadline = deadlineDate
    ? `${deadlineDate.getFullYear()}-${pad(deadlineDate.getMonth()+1)}-${pad(deadlineDate.getDate())} ${pad(deadlineDate.getHours())}:${pad(deadlineDate.getMinutes())}:00`
    : '';

  // 표시용 문자열
  const deadlineDisplay = deadlineDate
    ? `${deadlineDate.getFullYear()}.${String(deadlineDate.getMonth()+1).padStart(2,'0')}.${String(deadlineDate.getDate()).padStart(2,'0')}  ${String(deadlineDate.getHours()).padStart(2,'0')}:${String(deadlineDate.getMinutes()).padStart(2,'0')}`
    : null;
  const [description, setDescription] = useState(editTarget?.description ?? '');
  const [stages, setStages] = useState(() => {
    if (editTarget?.steps?.length) {
      return editTarget.steps.map(s => ({
        title: s.title ?? '',
        description: s.description ?? '',
        ai_mode: s.ai_mode ?? AI_MODE.DISALLOWED,
        ai_guidance: s.ai_guidance ?? '',
      }));
    }
    return getDefaultStagesForNewAssignment();
  });
  const [loading, setLoading] = useState(false);

  // 모달 상태
  const [aiModalIdx, setAiModalIdx]     = useState(null);
  const [editModalIdx, setEditModalIdx] = useState(null);
  const [successModal, setSuccessModal]   = useState(false);
  const [createdCode,  setCreatedCode]    = useState('');
  const [rubricDraft, setRubricDraft] = useState(
    route.params?.rubricDraft ?? editTarget?.rubric ?? null
  );

  useFocusEffect(
    useCallback(() => {
      if (route.params?.rubricDraft) {
        setRubricDraft(route.params.rubricDraft);
      }
    }, [route.params?.rubricDraft])
  );

  const setStageAiMode = (idx, mode) => {
    const updated = [...stages];
    const cur = { ...updated[idx], ai_mode: mode };
    if (mode === AI_MODE.DISALLOWED) {
      cur.ai_guidance = '';
    } else if (mode === AI_MODE.CONDITIONAL && !(cur.ai_guidance || '').trim()) {
      cur.ai_guidance = DEFAULT_CONDITIONAL_GUIDANCE;
    }
    updated[idx] = cur;
    setStages(updated);
  };

  const removeStage = (idx) => {
    if (stages.length <= 1) {
      appAlert('알림', '최소 1개 이상의 단계가 필요합니다.');
      return;
    }
    setStages(stages.filter((_, i) => i !== idx));
    if (editModalIdx === idx) setEditModalIdx(null);
    else if (editModalIdx !== null && editModalIdx > idx) setEditModalIdx(editModalIdx - 1);
    if (aiModalIdx === idx) setAiModalIdx(null);
    else if (aiModalIdx !== null && aiModalIdx > idx) setAiModalIdx(aiModalIdx - 1);
  };

  const confirmRemoveStage = (idx) => {
    if (stages.length <= 1) {
      appAlert('알림', '최소 1개 이상의 단계가 필요합니다.');
      return;
    }
    const stageTitle = stages[idx]?.title?.trim() || `${idx + 1}단계`;
    appAlert(
      '단계 삭제',
      `"${stageTitle}" 단계를 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => removeStage(idx) },
      ],
      { type: 'warning' },
    );
  };

  const updateStage = (idx, field, value) => {
    const updated = [...stages];
    updated[idx] = { ...updated[idx], [field]: value };
    setStages(updated);
  };

  const addStage = () => {
    setStages([...stages, { title: '', description: '', ai_mode: AI_MODE.DISALLOWED, ai_guidance: '' }]);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      appAlert('입력 오류', VALIDATION.assessmentTitle);
      return;
    }
    const emptyIdx = stages.findIndex(s => !s.title.trim());
    if (emptyIdx !== -1) {
      appAlert('입력 오류', VALIDATION.stepTitle(emptyIdx + 1));
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      subject: subject.trim() || undefined,
      target_class: targetClass.trim() || undefined,
      deadline: deadline.trim() || undefined,
      steps: stages.map(s => ({
        title: s.title.trim(),
        description: s.description.trim() || undefined,
        ai_mode: s.ai_mode,
      })),
      ...(rubricDraft ? { rubric: rubricDraft } : {}),
    };
    setLoading(true);
    try {
      if (isEdit) {
        await assessmentAPI.update(editTarget.id, payload);
        setSuccessModal(true);
      } else {
        const assessment = await assessmentAPI.create(payload);
        setCreatedCode(assessment.invite_code ?? '');
        setSuccessModal(true);
      }
    } catch (err) {
      appAlert(isEdit ? '수정 실패' : '생성 실패', err.message, null, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const currentAiOpt = (mode) => AI_OPTIONS.find(o => o.key === mode) || AI_OPTIONS[0];

  return (
    <AppShell navigation={navigation} currentScreen="create">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={{ flex: 1, backgroundColor: C.background }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 헤더 (뒤로가기 + 타이틀 + 액션 버튼) ─── */}
          <View style={s.headerRow}>
            {/* 뒤로가기 */}
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={18} color={C.text} />
            </Pressable>

            {/* 태그 + 타이틀 */}
            <View style={{ flex: 1 }}>
              <Text style={s.pageTag}>{isEdit ? '수행평가 수정' : '수행평가 설계'}</Text>
            </View>

            {/* 액션 버튼 */}
            <View style={s.headerActions}>
              <Pressable
                style={({ pressed }) => [s.designBtn, pressed && { opacity: 0.75 }]}
                onPress={() => navigation.navigate('GradingRubric', { rubricDraft, assessment: editTarget })}
              >
                <Ionicons name="grid-outline" size={14} color={C.text} />
                <Text style={s.designBtnText}>평가 설계</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.saveBtn, (pressed || loading) && { opacity: 0.75 }]}
                onPress={handleCreate}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (
                    <>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={s.saveBtnText}>{isEdit ? '수정 저장' : '저장 · 학급에 배포'}</Text>
                    </>
                  )
                }
              </Pressable>
            </View>
          </View>

          {/* ── 기본 정보 ─────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>기본 정보</Text>

            {/* 제목 | 과목 */}
            <View style={s.row2}>
              <View style={s.field}>
                <Text style={s.label}>제목</Text>
                <TextInput
                  style={s.input}
                  placeholder="인물 분석 보고서"
                  placeholderTextColor={C.textFaint}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>
              <View style={s.field}>
                <Text style={s.label}>과목</Text>
                <TextInput
                  style={s.input}
                  placeholder="국어"
                  placeholderTextColor={C.textFaint}
                  value={subject}
                  onChangeText={setSubject}
                />
              </View>
            </View>

            {/* 대상 반 | 마감 */}
            <View style={s.row2}>
              <View style={s.field}>
                <Text style={s.label}>대상 반</Text>
                <TextInput
                  style={s.input}
                  placeholder="2-4"
                  placeholderTextColor={C.textFaint}
                  value={targetClass}
                  onChangeText={setTargetClass}
                />
              </View>
              {/* 마감 필드 */}
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.label}>마감</Text>
                {Platform.OS === 'web' ? (
                  <View style={[s.input, s.dateBtn, s.webDateWrap]}>
                    {/* eslint-disable-next-line react/no-unknown-property */}
                    <input
                      type="datetime-local"
                      value={deadlineDate ? toDatetimeLocalValue(deadlineDate) : ''}
                      min={toDatetimeLocalValue(new Date())}
                      onChange={(e) => setDeadlineDate(fromDatetimeLocalValue(e.target.value))}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: 14,
                        fontFamily: 'Pretendard-Regular, -apple-system, BlinkMacSystemFont, sans-serif',
                        color: C.text,
                        width: '100%',
                        height: 44,
                        cursor: 'pointer',
                      }}
                    />
                    {deadlineDate ? (
                      <Pressable
                        onPress={() => setDeadlineDate(null)}
                        hitSlop={8}
                        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                      >
                        <Ionicons name="close-circle" size={16} color={C.textFaint} />
                      </Pressable>
                    ) : (
                      <Ionicons name="calendar-outline" size={15} color={C.textFaint} />
                    )}
                  </View>
                ) : (
                  <>
                    <Pressable
                      style={({ pressed }) => [s.input, s.dateBtn, pressed && { opacity: 0.7 }]}
                      onPress={() => {
                        setPickerTempDate(deadlineDate || new Date());
                        setShowDatePicker(true);
                      }}
                    >
                      {deadlineDisplay ? (
                        <Text style={s.dateBtnText}>{deadlineDisplay}</Text>
                      ) : (
                        <Text style={s.dateBtnPlaceholder}>날짜·시간 선택</Text>
                      )}
                      <Ionicons name="calendar-outline" size={15} color={deadlineDisplay ? C.text : C.textFaint} />
                    </Pressable>
                    {deadlineDate && (
                      <Pressable
                        style={s.dateClear}
                        onPress={() => { setDeadlineDate(null); setShowDatePicker(false); }}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={16} color={C.textFaint} />
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </View>

            {/* 평가 설명 */}
            <View style={s.field}>
              <Text style={s.label}>평가 설명</Text>
              <TextInput
                style={[s.input, s.textArea]}
                placeholder="학생에게 보일 안내문을 작성합니다."
                placeholderTextColor={C.textFaint}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* ── 단계 설계 ─────────────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>단계 설계</Text>
              <Text style={s.sectionCount}>{stages.length}단계</Text>
            </View>
            <Text style={s.sectionDesc}>
              학생이 거칠 사고의 단계를 직접 디자인합니다. 각 단계마다 AI 사용 가능 여부를 정할 수 있습니다.
            </Text>

            <View style={{ gap: 10 }}>
            {stages.map((stage, idx) => {
              const aiOpt = currentAiOpt(stage.ai_mode);
              return (
                <View key={idx} style={s.stageCard}>
                  {/* 번호 뱃지 */}
                  <View style={s.stageBadge}>
                    <Text style={s.stageBadgeText}>{String(idx + 1).padStart(2, '0')}</Text>
                  </View>

                  {/* 제목 + 설명 (읽기 전용 표시) */}
                  <View style={{ flex: 1 }}>
                    <Text style={s.stageTitleText} numberOfLines={1}>
                      {stage.title || <Text style={{ color: C.textFaint }}>단계 제목</Text>}
                    </Text>
                    {stage.description ? (
                      <Text style={s.stageDescText} numberOfLines={2}>{stage.description}</Text>
                    ) : null}
                  </View>

                  {/* AI 뱃지 버튼 */}
                  <Pressable
                    onPress={() => setAiModalIdx(idx)}
                    style={({ pressed }) => [
                      s.aiBadgeBtn,
                      { backgroundColor: aiOpt.bg, borderColor: aiOpt.bd },
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <Text style={[s.aiBadgeText, { color: aiOpt.fg }]}>{aiOpt.label}</Text>
                  </Pressable>

                  {/* 수정 · 삭제 */}
                  <View style={s.stageActions}>
                    <Pressable
                      onPress={() => setEditModalIdx(idx)}
                      style={({ pressed }) => [s.stageActionBtn, pressed && { opacity: 0.6 }]}
                      hitSlop={6}
                      accessibilityLabel="단계 수정"
                    >
                      <Ionicons name="pencil-outline" size={16} color={C.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => confirmRemoveStage(idx)}
                      style={({ pressed }) => [s.stageActionBtn, pressed && { opacity: 0.6 }]}
                      hitSlop={6}
                      accessibilityLabel="단계 삭제"
                    >
                      <Ionicons name="trash-outline" size={16} color={C.danger} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
            </View>

            {/* 단계 추가 */}
            <Pressable
              style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}
              onPress={addStage}
            >
              <Ionicons name="add" size={14} color={C.textSoft} />
              <Text style={s.addBtnText}>단계 추가</Text>
            </Pressable>
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── 생성/수정 완료 모달 ─────────────────────────── */}
      <Modal visible={successModal} transparent animationType="fade" onRequestClose={() => { setSuccessModal(false); navigation.goBack(); }} statusBarTranslucent>
        <Pressable style={se.overlay} onPress={() => {}}>
          <Pressable style={se.card} onPress={() => {}}>
            {isEdit ? (
              <>
                <Text style={se.title}>수행평가가 수정되었습니다.</Text>
                <Text style={[se.label, { marginTop: 0, fontSize: 14, lineHeight: 22, color: C.textSoft }]}>
                  변경 사항이 저장되었습니다.
                </Text>
              </>
            ) : (
              <>
                <Text style={se.title}>수행평가가 생성되었습니다.</Text>
                <Text style={[se.label, { marginTop: 0, fontSize: 14, lineHeight: 22, color: C.textSoft }]}>
                  학생들에게 아래 초대 코드를 공유할 수 있습니다.
                </Text>
                {/* 초대 코드 강조 표시 */}
                <View style={{
                  backgroundColor: C.card, borderRadius: 12,
                  borderWidth: 1, borderColor: C.border,
                  paddingVertical: 16, paddingHorizontal: 20,
                  alignItems: 'center',
                }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary, letterSpacing: 1.2, marginBottom: 6 }}>
                    수업 초대 코드
                  </Text>
                  <Text style={{ fontFamily: F.monoMed, fontSize: 28, color: C.text, letterSpacing: 4 }}>
                    {createdCode}
                  </Text>
                </View>
              </>
            )}

            <View style={se.btnRow}>
              <Pressable
                style={({ pressed }) => [se.btn, se.btnPrimary, { flex: 1 }, pressed && { opacity: 0.7 }]}
                onPress={() => { setSuccessModal(false); navigation.goBack(); }}
              >
                <Text style={se.btnPrimaryText}>확인</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── AI 모드 모달 ───────────────────────────────── */}
      <AiModeModal
        visible={aiModalIdx !== null}
        currentMode={aiModalIdx !== null ? stages[aiModalIdx]?.ai_mode : null}
        onSelect={(mode) => { if (aiModalIdx !== null) setStageAiMode(aiModalIdx, mode); }}
        onClose={() => setAiModalIdx(null)}
      />

      {/* ── 단계 편집 모달 ─────────────────────────────── */}
      <StageEditModal
        visible={editModalIdx !== null}
        stage={editModalIdx !== null ? stages[editModalIdx] : null}
        onSave={(title, desc) => {
          if (editModalIdx !== null) {
            const updated = [...stages];
            updated[editModalIdx] = { ...updated[editModalIdx], title, description: desc };
            setStages(updated);
          }
        }}
        onClose={() => setEditModalIdx(null)}
      />

      {/* ── 마감 날짜·시간 모달 (네이티브) ─────────────── */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
        statusBarTranslucent
      >
        <Pressable style={dpModal.overlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={dpModal.card} onPress={() => {}}>
            <Text style={dpModal.title}>마감 일시 선택</Text>
            <InlineDateTimePicker
              value={pickerTempDate || new Date()}
              onChange={(d) => setPickerTempDate(d)}
              onConfirm={(d) => { setDeadlineDate(d); setShowDatePicker(false); }}
              onCancel={() => setShowDatePicker(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </AppShell>
  );
}

const s = StyleSheet.create({
  scrollContent: { paddingBottom: 60 },

  // 헤더 행
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22,
  },
  backBtn: {
    width: 36, height: 36, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
  },
  pageTag:   { fontFamily: F.mono, fontSize: 11.5, color: C.textSecondary, letterSpacing: 1.2, marginBottom: 4 },
  pageTitle: { fontFamily: F.serifMedItalic, fontSize: 28, color: C.text, lineHeight: 36, letterSpacing: -0.4, marginTop: 4 },

  // 헤더 액션 버튼
  headerActions: { flexDirection: 'row', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
  designBtn: {
    height: 36, paddingHorizontal: 12, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  designBtnText: { fontFamily: F.sansMedium, fontSize: 13, color: C.text },
  saveBtn: {
    height: 36, paddingHorizontal: 14, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: C.dark,
  },
  saveBtnText: { fontFamily: F.sansMedium, fontSize: 13, color: '#fff' },

  // 섹션
  section: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: C.card, borderRadius: 16, padding: 22,
    borderWidth: 1, borderColor: C.border,
    gap: 16,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontFamily: F.sansSemi, fontSize: 14, color: C.text, letterSpacing: -0.1 },
  sectionCount: { fontFamily: F.mono, fontSize: 12, color: C.textSecondary },
  sectionDesc:  { fontFamily: F.sans, fontSize: 12.5, color: C.textSoft, lineHeight: 18, marginTop: -8 },

  field: { flex: 1, gap: 6 },
  label: { fontFamily: F.sansMedium, fontSize: 12.5, color: C.textSoft, letterSpacing: 0.2 },
  input: {
    backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 14, height: 46,
    fontFamily: F.sans, fontSize: 15, color: C.text,
    borderWidth: 1, borderColor: C.border,
  },
  textArea: { height: undefined, minHeight: 88, paddingVertical: 14, textAlignVertical: 'top' },

  // 2열 그리드
  row2: { flexDirection: 'row', gap: 16 },

  // 단계 카드 — 디자인 파일 1행 가로 레이아웃
  stageCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  stageBadge: {
    width: 28, height: 28, borderRadius: 6, backgroundColor: C.dark,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stageBadgeText: { fontFamily: F.mono, fontSize: 12, color: '#fff' },
  stageTitleText: {
    fontFamily: F.serifMedItalic, fontSize: 16, color: C.text,
  },
  stageDescText: {
    fontFamily: F.sans, fontSize: 12.5, color: C.textSoft,
    marginTop: 2, lineHeight: 18,
  },
  stageActions: {
    flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0,
  },
  stageActionBtn: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },

  // AI 모드 버튼
  aiBadgeBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, flexShrink: 0,
  },
  aiBadgeText: { fontFamily: F.sansMedium, fontSize: 11.5, letterSpacing: 0.15 },

  // 단계 추가
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
    borderRadius: 12, height: 44, marginTop: 4,
  },
  addBtnText: { fontFamily: F.sans, fontSize: 13, color: C.textSoft },

  // 날짜 선택 버튼
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dateBtnText: { fontFamily: F.sans, fontSize: 14, color: C.text },
  dateBtnPlaceholder: { fontFamily: F.sans, fontSize: 14, color: C.textFaint },
  webDateWrap: { paddingVertical: 0, paddingRight: 10 },
  dateClear: {
    position: 'absolute', right: 10, top: 30,
  },
});

