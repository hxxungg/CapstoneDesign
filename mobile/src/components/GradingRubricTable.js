import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME, FONTS } from '../config/api';

const C = THEME;
const F = FONTS;

const HDR = '#D9EAD3';
const BORDER = '#9AA89A';
const ROW_H = 44;
/** 채점기준표 — 좌측 라벨열 : 우측 내용열 (모바일·웹 동일 비율) */
const LABEL_COL_FLEX = 1.2;
const CONTENT_COL_FLEX = 4.8;
/** 평가 요소 블록 — 우측 표 열 비율 (simple / subBlocks 공통) */
const RUBRIC_SUB_ELEMENT_FLEX = 1.1;
const RUBRIC_LEVEL_FLEX = 3.2;
const RUBRIC_SCORE_FLEX = 0.9;
const RUBRIC_REMOVE_COL_W = 28;
const RUBRIC_METRIC_INNER_TOTAL = RUBRIC_LEVEL_FLEX + RUBRIC_SCORE_FLEX;
const RUBRIC_SUB_ROW_TOTAL = RUBRIC_SUB_ELEMENT_FLEX + RUBRIC_METRIC_INNER_TOTAL;

function fixedColWidth(px) {
  return {
    width: px,
    minWidth: px,
    maxWidth: px,
    flexGrow: 0,
    flexShrink: 0,
  };
}

/** 수행 수준·배점·삭제 열 — metric 영역 너비 기준 픽셀 고정 */
function computeMetricCols(metricW, hasRemove) {
  const metricWidth = Math.round(metricW);
  const removeW = hasRemove ? RUBRIC_REMOVE_COL_W : 0;
  const innerW = Math.max(0, metricWidth - removeW);
  const levelW = Math.round(innerW * (RUBRIC_LEVEL_FLEX / RUBRIC_METRIC_INNER_TOTAL));
  const scoreW = innerW - levelW;
  return { metricW: metricWidth, levelW, scoreW, removeW };
}

/** rubricContentArea 너비 1회 측정 → 헤더·본문 모든 행에 동일 픽셀 너비 적용 */
function computeRubricCols(contentWidth, { hasSubElement, hasRemove }) {
  const totalW = Math.round(contentWidth);
  if (!hasSubElement) {
    return { subW: 0, ...computeMetricCols(totalW, hasRemove) };
  }
  const subW = Math.round(totalW * (RUBRIC_SUB_ELEMENT_FLEX / RUBRIC_SUB_ROW_TOTAL));
  const metricW = totalW - subW;
  return { subW, ...computeMetricCols(metricW, hasRemove) };
}

function rubricSubElementColStyle(colWidths) {
  if (colWidths?.subW) return fixedColWidth(colWidths.subW);
  return { flex: RUBRIC_SUB_ELEMENT_FLEX, flexBasis: 0, minWidth: 0 };
}

function rubricLevelColStyle(colWidths) {
  if (colWidths?.levelW) return fixedColWidth(colWidths.levelW);
  return { flex: RUBRIC_LEVEL_FLEX, flexBasis: 0, minWidth: 0 };
}

function rubricScoreColStyle(colWidths) {
  if (colWidths?.scoreW) return fixedColWidth(colWidths.scoreW);
  return { flex: RUBRIC_SCORE_FLEX, flexBasis: 0, minWidth: 0 };
}

function rubricRemoveColStyle(colWidths) {
  if (colWidths?.removeW) return fixedColWidth(colWidths.removeW);
  return styles.rubricRemoveCol;
}

function rubricMetricAreaStyle(colWidths) {
  if (colWidths?.metricW) {
    return [styles.subGroupsCol, fixedColWidth(colWidths.metricW)];
  }
  return styles.subGroupsCol;
}

/** 평가 요소 그리드 셀 — 열마다 동일 border (border-collapse 유사) */
function RubricGridCell({
  children,
  header,
  col,
  colWidths,
  minHeight = 36,
  center,
  noPadding,
  noRightBorder,
  style,
}) {
  const colStyle =
    col === 'subElement'
      ? rubricSubElementColStyle(colWidths)
      : col === 'level'
        ? rubricLevelColStyle(colWidths)
        : col === 'score'
          ? rubricScoreColStyle(colWidths)
          : col === 'remove'
            ? rubricRemoveColStyle(colWidths)
            : null;
  const isRemove = col === 'remove';

  return (
    <View
      style={[
        colStyle,
        styles.rubricGridCell,
        header && styles.rubricGridCellHeader,
        isRemove && styles.rubricGridRemoveCell,
        header && isRemove && styles.rubricGridRemoveCellHeader,
        (noRightBorder || isRemove) && styles.rubricGridCellNoRight,
        center && styles.cellCenter,
        noPadding && styles.cellNoPadding,
        { minHeight },
        style,
      ]}
    >
      {typeof children === 'string' || typeof children === 'number'
        ? <Text style={[styles.cellText, header && styles.cellHeaderText]}>{children}</Text>
        : children}
    </View>
  );
}

export const EVAL_METHOD_ROWS = [
  ['논술', '구술·발표', '토의·토론', '프로젝트'],
  ['실험·실습', '포트폴리오', '기타', '교사 관찰 및 기록'],
  ['자기평가', '동료평가', '', ''],
];

export const DEFAULT_EVAL_METHODS = EVAL_METHOD_ROWS.flat().filter(Boolean);

function resolveEvalMethodKeys(data) {
  const methods = data?.evalMethods ?? {};
  if (Array.isArray(data?.evalMethodKeys) && data.evalMethodKeys.length > 0) {
    return data.evalMethodKeys;
  }
  const ordered = [...DEFAULT_EVAL_METHODS];
  Object.keys(methods).forEach((key) => {
    if (!ordered.includes(key)) ordered.push(key);
  });
  return ordered;
}

function nextEvalMethodLabel(keys) {
  let n = 1;
  while (keys.includes(`평가방법 ${n}`)) n += 1;
  return `평가방법 ${n}`;
}

export const ACHIEVE_LEVELS = ['A', 'B', 'C', 'D', 'E'];
export const DEFAULT_ACHIEVE_LEVELS = ACHIEVE_LEVELS;

function resolveAchievementLevelKeys(data) {
  const levels = data?.achievementLevels ?? {};
  if (Array.isArray(data?.achievementLevelKeys) && data.achievementLevelKeys.length > 0) {
    return data.achievementLevelKeys;
  }
  const ordered = [...DEFAULT_ACHIEVE_LEVELS];
  Object.keys(levels).forEach((key) => {
    if (!ordered.includes(key)) ordered.push(key);
  });
  return ordered;
}

function nextAchievementLevelLabel(keys) {
  for (let i = 0; i < 26; i += 1) {
    const label = String.fromCharCode(65 + i);
    if (!keys.includes(label)) return label;
  }
  let n = keys.length + 1;
  while (keys.includes(`수준${n}`)) n += 1;
  return `수준${n}`;
}

/** 채점기준표 — scoreGroups 항목당 수행 수준 1개 + 배점 1개 */
export const EMPTY_SIMPLE_BLOCK = {
  element: '',
  scoreGroups: [{ score: '', levels: [''] }],
};

export const DEFAULT_BLOCK_TEMPLATES = [
  {
    element: '',
    scoreGroups: [
      { score: '', levels: [''] },
      { score: '', levels: [''] },
      { score: '', levels: [''] },
      { score: '', levels: [''] },
      { score: '', levels: [''] },
    ],
  },
  {
    element: '',
    scoreGroups: [
      { score: '', levels: [''] },
      { score: '', levels: [''] },
      { score: '', levels: [''] },
    ],
  },
  {
    element: '',
    subBlocks: [
      {
        subElement: '',
        scoreGroups: [
          { score: '', levels: [''] },
          { score: '', levels: [''] },
          { score: '', levels: [''] },
          { score: '', levels: [''] },
        ],
      },
      {
        subElement: '',
        scoreGroups: [
          { score: '', levels: [''] },
          { score: '', levels: [''] },
          { score: '', levels: [''] },
        ],
      },
    ],
  },
  {
    element: '',
    scoreGroups: [
      { score: '', levels: [''] },
      { score: '', levels: [''] },
      { score: '', levels: [''] },
      { score: '', levels: [''] },
      { score: '', levels: [''] },
    ],
  },
];

function cloneTemplateBlock(template) {
  if (template.subBlocks) {
    return {
      element: template.element ?? '',
      subBlocks: template.subBlocks.map((sub) => ({
        subElement: sub.subElement ?? '',
        scoreGroups: sub.scoreGroups.map((g) => ({
          score: g.score ?? '',
          levels: g.levels.map((l) => l ?? ''),
        })),
      })),
    };
  }
  return {
    element: template.element ?? '',
    scoreGroups: template.scoreGroups.map((g) => ({
      score: g.score ?? '',
      levels: g.levels.map((l) => l ?? ''),
    })),
  };
}

function countBlockRows(block) {
  if (block.subBlocks) {
    return block.subBlocks.reduce(
      (sum, sub) => sum + sub.scoreGroups.reduce((s, g) => s + g.levels.length, 0),
      0
    );
  }
  return (block.scoreGroups || []).reduce((sum, g) => sum + g.levels.length, 0);
}

/** 여러 수행 수준이 하나의 배점을 공유하던 구조 → 행마다 1:1로 분리 */
function flattenScoreGroups(groups) {
  const list = groups?.length ? groups : [{ score: '', levels: [''] }];
  return list.flatMap((g) => {
    const score = g.score ?? '';
    const levels = g.levels?.length ? g.levels : [''];
    return levels.map((level) => ({
      score,
      levels: [level ?? ''],
    }));
  });
}

function normalizeScoreGroups(groups) {
  const flattened = flattenScoreGroups(groups);
  return flattened.length > 0 ? flattened : [{ score: '', levels: [''] }];
}

/** 저장된 블록 구조 유지 (추가된 행·블록 잘리지 않음) */
function normalizeBlock(block) {
  if (!block) return cloneTemplateBlock(EMPTY_SIMPLE_BLOCK);
  if (Array.isArray(block.rows)) {
    return {
      element: block.element ?? '',
      scoreGroups: block.rows.map((r) => ({
        score: r.score ?? '',
        levels: [r.level ?? ''],
      })),
    };
  }
  if (block.subBlocks) {
    return {
      element: block.element ?? '',
      subBlocks: block.subBlocks.map((sub) => ({
        subElement: sub.subElement ?? '',
        scoreGroups: normalizeScoreGroups(sub.scoreGroups),
      })),
    };
  }
  return {
    element: block.element ?? '',
    scoreGroups: normalizeScoreGroups(block.scoreGroups),
  };
}

function addScoreGroup(block, subIndex = null) {
  const row = { score: '', levels: [''] };
  if (block.subBlocks) {
    const idx = subIndex ?? block.subBlocks.length - 1;
    const subBlocks = block.subBlocks.map((sub, si) =>
      si === idx
        ? { ...sub, scoreGroups: [...sub.scoreGroups, row] }
        : sub
    );
    return { ...block, subBlocks };
  }
  return {
    ...block,
    scoreGroups: [...(block.scoreGroups || []), row],
  };
}

function removeLevelFromBlock(block, groupIndex, _levelIndex, subIndex = null) {
  const patchGroups = (groups) => {
    const next = groups.filter((_, gi) => gi !== groupIndex);
    return next.length > 0 ? next : [{ score: '', levels: [''] }];
  };

  if (block.subBlocks && subIndex != null) {
    const subBlocks = block.subBlocks.map((sub, si) =>
      si === subIndex ? { ...sub, scoreGroups: patchGroups(sub.scoreGroups) } : sub
    );
    return { ...block, subBlocks };
  }
  return { ...block, scoreGroups: patchGroups(block.scoreGroups || []) };
}

function countBlockLevels(block) {
  if (block.subBlocks) {
    return block.subBlocks.reduce(
      (sum, sub) => sum + sub.scoreGroups.reduce((s, g) => s + g.levels.length, 0),
      0
    );
  }
  return (block.scoreGroups || []).reduce((sum, g) => sum + g.levels.length, 0);
}

/** 예전 rows[] 형식 → scoreGroups(각 1행) 변환 */
function migrateLegacyBlock(block, template) {
  if (block.scoreGroups || block.subBlocks) {
    return normalizeBlock(block);
  }
  if (Array.isArray(block.rows)) {
    return normalizeBlock(block);
  }
  return cloneTemplateBlock(template);
}

export function createDefaultRubricState(initial) {
  const base = {
    areaName: '',
    areaMaxScore: '',
    semester: '',
    taskDescription: '',
    achievementStandard: '',
    achievementLevelKeys: [...DEFAULT_ACHIEVE_LEVELS],
    achievementLevels: Object.fromEntries(DEFAULT_ACHIEVE_LEVELS.map((lv) => [lv, ''])),
    evalMethodKeys: [...DEFAULT_EVAL_METHODS],
    evalMethods: Object.fromEntries(DEFAULT_EVAL_METHODS.map((k) => [k, false])),
    blocks: DEFAULT_BLOCK_TEMPLATES.map((tpl) => cloneTemplateBlock(tpl)),
    baseScore: '',
    absentScore: '',
  };
  if (!initial) return base;
  const mergedLevels = { ...base.achievementLevels, ...(initial.achievementLevels || {}) };
  const achievementLevelKeys = resolveAchievementLevelKeys({
    ...initial,
    achievementLevels: mergedLevels,
  });
  const mergedMethods = { ...base.evalMethods, ...(initial.evalMethods || {}) };
  const evalMethodKeys = resolveEvalMethodKeys({
    ...initial,
    evalMethods: mergedMethods,
  });
  return {
    ...base,
    ...initial,
    achievementLevelKeys,
    achievementLevels: mergedLevels,
    evalMethodKeys,
    evalMethods: mergedMethods,
    blocks: (initial.blocks?.length ? initial.blocks : base.blocks).map((block, i) =>
      migrateLegacyBlock(block, DEFAULT_BLOCK_TEMPLATES[i] || EMPTY_SIMPLE_BLOCK)
    ),
  };
}

function Cell({ children, style, header, flex, minHeight = 36, center, noPadding, noRightBorder }) {
  return (
    <View
      style={[
        styles.cell,
        header && styles.cellHeader,
        flex != null && styles.cellFlex,
        flex != null && { flex, flexBasis: 0 },
        { minHeight },
        center && styles.cellCenter,
        noPadding && styles.cellNoPadding,
        noRightBorder && styles.cellNoRightBorder,
        style,
      ]}
    >
      {typeof children === 'string' || typeof children === 'number'
        ? <Text style={[styles.cellText, header && styles.cellHeaderText]}>{children}</Text>
        : children}
    </View>
  );
}

/** 상단 메타 표 — 좌측 라벨열 (폭 고정) */
function LabelCol({ children, header, body, minHeight = 36, style }) {
  return (
    <View
      style={[
        styles.labelCol,
        header && styles.labelColHeader,
        body && styles.labelColBody,
        { minHeight },
        style,
      ]}
    >
      {typeof children === 'string' || typeof children === 'number'
        ? <Text style={[styles.cellText, header && styles.cellHeaderText]}>{children}</Text>
        : children}
    </View>
  );
}

/** 상단 메타 표 — 우측 내용열 */
function ContentArea({ children, row, minHeight, style }) {
  return (
    <View
      style={[
        styles.contentArea,
        row && styles.contentAreaRow,
        minHeight != null && { minHeight },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function ScoreInput({ value, onChangeText, minHeight = ROW_H, style }) {
  return (
    <View style={[styles.scoreCell, style, { minHeight }]}>
      <TextInput
        style={[styles.input, styles.inputCenter, styles.scoreInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder="점"
        placeholderTextColor={C.textFaint}
        keyboardType="numeric"
        textAlignVertical="center"
      />
    </View>
  );
}

function LevelInput({ value, onChangeText }) {
  return (
    <View style={[styles.levelCell, { minHeight: ROW_H }]}>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder="수행 수준 입력"
        placeholderTextColor={C.textFaint}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

function LevelLabelInput({ label, onRename }) {
  const [draft, setDraft] = React.useState(label);
  React.useEffect(() => {
    setDraft(label);
  }, [label]);

  const commit = () => {
    onRename(draft);
  };

  return (
    <TextInput
      style={[styles.input, styles.inputCenter, styles.levelLabelInput]}
      value={draft}
      onChangeText={setDraft}
      onEndEditing={commit}
      onBlur={commit}
      placeholder="등급"
      placeholderTextColor={C.textFaint}
      maxLength={8}
    />
  );
}

function CheckItem({ label, checked, onToggle }) {
  if (!label) return <View style={styles.checkItem} />;
  return (
    <Pressable
      style={({ pressed }) => [styles.checkItem, pressed && { opacity: 0.7 }]}
      onPress={onToggle}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked && <Ionicons name="checkmark" size={10} color="#fff" />}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function EvalMethodItem({ label, checked, isDefault, onToggle, onRemove, onRename }) {
  return (
    <View style={styles.methodItemWrap}>
      <Pressable
        style={({ pressed }) => [styles.methodCheckTap, pressed && { opacity: 0.7 }]}
        onPress={onToggle}
      >
        <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
          {checked && <Ionicons name="checkmark" size={10} color="#fff" />}
        </View>
      </Pressable>
      {isDefault ? (
        <Pressable style={styles.methodLabelTap} onPress={onToggle}>
          <Text style={styles.checkLabel}>{label}</Text>
        </Pressable>
      ) : (
        <View style={styles.methodCustomLabel}>
          <LevelLabelInput label={label} onRename={onRename} />
        </View>
      )}
      {!isDefault ? (
        <Pressable
          style={({ pressed }) => [styles.methodRemoveBtn, pressed && { opacity: 0.6 }]}
          onPress={onRemove}
          hitSlop={6}
        >
          <Ionicons name="close-circle-outline" size={14} color={C.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ScoreGroupRows({
  groups,
  onChangeGroup,
  canRemoveLevel,
  onRemoveLevel,
  colWidths,
  showSubElement = false,
  subElementForRow,
  subElementMinHeightForRow,
  rowBorderForIndex,
}) {
  return groups.map((group, gi) => (
    <RubricMetricRow
      key={gi}
      colWidths={colWidths}
      canRemoveLevel={canRemoveLevel}
      showSubElement={showSubElement}
      subElement={subElementForRow?.(gi)}
      subElementMinHeight={subElementMinHeightForRow?.(gi)}
      level={
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={group.levels[0] ?? ''}
          onChangeText={(t) => onChangeGroup(gi, { ...group, levels: [t] })}
          placeholder="수행 수준 입력"
          placeholderTextColor={C.textFaint}
          multiline
          textAlignVertical="top"
        />
      }
      score={
        <TextInput
          style={[styles.input, styles.inputCenter, styles.scoreInput, styles.rubricScoreInput]}
          value={group.score}
          onChangeText={(t) => onChangeGroup(gi, { ...group, score: t })}
          placeholder="점"
          placeholderTextColor={C.textFaint}
          keyboardType="numeric"
          textAlignVertical="center"
        />
      }
      onRemove={() => onRemoveLevel?.(gi, 0)}
      rowBorder={rowBorderForIndex?.(gi)}
    />
  ));
}

/** 평가 요소 표 — 열을 한 행에 평탄 배치 (헤더·본문 세로선 동일) */
function RubricMetricRow({
  header,
  canRemoveLevel,
  colWidths,
  showSubElement = false,
  subElement,
  subElementMinHeight,
  level,
  score,
  onRemove,
  rowBorder,
  minHeight = header ? 40 : ROW_H,
}) {
  const body = !header;
  const hasRemove = !!canRemoveLevel;

  return (
    <View
      style={[
        styles.row,
        styles.rubricMetricRow,
        rowBorder && styles.rowBorder,
        header && styles.rubricMetricHeaderRow,
      ]}
    >
      {showSubElement ? (
        <RubricGridCell
          col="subElement"
          colWidths={colWidths}
          header={header}
          minHeight={subElementMinHeight ?? minHeight}
          noPadding={body && subElement != null}
        >
          {subElement}
        </RubricGridCell>
      ) : null}
      <RubricGridCell col="level" colWidths={colWidths} header={header} minHeight={minHeight} noPadding={body}>
        {level}
      </RubricGridCell>
      <RubricGridCell
        col="score"
        colWidths={colWidths}
        header={header}
        minHeight={minHeight}
        center={header}
        noPadding={body}
        noRightBorder={hasRemove}
        style={body ? styles.rubricScoreCellBody : null}
      >
        {score}
      </RubricGridCell>
      {hasRemove ? (
        <RubricGridCell col="remove" colWidths={colWidths} header={header} minHeight={minHeight} noPadding>
          {!header && onRemove ? (
            <Pressable
              style={({ pressed }) => [styles.rubricRemoveBtn, pressed && { opacity: 0.6 }]}
              onPress={onRemove}
              hitSlop={6}
            >
              <Ionicons name="close-circle-outline" size={14} color={C.textSecondary} />
            </Pressable>
          ) : null}
        </RubricGridCell>
      ) : null}
    </View>
  );
}

function RubricAddLevelRow({
  showSubElement,
  canRemoveLevel,
  colWidths,
  onPress,
  label = '수행 수준 추가',
}) {
  const hasRemove = !!canRemoveLevel;
  return (
    <View style={[styles.row, styles.rubricMetricRow, styles.rowBorder]}>
      {showSubElement ? (
        <View
          style={[
            rubricSubElementColStyle(colWidths),
            styles.rubricGridCell,
            styles.rubricAddLevelSubSpacer,
          ]}
        />
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.row,
          styles.rubricAddLevelMain,
          colWidths?.metricW ? fixedColWidth(colWidths.metricW) : styles.rubricMetricInnerFull,
          { minHeight: 36 },
          pressed && { opacity: 0.75 },
        ]}
        onPress={onPress}
      >
        <View style={[rubricLevelColStyle(colWidths), styles.rubricGridCell, styles.rubricAddLevelSplit]} />
        <View
          style={[
            rubricScoreColStyle(colWidths),
            styles.rubricAddLevelSplit,
            hasRemove && styles.rubricGridCellNoRight,
          ]}
        />
        <View style={styles.rubricAddLevelOverlay} pointerEvents="none">
          <Ionicons name="add-circle-outline" size={14} color={C.primary} />
          <Text style={styles.addLevelText}>{label}</Text>
        </View>
      </Pressable>
      {hasRemove ? (
        <View style={[rubricRemoveColStyle(colWidths), styles.rubricAddLevelRemoveSpacer]} />
      ) : null}
    </View>
  );
}

function RubricBlock({
  block,
  blockIndex,
  onChangeBlock,
  onRemoveBlock,
  canRemoveBlock,
}) {
  const totalRows = countBlockRows(block);
  const totalLevels = countBlockLevels(block);
  const canRemoveLevel = totalLevels > 1;
  const hasSubElement = !!block.subBlocks;
  const [colWidths, setColWidths] = React.useState(null);

  const handleRubricContentLayout = React.useCallback(
    (e) => {
      const width = e.nativeEvent.layout.width;
      if (width <= 0) return;
      const next = computeRubricCols(width, { hasSubElement, hasRemove: canRemoveLevel });
      setColWidths((prev) => {
        if (
          prev
          && prev.subW === next.subW
          && prev.metricW === next.metricW
          && prev.levelW === next.levelW
          && prev.scoreW === next.scoreW
          && prev.removeW === next.removeW
        ) {
          return prev;
        }
        return next;
      });
    },
    [hasSubElement, canRemoveLevel]
  );

  const setElement = (text) => onChangeBlock(blockIndex, { ...block, element: text });

  const patchScoreGroups = (scoreGroups) =>
    onChangeBlock(blockIndex, { ...block, scoreGroups });

  const patchSubBlocks = (subBlocks) =>
    onChangeBlock(blockIndex, { ...block, subBlocks });

  const handleRemoveLevel = (groupIndex, levelIndex, subIndex = null) => {
    if (!canRemoveLevel) return;
    onChangeBlock(blockIndex, removeLevelFromBlock(block, groupIndex, levelIndex, subIndex));
  };

  const handleAddScoreGroup = (subIndex = null) => {
    onChangeBlock(blockIndex, addScoreGroup(block, subIndex));
  };

  const handleAddSubBlock = () => {
    if (!block.subBlocks) return;
    onChangeBlock(blockIndex, {
      ...block,
      subBlocks: [
        ...block.subBlocks,
        { subElement: '', scoreGroups: [{ score: '', levels: [''] }] },
      ],
    });
  };

  const handleRemoveSubBlock = (subIndex) => {
    if (!block.subBlocks || block.subBlocks.length <= 1) return;
    onChangeBlock(blockIndex, {
      ...block,
      subBlocks: block.subBlocks.filter((_, i) => i !== subIndex),
    });
  };

  const blockToolbar = (
    <View style={styles.blockToolbar}>
      {canRemoveBlock ? (
        <Pressable
          style={({ pressed }) => [styles.blockToolbarBtn, pressed && { opacity: 0.7 }]}
          onPress={() => onRemoveBlock?.(blockIndex)}
        >
          <Ionicons name="trash-outline" size={14} color="#C62828" />
          <Text style={styles.blockRemoveText}>평가 요소 삭제</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const elementColPanel = (
    <View style={styles.rubricElementCol}>
      <View style={styles.rubricElementHeader}>
        <Text style={[styles.cellText, styles.cellHeaderText]}>평가 요소</Text>
      </View>
      <View style={[styles.rubricElementBody, { minHeight: totalRows * ROW_H }]}>
        <TextInput
          style={[styles.input, styles.inputMultiline, styles.elementInput]}
          value={block.element}
          onChangeText={setElement}
          placeholder="평가 요소 입력"
          placeholderTextColor={C.textFaint}
          multiline
          textAlignVertical="top"
        />
      </View>
    </View>
  );

  const metricHeaderRow = hasSubElement ? (
    <View style={styles.subBlockWrap}>
      <RubricGridCell col="subElement" colWidths={colWidths} header minHeight={40}>
        세부 요소
      </RubricGridCell>
      <View style={rubricMetricAreaStyle(colWidths)}>
        <RubricMetricRow
          header
          colWidths={colWidths}
          canRemoveLevel={canRemoveLevel}
          level="수행 수준"
          score="배점"
        />
      </View>
    </View>
  ) : (
    <RubricMetricRow
      header
      colWidths={colWidths}
      canRemoveLevel={canRemoveLevel}
      level="수행 수준"
      score="배점"
    />
  );

  const metricBodyContent = block.subBlocks ? (
    <>
      {block.subBlocks.map((sub, si) => {
        const subRows = sub.scoreGroups.reduce((s, g) => s + g.levels.length, 0);
        return (
          <View key={si}>
            <View style={[styles.subBlockWrap, si > 0 && styles.rowBorder]}>
              <View
                style={[
                  rubricSubElementColStyle(colWidths),
                  styles.rubricGridCell,
                  styles.subElementCol,
                  { minHeight: subRows * ROW_H },
                ]}
              >
                <TextInput
                  style={[styles.input, styles.inputMultiline, { flex: 1, padding: 8 }]}
                  value={sub.subElement}
                  onChangeText={(t) => {
                    const subBlocks = block.subBlocks.map((sb, idx) =>
                      idx === si ? { ...sb, subElement: t } : sb
                    );
                    patchSubBlocks(subBlocks);
                  }}
                  placeholder="세부 요소"
                  placeholderTextColor={C.textFaint}
                  multiline
                  textAlignVertical="top"
                />
                {block.subBlocks.length > 1 ? (
                  <Pressable
                    style={({ pressed }) => [styles.subBlockRemoveBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => handleRemoveSubBlock(si)}
                  >
                    <Ionicons name="close-circle-outline" size={14} color={C.textSecondary} />
                    <Text style={styles.subBlockRemoveText}>세부 요소 삭제</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={rubricMetricAreaStyle(colWidths)}>
                <ScoreGroupRows
                  groups={sub.scoreGroups}
                  colWidths={colWidths}
                  canRemoveLevel={canRemoveLevel}
                  rowBorderForIndex={(gi) => gi > 0}
                  onRemoveLevel={(gi, li) => handleRemoveLevel(gi, li, si)}
                  onChangeGroup={(gi, group) => {
                    const subBlocks = block.subBlocks.map((sb, idx) => {
                      if (idx !== si) return sb;
                      const scoreGroups = sb.scoreGroups.map((g, gIdx) =>
                        gIdx === gi ? group : g
                      );
                      return { ...sb, scoreGroups };
                    });
                    patchSubBlocks(subBlocks);
                  }}
                />
                <RubricAddLevelRow
                  colWidths={colWidths}
                  canRemoveLevel={canRemoveLevel}
                  onPress={() => handleAddScoreGroup(si)}
                />
              </View>
            </View>
          </View>
        );
      })}
      <Pressable
        style={({ pressed }) => [styles.addLevelRow, styles.subBlockAddRow, pressed && { opacity: 0.75 }]}
        onPress={handleAddSubBlock}
      >
        <Ionicons name="add-circle-outline" size={14} color={C.primary} />
        <Text style={styles.addLevelText}>세부 요소 추가</Text>
      </Pressable>
    </>
  ) : (
    <>
      <ScoreGroupRows
        groups={block.scoreGroups}
        colWidths={colWidths}
        canRemoveLevel={canRemoveLevel}
        rowBorderForIndex={(gi) => gi > 0}
        onRemoveLevel={(gi, li) => handleRemoveLevel(gi, li)}
        onChangeGroup={(gi, group) => {
          const scoreGroups = block.scoreGroups.map((g, idx) => (idx === gi ? group : g));
          patchScoreGroups(scoreGroups);
        }}
      />
      <RubricAddLevelRow
        colWidths={colWidths}
        canRemoveLevel={canRemoveLevel}
        onPress={() => handleAddScoreGroup()}
      />
    </>
  );

  return (
    <View style={styles.rubricBlockWrap}>
      {blockToolbar}
      <View style={styles.rubricBlock}>
        {elementColPanel}
        <View style={styles.rubricContentArea} onLayout={handleRubricContentLayout}>
          {metricHeaderRow}
          {metricBodyContent}
        </View>
      </View>
    </View>
  );
}

export default function GradingRubricTable({ value, onChange }) {
  const data = value ?? createDefaultRubricState();
  const levelKeys = resolveAchievementLevelKeys(data);
  const methodKeys = resolveEvalMethodKeys(data);

  const patch = (partial) => onChange?.({ ...data, ...partial });

  const setAchievement = (level, text) => {
    patch({ achievementLevels: { ...data.achievementLevels, [level]: text } });
  };

  const renameAchievementLevel = (oldKey, rawLabel) => {
    const label = rawLabel.trim();
    if (!label || label === oldKey) return;
    if (levelKeys.includes(label)) return;
    const keys = levelKeys.map((k) => (k === oldKey ? label : k));
    const levels = { ...data.achievementLevels, [label]: data.achievementLevels[oldKey] ?? '' };
    delete levels[oldKey];
    patch({ achievementLevelKeys: keys, achievementLevels: levels });
  };

  const addAchievementLevel = () => {
    const label = nextAchievementLevelLabel(levelKeys);
    patch({
      achievementLevelKeys: [...levelKeys, label],
      achievementLevels: { ...data.achievementLevels, [label]: '' },
    });
  };

  const removeAchievementLevel = (key) => {
    if (levelKeys.length <= 1) return;
    const keys = levelKeys.filter((k) => k !== key);
    const levels = { ...data.achievementLevels };
    delete levels[key];
    patch({ achievementLevelKeys: keys, achievementLevels: levels });
  };

  const toggleMethod = (key) => {
    patch({ evalMethods: { ...data.evalMethods, [key]: !data.evalMethods[key] } });
  };

  const renameEvalMethod = (oldKey, rawLabel) => {
    const label = rawLabel.trim();
    if (!label || label === oldKey) return;
    if (methodKeys.includes(label)) return;
    const keys = methodKeys.map((k) => (k === oldKey ? label : k));
    const methods = { ...data.evalMethods, [label]: data.evalMethods[oldKey] ?? false };
    delete methods[oldKey];
    patch({ evalMethodKeys: keys, evalMethods: methods });
  };

  const addEvalMethod = () => {
    const label = nextEvalMethodLabel(methodKeys);
    patch({
      evalMethodKeys: [...methodKeys, label],
      evalMethods: { ...data.evalMethods, [label]: false },
    });
  };

  const removeEvalMethod = (key) => {
    if (DEFAULT_EVAL_METHODS.includes(key)) return;
    const keys = methodKeys.filter((k) => k !== key);
    const methods = { ...data.evalMethods };
    delete methods[key];
    patch({ evalMethodKeys: keys, evalMethods: methods });
  };

  const setBlock = (blockIndex, block) => {
    const blocks = data.blocks.map((b, i) => (i === blockIndex ? block : b));
    patch({ blocks });
  };

  const addBlock = () => {
    patch({
      blocks: [...data.blocks, cloneTemplateBlock(EMPTY_SIMPLE_BLOCK)],
    });
  };

  const removeBlock = (blockIndex) => {
    if (data.blocks.length <= 1) return;
    patch({ blocks: data.blocks.filter((_, i) => i !== blockIndex) });
  };

  return (
    <View style={styles.table}>
      <Cell header center minHeight={44} style={styles.titleRow}>
        채점기준표
      </Cell>

      <View style={[styles.row, styles.rowBorder]}>
        <LabelCol header minHeight={40}>평가 영역명</LabelCol>
        <ContentArea row minHeight={40}>
          <Cell flex={1.6} minHeight={40} noPadding>
            <TextInput style={styles.input} value={data.areaName} onChangeText={(t) => patch({ areaName: t })} placeholder="영역명" placeholderTextColor={C.textFaint} />
          </Cell>
          <Cell header flex={1} minHeight={40} center>영역만점</Cell>
          <Cell flex={0.8} minHeight={40} noPadding>
            <TextInput style={[styles.input, styles.inputCenter]} value={data.areaMaxScore} onChangeText={(t) => patch({ areaMaxScore: t })} placeholder="점" placeholderTextColor={C.textFaint} keyboardType="numeric" />
          </Cell>
          <Cell header flex={0.7} minHeight={40} center>학기</Cell>
          <Cell flex={0.7} minHeight={40} noPadding noRightBorder>
            <TextInput style={[styles.input, styles.inputCenter]} value={data.semester} onChangeText={(t) => patch({ semester: t })} placeholder="1학기" placeholderTextColor={C.textFaint} />
          </Cell>
        </ContentArea>
      </View>

      <View style={[styles.row, styles.rowBorder]}>
        <LabelCol header minHeight={56}>수행과제</LabelCol>
        <ContentArea minHeight={56}>
          <TextInput style={[styles.input, styles.inputMultiline, styles.inputFillCell]} value={data.taskDescription} onChangeText={(t) => patch({ taskDescription: t })} placeholder="수행과제 내용 입력" placeholderTextColor={C.textFaint} multiline textAlignVertical="top" />
        </ContentArea>
      </View>

      <View style={styles.rowBorder}>
        <View style={styles.row}>
          <LabelCol header minHeight={40}>성취기준</LabelCol>
          <View style={[styles.contentArea, styles.contentAreaHeader, styles.labelColHeader, { minHeight: 40 }]}>
            <Text style={[styles.cellText, styles.cellHeaderText, styles.contentAreaHeaderText]}>성취기준별 성취수준</Text>
          </View>
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <LabelCol body minHeight={levelKeys.length * ROW_H + 40} style={styles.labelColInput}>
            <TextInput
              style={[
                styles.input,
                styles.inputMultiline,
                styles.achievementStandardInput,
                { minHeight: levelKeys.length * ROW_H + 36 },
              ]}
              value={data.achievementStandard ?? ''}
              onChangeText={(t) => patch({ achievementStandard: t })}
              placeholder="성취기준 내용 입력"
              placeholderTextColor={C.textFaint}
              multiline
              textAlignVertical="top"
            />
          </LabelCol>
          <ContentArea>
            {levelKeys.map((lv, i) => (
              <View key={`${lv}-${i}`} style={[styles.row, styles.achievementLevelRow, i > 0 && styles.rowBorder]}>
                <Cell flex={0.22} center minHeight={ROW_H} noPadding>
                  <LevelLabelInput label={lv} onRename={(next) => renameAchievementLevel(lv, next)} />
                </Cell>
                <Cell flex={1} minHeight={ROW_H} noPadding noRightBorder={!levelKeys.length || levelKeys.length <= 1}>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={data.achievementLevels[lv] ?? ''}
                    onChangeText={(t) => setAchievement(lv, t)}
                    placeholder={`${lv} 수준 설명`}
                    placeholderTextColor={C.textFaint}
                    multiline
                    textAlignVertical="top"
                  />
                </Cell>
                {levelKeys.length > 1 ? (
                  <Pressable
                    style={({ pressed }) => [styles.levelRemoveBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => removeAchievementLevel(lv)}
                    hitSlop={6}
                  >
                    <Ionicons name="close-circle-outline" size={16} color={C.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            <Pressable
              style={({ pressed }) => [styles.addLevelRow, pressed && { opacity: 0.75 }]}
              onPress={addAchievementLevel}
            >
              <Ionicons name="add-circle-outline" size={16} color={C.primary} />
              <Text style={styles.addLevelText}>성취수준 추가</Text>
            </Pressable>
          </ContentArea>
        </View>
      </View>

      <View style={[styles.row, styles.rowBorder]}>
        <LabelCol header style={styles.labelColStretch}>{'평가\n방법'}</LabelCol>
        <ContentArea>
          <View style={styles.methodRow}>
            {methodKeys.map((label) => (
              <EvalMethodItem
                key={label}
                label={label}
                checked={!!data.evalMethods[label]}
                isDefault={DEFAULT_EVAL_METHODS.includes(label)}
                onToggle={() => toggleMethod(label)}
                onRemove={() => removeEvalMethod(label)}
                onRename={(next) => renameEvalMethod(label, next)}
              />
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.addLevelRow, pressed && { opacity: 0.75 }]}
            onPress={addEvalMethod}
          >
            <Ionicons name="add-circle-outline" size={16} color={C.primary} />
            <Text style={styles.addLevelText}>평가 방법 추가</Text>
          </Pressable>
        </ContentArea>
      </View>

      {data.blocks.map((block, bi) => (
        <React.Fragment key={bi}>
          {bi > 0 && <View style={styles.rowBorder} />}
          <RubricBlock
            block={block}
            blockIndex={bi}
            onChangeBlock={setBlock}
            onRemoveBlock={removeBlock}
            canRemoveBlock={data.blocks.length > 1}
          />
        </React.Fragment>
      ))}

      <Pressable
        style={({ pressed }) => [styles.addBlockRow, pressed && { opacity: 0.75 }]}
        onPress={addBlock}
      >
        <Ionicons name="add-circle-outline" size={16} color={C.primary} />
        <Text style={styles.addLevelText}>평가 요소 추가</Text>
      </Pressable>

      <View style={[styles.row, styles.rowBorder]}>
        <LabelCol header minHeight={40}>기본점수</LabelCol>
        <ContentArea minHeight={40}>
          <TextInput style={[styles.input, styles.inputFillCell]} value={data.baseScore} onChangeText={(t) => patch({ baseScore: t })} placeholder="기본점수 입력" placeholderTextColor={C.textFaint} keyboardType="numeric" />
        </ContentArea>
      </View>
      <View style={[styles.row, styles.rowBorder]}>
        <LabelCol header minHeight={40}>{'장기 미인정\n결석자'}</LabelCol>
        <ContentArea minHeight={40}>
          <TextInput style={[styles.input, styles.inputFillCell]} value={data.absentScore} onChangeText={(t) => patch({ absentScore: t })} placeholder="점수 입력" placeholderTextColor={C.textFaint} keyboardType="numeric" />
        </ContentArea>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
    width: '100%',
    overflow: 'hidden',
  },
  titleRow: { borderBottomWidth: 1, borderBottomColor: BORDER },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rowInner: { alignSelf: 'stretch' },
  rowBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  cellFlex: { flexBasis: 0, minWidth: 0 },
  labelCol: {
    flexGrow: 0,
    flexShrink: 0,
    width: '20%',
    maxWidth: '20%',
    alignSelf: 'stretch',
    borderRightWidth: 1,
    borderRightColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  labelColHeader: { backgroundColor: HDR },
  labelColBody: { backgroundColor: '#fff' },
  labelColInput: { paddingHorizontal: 0, paddingVertical: 0 },
  labelColStretch: { justifyContent: 'center' },
  contentArea: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: '#fff',
  },
  contentAreaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  contentAreaHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 0,
  },
  contentAreaHeaderText: { textAlign: 'center' },
  achievementLevelRow: { width: '100%', alignSelf: 'stretch' },
  contentCol: {
    flex: CONTENT_COL_FLEX,
    flexBasis: 0,
    minWidth: 0,
    alignSelf: 'stretch',
    borderRightWidth: 1,
    borderRightColor: BORDER,
    backgroundColor: '#fff',
  },
  contentColNoRightBorder: {
    borderRightWidth: 0,
  },
  cell: {
    borderRightWidth: 1,
    borderRightColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cellNoRightBorder: { borderRightWidth: 0 },
  cellNoPadding: { paddingHorizontal: 0, paddingVertical: 0, alignSelf: 'stretch' },
  cellHeader: { backgroundColor: HDR },
  cellCenter: { alignItems: 'center' },
  cellText: { fontFamily: F.sans, fontSize: 12, color: C.text, lineHeight: 18 },
  cellHeaderText: { fontFamily: F.sansMedium, fontSize: 12, color: C.text },

  rubricBlockWrap: { borderTopWidth: 1, borderTopColor: BORDER },
  rubricBlock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  rubricElementCol: {
    flex: LABEL_COL_FLEX,
    flexBasis: 0,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    alignSelf: 'stretch',
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  rubricContentArea: {
    flex: CONTENT_COL_FLEX,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: '#fff',
  },
  rubricElementHeader: {
    backgroundColor: HDR,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  rubricElementBody: {
    flex: 1,
    backgroundColor: '#fff',
  },
  blockToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  blockToolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  blockRemoveText: {
    fontFamily: F.sansMedium,
    fontSize: 11,
    color: '#C62828',
  },
  subBlockRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  subBlockRemoveText: {
    fontFamily: F.sans,
    fontSize: 10,
    color: C.textSecondary,
  },
  subBlockAddRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  levelRowWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rubricMetricRow: {
    width: '100%',
    alignSelf: 'stretch',
  },
  rubricMetricHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rubricMetricInnerFull: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  rubricGridCell: {
    borderRightWidth: 1,
    borderRightColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    backgroundColor: '#fff',
    alignSelf: 'stretch',
  },
  rubricGridCellHeader: {
    backgroundColor: HDR,
  },
  rubricGridCellNoRight: {
    borderRightWidth: 0,
  },
  rubricGridRemoveCell: {
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    borderRightWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  rubricGridRemoveCellHeader: {
    backgroundColor: HDR,
  },
  rubricScoreCellBody: {
    backgroundColor: '#fafafa',
  },
  rubricScoreInput: {
    backgroundColor: '#fafafa',
    minHeight: ROW_H - 4,
  },
  rubricAddLevelSubSpacer: {
    backgroundColor: '#fafafa',
  },
  rubricAddLevelMain: {
    position: 'relative',
    borderTopWidth: 0,
    borderRightWidth: 0,
    backgroundColor: '#fafafa',
  },
  rubricAddLevelSplit: {
    minHeight: 36,
    backgroundColor: '#fafafa',
  },
  rubricAddLevelOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rubricAddLevelRemoveSpacer: {
    width: RUBRIC_REMOVE_COL_W,
    minWidth: RUBRIC_REMOVE_COL_W,
    maxWidth: RUBRIC_REMOVE_COL_W,
    flexGrow: 0,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    backgroundColor: '#fafafa',
  },
  rubricRemoveCol: {
    width: RUBRIC_REMOVE_COL_W,
    minWidth: RUBRIC_REMOVE_COL_W,
    maxWidth: RUBRIC_REMOVE_COL_W,
    flexGrow: 0,
    flexShrink: 0,
  },
  rubricRemoveBtn: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  addBlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: '#fafafa',
  },
  elementCol: { flex: 2.2 },
  rightCol: { flex: 5 },
  subBlockWrap: { flexDirection: 'row', alignItems: 'stretch', width: '100%' },
  subGroupsCol: {
    flex: RUBRIC_METRIC_INNER_TOTAL,
    flexBasis: 0,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  subElementCol: {
    backgroundColor: '#fff',
  },
  rubricSubHeaderCell: {
    minHeight: 40,
    justifyContent: 'center',
  },
  levelCell: { flex: 1, justifyContent: 'center' },
  levelSplit: { borderTopWidth: 1, borderTopColor: BORDER },
  scoreCell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  scoreInput: { textAlign: 'center', fontFamily: F.sansMedium },

  input: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: F.sans,
    fontSize: 12,
    color: C.text,
    backgroundColor: '#fff',
  },
  inputFillCell: {
    minHeight: '100%',
  },
  inputMultiline: { minHeight: ROW_H - 4, paddingTop: 8 },
  levelLabelInput: {
    minHeight: ROW_H - 8,
    paddingVertical: 4,
    fontFamily: F.sansMedium,
  },
  levelRemoveBtn: {
    width: RUBRIC_REMOVE_COL_W,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    backgroundColor: '#fff',
  },
  addLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: '#fafafa',
  },
  addLevelText: {
    fontFamily: F.sansMedium,
    fontSize: 12,
    color: C.primary,
  },
  achievementStandardInput: {
    padding: 10,
  },
  inputCenter: { textAlign: 'center' },
  textCenter: { textAlign: 'center' },
  elementInput: { flex: 1, minHeight: 80, padding: 8 },

  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 4,
  },
  methodItemWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '24%',
    minWidth: 130,
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 4,
  },
  methodCheckTap: {
    paddingVertical: 2,
  },
  methodLabelTap: {
    flex: 1,
    justifyContent: 'center',
  },
  methodCustomLabel: {
    flex: 1,
    minWidth: 72,
  },
  methodRemoveBtn: {
    padding: 2,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    width: '24%',
    minWidth: 110,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  checkBox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
  },
  checkBoxOn: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checkLabel: { fontFamily: F.sans, fontSize: 11, color: C.text },
});
