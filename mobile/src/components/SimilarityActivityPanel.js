import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME, FONTS } from '../config/api';
import { getPromptTypeLabel } from '../config/promptLabels';

const C = THEME;
const F = FONTS;

const ORIGINALITY_COLOR = {
  red: '#FFCDD2',
  yellow: '#FFF9C4',
  green: '#E8F5E9',
};

/** 좌·우 내부 스크롤 터치 시 바깥 ScrollView 잠금 (중첩 스크롤 제스처 분리) */
function OuterScrollLockZone({ enabled, onLockChange, children }) {
  const unlock = useCallback(() => onLockChange?.(false), [onLockChange]);
  const lock = useCallback(() => onLockChange?.(true), [onLockChange]);

  if (!enabled) return children;

  return (
    <View
      onStartShouldSetResponderCapture={() => {
        lock();
        return false;
      }}
      onTouchEnd={unlock}
      onTouchCancel={unlock}
    >
      {children}
    </View>
  );
}

function innerScrollLockProps(onLockChange) {
  if (!onLockChange) return {};
  return {
    onScrollBeginDrag: () => onLockChange(true),
    onMomentumScrollEnd: () => onLockChange(false),
  };
}
const CRITICAL_USE_COLOR = '#7B1FA2';
const CRITICAL_USE_BG = '#F3E5F5';

/** by_step + similarity_by_step → 화면에 그릴 단계 목록 */
export function buildStepDisplayList(byStep, simByStep, { includeStepOrderInTitle = true } = {}) {
  const getSentences = (stepId) =>
    simByStep[stepId] ?? simByStep[String(stepId)] ?? [];

  const ordered = [...byStep].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0));
  if (ordered.length === 0) {
    return Object.entries(simByStep).map(([stepIdKey, sentences]) => ({
      stepIdKey,
      stepTitle: `단계 ${stepIdKey}`,
      sentences,
      compliance: null,
    }));
  }

  return ordered
    .filter(
      (s) =>
        getSentences(s.step_id).length > 0 ||
        s.compliance ||
        (s.ai_prompt_count ?? 0) > 0 ||
        (s.url_count ?? 0) > 0
    )
    .map((s) => ({
      stepIdKey: String(s.step_id),
      stepTitle: includeStepOrderInTitle
        ? `${s.step_order}단계 · ${s.step_title}`
        : (s.step_title ?? `단계 ${s.step_order}`),
      sentences: getSentences(s.step_id),
      compliance: s.compliance ?? null,
      contentAtUnlock: s.content_at_unlock ?? null,
      browserUnlockedAt: s.browser_unlocked_at ?? null,
      submissionContent: s.submission_content ?? null,
      aiPermission: s.ai_permission ?? null,
    }));
}

function normalizeUnlockText(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function stripTrailingPunct(text) {
  return (text ?? '').replace(/[.!?…]+$/u, '').trimEnd();
}

/** content_at_unlock이 제출 본문·유사도 문장 어디에 해당하는지 (문장 부호 차이 허용) */
function findUnlockSplitIndex(joined, unlockRaw) {
  const j = normalizeUnlockText(joined);
  const u = normalizeUnlockText(unlockRaw);
  if (!j || !u || j.length <= u.length) return -1;

  const jLow = j.toLowerCase();
  const uLow = u.toLowerCase();

  if (jLow.startsWith(uLow)) {
    return u.length;
  }

  const uCore = stripTrailingPunct(u);
  if (!uCore || !jLow.startsWith(uCore.toLowerCase())) return -1;

  let splitAt = uCore.length;
  const tail = j.slice(uCore.length);
  const punctGap = tail.match(/^[.!?…]*\s*/u);
  if (punctGap) splitAt += punctGap[0].length;

  return splitAt < j.length ? splitAt : -1;
}

/** 조건부 AI — 웹뷰 해제 시점(content_at_unlock) 기준으로 문장 목록 분리 */
export function partitionSentencesByUnlock(sentences, contentAtUnlock, submissionContent = null) {
  if (!contentAtUnlock?.trim() || !sentences?.length) {
    return { before: sentences ?? [], after: [], showDivider: false };
  }

  const unlockRaw = normalizeUnlockText(contentAtUnlock);
  const joinedFromSentences = normalizeUnlockText(
    sentences
      .map((s) => (s.sentence ?? '').trim())
      .filter(Boolean)
      .join(' ')
  );
  const joinedFromSubmission = normalizeUnlockText(submissionContent);
  const joined = joinedFromSubmission || joinedFromSentences;

  const splitAt = findUnlockSplitIndex(joined, unlockRaw);
  if (splitAt < 0) {
    return { before: sentences, after: [], showDivider: false };
  }

  const beforeText = joined.slice(0, splitAt).trimEnd();
  const afterText = joined.slice(splitAt).trimStart();
  if (!afterText) {
    return { before: sentences, after: [], showDivider: false };
  }

  // 문장 단위로 나뉜 경우 — 형광펜(유사도) 메타 유지
  let pos = 0;
  let boundarySplit = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    const chunk = (sentences[i].sentence ?? '').trim();
    if (!chunk) continue;
    const sep = pos > 0 ? ' ' : '';
    pos += sep.length + chunk.length;
    boundarySplit = i + 1;
    if (pos >= splitAt) break;
  }

  const boundaryAfter = sentences.slice(boundarySplit);
  if (boundaryAfter.length > 0) {
    return {
      before: sentences.slice(0, boundarySplit),
      after: boundaryAfter,
      showDivider: true,
    };
  }

  // 한 문장으로 합쳐진 경우(예: "Test. Test.") — 텍스트 중간에서 분리
  const template = sentences.find((s) => (s.sentence ?? '').trim()) ?? sentences[0];
  return {
    before: [{ ...template, sentence: beforeText }],
    after: [{ ...template, sentence: afterText }],
    showDivider: true,
  };
}

export function ConditionalUnlockDivider({ unlockedAt }) {
  const timeLabel = fmtTimeline(unlockedAt, { withDate: true });
  return (
    <View style={styles.unlockDividerWrap}>
      <View style={styles.unlockDividerLine} />
      <View style={styles.unlockDividerBadge}>
        <Ionicons name="globe-outline" size={13} color={C.textSecondary} />
        <Text style={styles.unlockDividerLabel}>
          AI·웹 검색 사용 시작{timeLabel ? ` · ${timeLabel}` : ''}
        </Text>
      </View>
      <View style={styles.unlockDividerLine} />
    </View>
  );
}

function renderSentenceSegments({
  sentences,
  stepIdKey,
  onJumpToAiLog,
  selectedSegmentKey,
  keyPrefix = '',
  linkZone = 'all',
  byStep = [],
  aiLogs = [],
  browserUnlockedAt = null,
}) {
  return sentences.flatMap((r, ri) => {
    const bg = ORIGINALITY_COLOR[r.originality] ?? null;
    const text = formatSentenceForDisplay(r.sentence);
    const canOpenLink = canOpenAiLogLink(r.ai_log_id, {
      linkZone,
      stepIdKey,
      byStep,
      aiLogs,
      browserUnlockedAt,
    });
    const segmentKey = `${stepIdKey}-${keyPrefix}${r.segment_order ?? ri}`;
    const isSelected = selectedSegmentKey === segmentKey;

    if (!text) return [];

    const segment = (
      <Text
        key={segmentKey}
        onPress={
          canOpenLink
            ? (e) => {
                e?.stopPropagation?.();
                onJumpToAiLog?.({ aiLogId: r.ai_log_id, segmentKey });
              }
            : undefined
        }
        style={[
          styles.sentenceText,
          bg && { backgroundColor: bg, borderRadius: 3 },
          canOpenLink && styles.sentencePressable,
          isSelected && styles.sentenceSelected,
        ]}
      >
        {text}
      </Text>
    );

    return ri < sentences.length - 1 ? [segment, ' '] : [segment];
  });
}

/** 단계별 이행(루브릭) — criteria_met 1: 성공, 0: 실패 */
export function StepComplianceBadge({ compliance }) {
  if (!compliance) return null;

  const pass =
    compliance.criteria_met != null
      ? Boolean(compliance.criteria_met)
      : compliance.status === '이행';

  if (compliance.criteria_met == null && compliance.status == null) return null;

  return (
    <View style={styles.complianceBadgeRow}>
      <Ionicons
        name={pass ? 'checkmark-circle-outline' : 'close-circle-outline'}
        size={17}
        color={pass ? '#43A047' : '#E53935'}
      />
      <Text style={[styles.complianceBadgeText, pass ? styles.compliancePass : styles.complianceFail]}>
        {pass ? '단계별 이행 성공' : '단계별 이행 실패'}
      </Text>
    </View>
  );
}

function formatSentenceForDisplay(raw) {
  const text = (raw ?? '').replace(/\s*\n+\s*/g, ' ').trim();
  if (!text) return '';
  const body = text.replace(/[.!?…]+$/u, '').trimEnd();
  return body ? `${body}.` : '';
}

function fmtTimeline(iso, { withDate = false } = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  if (!withDate) return time;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function stepLabelForLog(log, byStep) {
  const step = byStep.find((b) => String(b.step_id) === String(log.step_id));
  const title = log.step_title || step?.step_title;
  const order = log.step_order ?? step?.step_order;
  if (title && order != null) return `${order}단계 · ${title}`;
  if (title) return title;
  if (order != null) return `${order}단계`;
  return log.step_id ? `단계 ${log.step_id}` : null;
}

/** 전체 URL·AI 로그를 시간순으로 통합 — 선택 시 연관 항목만 isMatched */
export function buildUnifiedTimeline(urlLogs, aiLogs, byStep = [], selectedAiLogId = null) {
  const selectedAiLog =
    selectedAiLogId != null
      ? (aiLogs || []).find((l) => l.id == selectedAiLogId)
      : null;
  const relatedUrlId = selectedAiLog?.related_url_log_id ?? null;

  const urls = (urlLogs || []).map((l) => ({
    type: 'url',
    time: l.visited_at,
    data: l,
    key: `url-${l.id ?? l.url}-${l.visited_at}`,
    stepLabel: stepLabelForLog(l, byStep),
    // eslint-disable-next-line eqeqeq
    isMatched: relatedUrlId != null && l.id == relatedUrlId,
  }));

  const ais = (aiLogs || []).map((l) => ({
    type: 'ai',
    time: l.logged_at,
    data: l,
    key: `ai-${l.id}`,
    stepLabel: stepLabelForLog(l, byStep),
    // eslint-disable-next-line eqeqeq
    isMatched: selectedAiLogId != null && l.id == selectedAiLogId,
  }));

  return [...urls, ...ais].sort((a, b) => new Date(a.time) - new Date(b.time));
}

/** 유사도 분석과 동일 — 현재 단계 이하(step_order)의 step_id 집합 */
function getStepScopeStepIds(stepId, byStep) {
  const stepInfo = byStep.find((b) => String(b.step_id) === String(stepId));
  if (!stepInfo) {
    return new Set((byStep || []).map((b) => String(b.step_id)));
  }
  const order = stepInfo.step_order ?? 0;
  return new Set(
    byStep
      .filter((b) => (b.step_order ?? 0) <= order)
      .map((b) => String(b.step_id))
  );
}

/** 현재·이전 단계 AI 로그 (백엔드 /analyze와 동일 범위) */
export function getAiLogsInStepScope(stepId, byStep, aiLogs) {
  const scopedIds = getStepScopeStepIds(stepId, byStep);
  return (aiLogs || []).filter((l) => scopedIds.has(String(l.step_id)));
}

/** 형광펜 탭 시 AI 로그로 이동 가능 여부 */
function canOpenAiLogLink(aiLogId, {
  linkZone = 'all',
  stepIdKey,
  byStep = [],
  aiLogs = [],
  browserUnlockedAt = null,
}) {
  if (aiLogId == null) return false;
  if (linkZone !== 'pre-unlock') return true;

  // eslint-disable-next-line eqeqeq
  const log = (aiLogs || []).find((l) => l.id == aiLogId);
  if (!log) return false;

  const scopedIds = getStepScopeStepIds(stepIdKey, byStep);
  if (!scopedIds.has(String(log.step_id))) return false;

  if (browserUnlockedAt && String(log.step_id) === String(stepIdKey)) {
    const unlockAt = new Date(browserUnlockedAt);
    const logTime = log.logged_at ? new Date(log.logged_at) : null;
    if (!isNaN(unlockAt.getTime()) && (!logTime || logTime >= unlockAt)) {
      return false;
    }
  }

  return true;
}

/** 모달용 — 현재 단계 + 이전 단계 AI·URL 활동 타임라인 */
export function buildStepScopeTimeline(stepId, { byStep, urlLogs, aiLogs }) {
  const stepInfo = byStep.find((b) => String(b.step_id) === String(stepId));
  const scopedIds = getStepScopeStepIds(stepId, byStep);
  const scopedAi = (aiLogs || []).filter((l) => scopedIds.has(String(l.step_id)));

  const submittedAt = stepInfo?.submitted_at ? new Date(stepInfo.submitted_at) : null;
  const prevStep = byStep.find((b) => b.step_order === (stepInfo?.step_order ?? 1) - 1);
  const prevSubmittedAt = prevStep?.submitted_at ? new Date(prevStep.submitted_at) : null;

  let urlItems = (urlLogs || []).filter((l) => scopedIds.has(String(l.step_id)));
  if (urlItems.length === 0 && submittedAt) {
    urlItems = (urlLogs || []).filter((l) => {
      const t = l.visited_at ? new Date(l.visited_at) : null;
      if (!t) return false;
      if (prevSubmittedAt && t < prevSubmittedAt) return false;
      if (t > submittedAt) return false;
      return true;
    });
  }

  return buildUnifiedTimeline(urlItems, scopedAi, byStep);
}

export function buildStepTimeline(stepId, matchedAiLogId, { byStep, urlLogs, aiLogs }) {
  // eslint-disable-next-line eqeqeq
  const matchStep = (id) => id != null && id == stepId;

  const stepInfo = byStep.find(b => String(b.step_id) === String(stepId));
  const submittedAt = stepInfo?.submitted_at ? new Date(stepInfo.submitted_at) : null;
  const prevStep = byStep.find(b => b.step_order === (stepInfo?.step_order ?? 1) - 1);
  const prevSubmittedAt = prevStep?.submitted_at ? new Date(prevStep.submitted_at) : null;

  let urlItems = urlLogs.filter(l => matchStep(l.step_id));
  if (urlItems.length === 0 && submittedAt) {
    urlItems = urlLogs.filter(l => {
      const t = l.visited_at ? new Date(l.visited_at) : null;
      if (!t) return false;
      if (prevSubmittedAt && t < prevSubmittedAt) return false;
      if (t > submittedAt) return false;
      return true;
    });
  }

  const urls = urlItems.map(l => ({ type: 'url', time: l.visited_at, data: l, key: `url-${l.id ?? l.url}-${l.visited_at}` }));

  const aisInStep = aiLogs
    .filter(l => matchStep(l.step_id))
    .map(l => ({
      type: 'ai',
      time: l.logged_at,
      data: l,
      key: `ai-${l.id}`,
      // eslint-disable-next-line eqeqeq
      isMatched: matchedAiLogId != null && l.id == matchedAiLogId,
    }));

  let crossStepItem = null;
  if (matchedAiLogId != null) {
    // eslint-disable-next-line eqeqeq
    const matched = aiLogs.find(l => l.id == matchedAiLogId);
    if (matched && !matchStep(matched.step_id)) {
      crossStepItem = {
        type: 'ai',
        time: matched.logged_at,
        data: matched,
        key: `ai-cross-${matched.id}`,
        isMatched: true,
        crossStep: true,
      };
    }
  }

  const allAis = crossStepItem ? [...aisInStep, crossStepItem] : aisInStep;
  return [...urls, ...allAis].sort((a, b) => new Date(a.time) - new Date(b.time));
}

function TimelineList({
  timeline,
  matchedAiLogId,
  onViewResponse,
  withDate = false,
  aiItemRefs,
  onAiItemLayout,
}) {
  if (timeline.length === 0) {
    return (
      <View style={styles.timelineEmpty}>
        <Ionicons name="time-outline" size={28} color={C.border} />
        <Text style={styles.timelineEmptyText}>활동 기록이 없습니다.</Text>
      </View>
    );
  }

  return timeline.map((item, idx) => {
    const isUrl = item.type === 'url';
    const isLast = idx === timeline.length - 1;
    const dotColor = isUrl ? C.primary : '#E53935';
    const isBold = matchedAiLogId != null && item.isMatched;
    const boldStyle = isBold ? styles.boldText : null;

    return (
      <View
        key={item.key ?? idx}
        style={styles.tlItem}
        collapsable={false}
        ref={(ref) => {
          if (!isUrl && item.data?.id != null && aiItemRefs) {
            aiItemRefs.current[item.data.id] = ref;
            aiItemRefs.current[String(item.data.id)] = ref;
          }
        }}
        onLayout={(e) => {
          if (!isUrl && item.data?.id != null && onAiItemLayout) {
            onAiItemLayout(item.data.id, e.nativeEvent.layout.y);
          }
        }}
      >
        <View style={styles.tlLineCol}>
          <View style={[styles.tlDot, { backgroundColor: dotColor }, isBold && styles.tlDotBold]} />
          {!isLast && <View style={styles.tlLine} />}
        </View>
        <View style={[styles.tlCard, isBold && styles.tlCardBold, isLast && { marginBottom: 8 }]}>
          <View style={styles.tlItemHead}>
            <View style={[styles.tlTypeBadge, { backgroundColor: isUrl ? C.primaryLight : '#FFEBEE' }]}>
              <Ionicons name={isUrl ? 'globe-outline' : 'chatbubble-ellipses-outline'} size={12} color={dotColor} />
              <Text style={[styles.tlTypeTxt, { color: dotColor }, boldStyle]}>
                {isUrl ? 'URL 방문' : 'AI 질문'}
              </Text>
            </View>
            {item.crossStep && (
              <View style={[styles.tlTypeBadge, { backgroundColor: '#FFF3E0', marginLeft: 4 }]}>
                <Text style={[styles.tlTypeTxt, { color: '#E65100' }, boldStyle]}>이전 단계</Text>
              </View>
            )}
            {item.stepLabel ? (
              <View style={[styles.tlTypeBadge, { backgroundColor: C.background, marginLeft: 4 }]}>
                <Text style={[styles.tlTypeTxt, { color: C.textSecondary }, boldStyle]} numberOfLines={1}>
                  {item.stepLabel}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.tlTime, boldStyle]}>{fmtTimeline(item.time, { withDate })}</Text>
          </View>
          {isUrl ? (
            <View style={styles.tlBody}>
              {item.data.search_query ? (
                <View style={styles.tlSearchRow}>
                  <Ionicons name="search-outline" size={12} color={C.primary} />
                  <Text style={[styles.tlSearchTxt, boldStyle]}>{item.data.search_query}</Text>
                </View>
              ) : null}
              <Text style={[styles.tlUrl, boldStyle]} numberOfLines={3}>{item.data.url}</Text>
            </View>
          ) : (
            <View style={styles.tlBody}>
              <View style={styles.tlQBox}>
                <Text style={[styles.tlQLabel, boldStyle]}>Q</Text>
                <Text style={[styles.tlQTxt, boldStyle]}>{item.data.prompt}</Text>
              </View>
              {item.data.response ? (
                <Pressable
                  style={({ pressed }) => [styles.tlABox, pressed && { opacity: 0.75 }]}
                  onPress={() => onViewResponse({ prompt: item.data.prompt, response: item.data.response })}
                >
                  <Text style={[styles.tlALabel, boldStyle]}>A</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tlATxt, boldStyle]} numberOfLines={isBold ? undefined : 4}>
                      {item.data.response}
                    </Text>
                    {!isBold && <Text style={styles.tlAMore}>탭하여 전체 보기</Text>}
                  </View>
                </Pressable>
              ) : null}
              {(item.data.prompt_type || item.data.prompt_level != null
                || item.data.critical_use_verification || item.data.critical_use_web) && (
                <View style={styles.tlTagRow}>
                  {item.data.prompt_type && (
                    <View style={styles.tlMiniTag}>
                      <Text style={[styles.tlMiniTagTxt, boldStyle]}>
                        {getPromptTypeLabel(item.data.prompt_type)}
                      </Text>
                    </View>
                  )}
                  {item.data.prompt_level != null && (
                    <View style={[styles.tlMiniTag, { backgroundColor: C.primaryLight }]}>
                      <Text style={[styles.tlMiniTagTxt, { color: C.primary }, boldStyle]}>
                        Lv.{item.data.prompt_level}
                      </Text>
                    </View>
                  )}
                  {item.data.critical_use_verification && (
                    <View style={[styles.tlMiniTag, { backgroundColor: CRITICAL_USE_BG }]}>
                      <Text style={[styles.tlMiniTagTxt, { color: CRITICAL_USE_COLOR }, boldStyle]}>
                        비판적 사용 - 검증 질문
                      </Text>
                    </View>
                  )}
                  {item.data.critical_use_web && (
                    <View style={[styles.tlMiniTag, { backgroundColor: CRITICAL_USE_BG }]}>
                      <Text style={[styles.tlMiniTagTxt, { color: CRITICAL_USE_COLOR }, boldStyle]}>
                        비판적 사용 - 웹 검색
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  });
}

function ResponseModal({ responseModal, onClose }) {
  if (!responseModal) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.respOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.respSheet}>
          <View style={styles.respHeader}>
            <Text style={styles.respTitle}>AI 답변 전체 보기</Text>
            <Pressable onPress={onClose} style={styles.respClose}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.respScroll} contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.tlQBox}>
              <Text style={styles.tlQLabel}>Q</Text>
              <Text style={styles.tlQTxt}>{responseModal.prompt}</Text>
            </View>
            <View style={[styles.tlABox, { marginTop: 10 }]}>
              <Text style={styles.tlALabel}>A</Text>
              <Text style={[styles.tlATxt, { flex: 1 }]}>{responseModal.response}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StepSentencesBlock({
  stepIdKey,
  stepTitle,
  sentences = [],
  onJumpToAiLog,
  onClearHighlight,
  compliance = null,
  selectedSegmentKey = null,
  contentAtUnlock = null,
  browserUnlockedAt = null,
  submissionContent = null,
  aiPermission = null,
  byStep = [],
  aiLogs = [],
}) {
  const hasUnlockSnapshot = !!contentAtUnlock?.trim();
  const { before, after, showDivider } = hasUnlockSnapshot
    ? partitionSentencesByUnlock(sentences, contentAtUnlock, submissionContent)
    : { before: sentences, after: [], showDivider: false };

  return (
    <View style={styles.stepBlock}>
      <Pressable onPress={onClearHighlight} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        <View style={styles.stepHead}>
          <Text style={styles.stepTitle} numberOfLines={1}>{stepTitle}</Text>
          <StepComplianceBadge compliance={compliance} />
        </View>
      </Pressable>
      {sentences.length === 0 ? (
        <Text style={styles.sentenceEmpty}>제출된 내용이 없습니다.</Text>
      ) : (
        <View>
          <Text style={styles.paragraphWrap}>
            {renderSentenceSegments({
              sentences: before,
              stepIdKey,
              onJumpToAiLog,
              selectedSegmentKey,
              keyPrefix: 'pre-',
              linkZone: showDivider ? 'pre-unlock' : 'all',
              byStep,
              aiLogs,
              browserUnlockedAt,
            })}
          </Text>
          {showDivider ? (
            <>
              <ConditionalUnlockDivider unlockedAt={browserUnlockedAt} />
              {after.length > 0 ? (
                <Text style={styles.paragraphWrap}>
                  {renderSentenceSegments({
                    sentences: after,
                    stepIdKey,
                    onJumpToAiLog,
                    selectedSegmentKey,
                    keyPrefix: 'post-',
                    linkZone: 'all',
                    byStep,
                    aiLogs,
                    browserUnlockedAt,
                  })}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function resolveAiLogOffset(aiLogId, aiItemOffsets) {
  if (aiLogId == null || !aiItemOffsets?.current) return null;
  const map = aiItemOffsets.current;
  if (map[aiLogId] != null) return map[aiLogId];
  const asString = String(aiLogId);
  if (map[asString] != null) return map[asString];
  return null;
}

/** 형광펜 탭 → 오른쪽 패널 내부 스크롤로 해당 AI 로그 이동 */
function scrollToAiLogInPanel(aiLogId, { rightScrollRef, rightContentRef, aiItemRefs, aiItemOffsets }) {
  const scroll = rightScrollRef?.current;
  if (!scroll) return false;

  const offsetY = resolveAiLogOffset(aiLogId, aiItemOffsets);
  if (offsetY != null) {
    scroll.scrollTo({ y: Math.max(0, offsetY - 48), animated: true });
    return true;
  }

  const itemRef = aiItemRefs?.current?.[aiLogId] ?? aiItemRefs?.current?.[String(aiLogId)];
  const content = rightContentRef?.current;
  if (!itemRef || !content) return false;

  itemRef.measureLayout(
    content,
    (_x, y) => {
      scroll.scrollTo({ y: Math.max(0, y - 48), animated: true });
    },
    () => {
      if (Platform.OS === 'web') {
        const node = typeof itemRef.getScrollableNode === 'function'
          ? itemRef.getScrollableNode()
          : itemRef;
        node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
    }
  );
  return true;
}

/** 하이라이트 해제 후 재강조 간격 (같은 AI 로그 재선택 시 변화감) */
const HIGHLIGHT_FLASH_MS = 160;

/** 좌: 형광펜 제출문(단계별) · 우: sticky + 내부 스크롤 활동 타임라인 */
export const SimilarityActivitySplitPanel = forwardRef(function SimilarityActivitySplitPanel(
  {
    stepDisplayList = [],
    urlLogs = [],
    aiLogs = [],
    byStep = [],
    fillViewport = false,
    onOuterScrollLock,
  },
  ref
) {
  const { height: windowHeight } = useWindowDimensions();
  const useFillViewport = fillViewport && Platform.OS !== 'web';
  // 전체 스크롤(바깥) + 좌·우 패널 각각 내부 스크롤 (우측 sticky)
  const panelMaxHeight = useFillViewport
    ? undefined
    : Math.max(320, Math.floor(windowHeight * 0.72));
  const rightScrollMaxHeight = useFillViewport
    ? undefined
    : panelMaxHeight - 38;

  const [responseModal, setResponseModal] = useState(null);
  const [selectedSegmentKey, setSelectedSegmentKey] = useState(null);
  const [highlightAiLogId, setHighlightAiLogId] = useState(null);
  const aiItemRefs = useRef({});
  const aiItemOffsets = useRef({});
  const rightScrollRef = useRef(null);
  const rightContentRef = useRef(null);
  const pendingScrollId = useRef(null);
  const flashTimerRef = useRef(null);

  const handleAiItemLayout = useCallback((aiLogId, y) => {
    aiItemOffsets.current[aiLogId] = y;
    aiItemOffsets.current[String(aiLogId)] = y;
  }, []);

  const timeline = useMemo(
    () => buildUnifiedTimeline(urlLogs, aiLogs, byStep, highlightAiLogId),
    [urlLogs, aiLogs, byStep, highlightAiLogId]
  );

  const performScrollToAiLog = useCallback((aiLogId) => {
    return scrollToAiLogInPanel(aiLogId, {
      rightScrollRef,
      rightContentRef,
      aiItemRefs,
      aiItemOffsets,
    });
  }, []);

  useEffect(() => {
    const id = pendingScrollId.current;
    if (id == null) return;
    pendingScrollId.current = null;

    const attempt = () => performScrollToAiLog(id);
    requestAnimationFrame(() => {
      if (attempt()) return;
      setTimeout(() => {
        if (attempt()) return;
        setTimeout(attempt, 120);
      }, 80);
    });
  }, [highlightAiLogId, timeline, performScrollToAiLog]);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const clearHighlight = useCallback(() => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    pendingScrollId.current = null;
    setHighlightAiLogId(null);
    setSelectedSegmentKey(null);
  }, []);

  useImperativeHandle(ref, () => ({ clearHighlight }), [clearHighlight]);

  const handleJumpToAiLog = useCallback(({ aiLogId, segmentKey }) => {
    if (aiLogId == null) return;

    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);

    setSelectedSegmentKey(segmentKey ?? null);
    setHighlightAiLogId(null);

    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null;
      pendingScrollId.current = aiLogId;
      setHighlightAiLogId(aiLogId);
    }, HIGHLIGHT_FLASH_MS);
  }, []);

  const renderLeftContent = () => (
    stepDisplayList.length === 0 ? (
      <Text style={styles.sentenceEmpty}>제출된 내용이 없습니다.</Text>
    ) : (
      stepDisplayList.map(({
        stepIdKey,
        stepTitle,
        sentences,
        compliance,
        contentAtUnlock,
        browserUnlockedAt,
        submissionContent,
        aiPermission,
      }, idx) => (
        <View key={stepIdKey}>
          {idx > 0 && <View style={styles.stepDivider} />}
          <StepSentencesBlock
            stepIdKey={stepIdKey}
            stepTitle={stepTitle}
            sentences={sentences}
            onJumpToAiLog={handleJumpToAiLog}
            onClearHighlight={clearHighlight}
            compliance={compliance}
            selectedSegmentKey={selectedSegmentKey}
            contentAtUnlock={contentAtUnlock}
            browserUnlockedAt={browserUnlockedAt}
            submissionContent={submissionContent}
            aiPermission={aiPermission}
            byStep={byStep}
            aiLogs={aiLogs}
          />
        </View>
      ))
    )
  );

  const useOuterScrollLock = !useFillViewport && !!onOuterScrollLock;
  const innerLock = innerScrollLockProps(useOuterScrollLock ? onOuterScrollLock : null);

  const splitPanel = (
    <View style={[
      styles.splitRow,
      useFillViewport && styles.splitRowFill,
      !useFillViewport && panelMaxHeight != null && { minHeight: panelMaxHeight },
    ]}>
      <View style={[styles.leftCol, useFillViewport && styles.leftColFill]}>
        <ScrollView
          style={[
            styles.leftScroll,
            !useFillViewport && panelMaxHeight != null && { maxHeight: panelMaxHeight },
          ]}
          contentContainerStyle={styles.leftColContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          {...innerLock}
        >
          {renderLeftContent()}
        </ScrollView>
      </View>

      <View style={styles.divider} />

      <View style={[
        styles.rightCol,
        useFillViewport && styles.rightColFill,
        !useFillViewport && styles.rightColSticky,
        !useFillViewport && panelMaxHeight != null && { maxHeight: panelMaxHeight },
      ]}>
        <Pressable onPress={clearHighlight}>
          <Text style={styles.rightColTitle}>활동 기록 (시간순)</Text>
        </Pressable>
        <ScrollView
          ref={rightScrollRef}
          style={[
            useFillViewport ? styles.rightScrollFill : null,
            !useFillViewport && rightScrollMaxHeight != null && { maxHeight: rightScrollMaxHeight },
          ]}
          contentContainerStyle={styles.rightTimeline}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          {...innerLock}
        >
          <View ref={rightContentRef} collapsable={false}>
            <TimelineList
              timeline={timeline}
              matchedAiLogId={highlightAiLogId}
              aiItemRefs={aiItemRefs}
              onAiItemLayout={handleAiItemLayout}
              onViewResponse={setResponseModal}
              withDate
            />
          </View>
        </ScrollView>
      </View>
    </View>
  );

  return (
    <>
      <OuterScrollLockZone enabled={useOuterScrollLock} onLockChange={onOuterScrollLock}>
        {splitPanel}
      </OuterScrollLockZone>

      <ResponseModal responseModal={responseModal} onClose={() => setResponseModal(null)} />
    </>
  );
});

/** @deprecated default export — StepSentencesBlock 단독용 */
export default function SimilarityStepSplit(props) {
  return <StepSentencesBlock {...props} />;
}

const styles = StyleSheet.create({
  stepBlock: { gap: 10, marginBottom: 4 },
  stepDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 14,
  },
  unlockDividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  unlockDividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: C.text,
    opacity: 0.35,
  },
  unlockDividerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#f5f5f5',
  },
  unlockDividerLabel: {
    fontFamily: F.sansMedium,
    fontSize: 10,
    color: C.textSecondary,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 8,
  },
  stepTitle: {
    fontFamily: F.sansMedium,
    fontSize: 13,
    color: C.text,
    flexShrink: 1,
    minWidth: 0,
  },
  complianceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
  },
  complianceBadgeText: { fontFamily: F.sansMedium, fontSize: 12 },
  compliancePass: { color: '#2E7D32' },
  complianceFail: { color: '#C62828' },

  sentenceEmpty: {
    fontFamily: F.sans,
    fontSize: 12,
    color: C.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  paragraphWrap: {
    fontFamily: F.sans,
    fontSize: 13,
    color: C.text,
    lineHeight: 22,
  },

  splitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.card,
    overflow: 'visible',
  },
  splitRowFill: {
    flex: 1,
    minHeight: 280,
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
  },
  leftColFill: {
    flex: 1,
    minHeight: 0,
  },
  leftScroll: {
    flex: 1,
  },
  leftColContent: { padding: 12, paddingBottom: 16 },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: C.border,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
    backgroundColor: C.background,
    overflow: 'hidden',
  },
  rightColSticky: {
    position: 'sticky',
    top: 12,
    alignSelf: 'flex-start',
    zIndex: 1,
  },
  rightColFill: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
  },
  rightScrollFill: {
    flex: 1,
  },
  rightColTitle: {
    fontFamily: F.sansMedium,
    fontSize: 11,
    color: C.textSecondary,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  rightTimeline: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12 },

  sentenceText: {
    fontFamily: F.sans,
    fontSize: 13,
    color: C.text,
    lineHeight: 22,
  },
  sentencePressable: {
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  sentenceSelected: {
    borderWidth: 2,
    borderColor: C.text,
    borderRadius: 4,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },

  timelineEmpty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  timelineEmptyText: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, textAlign: 'center' },

  tlItem: { flexDirection: 'row', gap: 10 },
  tlLineCol: { alignItems: 'center', width: 14, paddingTop: 2 },
  tlDot: { width: 10, height: 10, borderRadius: 5 },
  tlDotBold: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.text },
  tlLine: { flex: 1, width: 2, backgroundColor: C.border, marginVertical: 3, minHeight: 12 },
  tlCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  tlCardBold: {
    borderColor: C.text,
    borderWidth: 1.5,
  },
  tlItemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tlTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  tlTypeTxt: { fontFamily: F.sansMedium, fontSize: 11 },
  tlTime: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary, marginLeft: 'auto' },
  tlBody: { padding: 10, gap: 6 },
  tlSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tlSearchTxt: { fontFamily: F.sansMedium, fontSize: 12, color: C.text, flex: 1 },
  tlUrl: { fontFamily: F.mono, fontSize: 10, color: C.primary, lineHeight: 15 },
  tlQBox: { flexDirection: 'row', gap: 6, backgroundColor: C.background, borderRadius: 8, padding: 8 },
  tlQLabel: { fontFamily: F.sansBold, fontSize: 12, color: C.primary, width: 16, textAlign: 'center' },
  tlQTxt: { fontFamily: F.sansMedium, fontSize: 12, color: C.text, lineHeight: 18, flex: 1 },
  tlABox: { flexDirection: 'row', gap: 6, backgroundColor: '#F8F8F8', borderRadius: 8, padding: 8 },
  tlALabel: { fontFamily: F.sansBold, fontSize: 12, color: C.textSecondary, width: 16, textAlign: 'center' },
  tlATxt: { fontFamily: F.sans, fontSize: 12, color: C.textSecondary, lineHeight: 18, flex: 1 },
  tlAMore: { fontFamily: F.sans, fontSize: 10, color: C.primary, marginTop: 3 },
  tlTagRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  tlMiniTag: { backgroundColor: C.border, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  tlMiniTagTxt: { fontFamily: F.sansMedium, fontSize: 10, color: C.textSecondary },
  boldText: { fontFamily: F.sansBold, color: C.text },

  respOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  respSheet: { backgroundColor: C.background, borderRadius: 16, maxHeight: '75%', overflow: 'hidden' },
  respHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  respTitle: { fontFamily: F.sansBold, fontSize: 15, color: C.text },
  respClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  respScroll: { padding: 16 },
});
