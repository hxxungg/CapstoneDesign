import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME, FONTS } from '../config/api';

const C = THEME;
const F = FONTS;

const HDR = '#D9EAD3';
const BORDER = '#9AA89A';
const ROW_H = 44;

export const EVAL_METHOD_ROWS = [
  ['논술', '구술·발표', '토의·토론', '프로젝트'],
  ['실험·실습', '포트폴리오', '기타', '교사 관찰 및 기록'],
  ['자기평가', '동료평가', '', ''],
];

export const ACHIEVE_LEVELS = ['A', 'B', 'C', 'D', 'E'];

/** 채점기준표 양식 — scoreGroups[].levels 길이 = 배점 셀 rowspan */
export const DEFAULT_BLOCK_TEMPLATES = [
  {
    element: '',
    scoreGroups: [
      { score: '', levels: [''] },
      { score: '', levels: ['', ''] },
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
      { score: '', levels: ['', ''] },
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

/** 예전 rows[] 형식 → scoreGroups(각 1행) 변환 */
function migrateLegacyBlock(block, template) {
  if (block.scoreGroups || block.subBlocks) {
    return mergeBlockWithTemplate(block, template);
  }
  if (Array.isArray(block.rows)) {
    return mergeBlockWithTemplate(
      {
        element: block.element ?? '',
        scoreGroups: block.rows.map((r) => ({
          score: r.score ?? '',
          levels: [r.level ?? ''],
        })),
      },
      template
    );
  }
  return cloneTemplateBlock(template);
}

function mergeBlockWithTemplate(block, template) {
  const base = cloneTemplateBlock(template);
  base.element = block.element ?? base.element;

  if (base.subBlocks && block.subBlocks) {
    base.subBlocks = base.subBlocks.map((subTpl, si) => {
      const subIn = block.subBlocks[si] || {};
      return {
        subElement: subIn.subElement ?? subTpl.subElement,
        scoreGroups: subTpl.scoreGroups.map((gTpl, gi) => {
          const gIn = subIn.scoreGroups?.[gi] || {};
          return {
            score: gIn.score ?? gTpl.score,
            levels: gTpl.levels.map((_, li) => gIn.levels?.[li] ?? gTpl.levels[li] ?? ''),
          };
        }),
      };
    });
    return base;
  }

  if (base.scoreGroups && block.scoreGroups) {
    base.scoreGroups = base.scoreGroups.map((gTpl, gi) => {
      const gIn = block.scoreGroups[gi] || {};
      return {
        score: gIn.score ?? gTpl.score,
        levels: gTpl.levels.map((_, li) => gIn.levels?.[li] ?? gTpl.levels[li] ?? ''),
      };
    });
  }

  return base;
}

export function createDefaultRubricState(initial) {
  const evalKeys = EVAL_METHOD_ROWS.flat().filter(Boolean);
  const base = {
    areaName: '',
    areaMaxScore: '',
    semester: '',
    taskDescription: '',
    achievementStandard: '',
    achievementLevels: Object.fromEntries(ACHIEVE_LEVELS.map((lv) => [lv, ''])),
    evalMethods: Object.fromEntries(evalKeys.map((k) => [k, false])),
    blocks: DEFAULT_BLOCK_TEMPLATES.map((tpl) => cloneTemplateBlock(tpl)),
    baseScore: '',
    absentScore: '',
  };
  if (!initial) return base;
  return {
    ...base,
    ...initial,
    achievementLevels: { ...base.achievementLevels, ...(initial.achievementLevels || {}) },
    evalMethods: { ...base.evalMethods, ...(initial.evalMethods || {}) },
    blocks: (initial.blocks || base.blocks).map((block, i) =>
      migrateLegacyBlock(block, DEFAULT_BLOCK_TEMPLATES[i] || DEFAULT_BLOCK_TEMPLATES[0])
    ),
  };
}

function Cell({ children, style, header, flex, minHeight = 36, center, noPadding, noRightBorder }) {
  return (
    <View
      style={[
        styles.cell,
        header && styles.cellHeader,
        flex != null && { flex },
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

function ScoreGroupRows({ groups, onChangeGroup, levelFlex, scoreFlex }) {
  const levelStyle = levelFlex != null ? { flex: levelFlex } : undefined;
  const scoreStyle = scoreFlex != null ? { flex: scoreFlex } : undefined;
  return groups.map((group, gi) => (
    <View key={gi} style={[styles.scoreGroupRow, gi > 0 && styles.rowBorder]}>
      <View style={[styles.levelCol, levelStyle]}>
        {group.levels.map((level, li) => (
          <View key={li} style={li > 0 ? styles.levelSplit : undefined}>
            <LevelInput
              value={level}
              onChangeText={(t) => {
                const levels = [...group.levels];
                levels[li] = t;
                onChangeGroup(gi, { ...group, levels });
              }}
            />
          </View>
        ))}
      </View>
      <ScoreInput
        value={group.score}
        minHeight={ROW_H * group.levels.length}
        style={scoreStyle}
        onChangeText={(t) => onChangeGroup(gi, { ...group, score: t })}
      />
    </View>
  ));
}

function RubricBlock({ block, blockIndex, onChangeBlock }) {
  const totalRows = countBlockRows(block);

  const setElement = (text) => onChangeBlock(blockIndex, { ...block, element: text });

  const patchScoreGroups = (scoreGroups) =>
    onChangeBlock(blockIndex, { ...block, scoreGroups });

  const patchSubBlocks = (subBlocks) =>
    onChangeBlock(blockIndex, { ...block, subBlocks });

  if (block.subBlocks) {
    return (
      <View style={styles.rubricBlock}>
        <View style={[styles.elementCol, { borderRightWidth: 1, borderRightColor: BORDER }]}>
          <Cell header minHeight={40}>평가 요소</Cell>
          <View style={{ flex: 1, minHeight: totalRows * ROW_H, borderTopWidth: 1, borderTopColor: BORDER }}>
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
        <View style={styles.rightCol}>
          <View style={styles.row}>
            <Cell header flex={1.1} minHeight={40}>세부 요소</Cell>
            <Cell header flex={3.2} minHeight={40}>수행 수준</Cell>
            <Cell header flex={0.9} minHeight={40} center noRightBorder>배점</Cell>
          </View>
          {block.subBlocks.map((sub, si) => {
            const subRows = sub.scoreGroups.reduce((s, g) => s + g.levels.length, 0);
            return (
              <View key={si} style={[styles.subBlockWrap, si > 0 && styles.rowBorder]}>
                <View style={[styles.subElementCol, { minHeight: subRows * ROW_H }]}>
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
                </View>
                <View style={styles.subGroupsCol}>
                  <ScoreGroupRows
                    groups={sub.scoreGroups}
                    levelFlex={3.2}
                    scoreFlex={0.9}
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
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rubricBlock}>
      <View style={[styles.elementCol, { borderRightWidth: 1, borderRightColor: BORDER }]}>
        <Cell header minHeight={40}>평가 요소</Cell>
        <View style={{ flex: 1, minHeight: totalRows * ROW_H, borderTopWidth: 1, borderTopColor: BORDER }}>
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
      <View style={styles.rightCol}>
        <View style={styles.row}>
          <Cell header flex={4} minHeight={40}>수행 수준</Cell>
          <Cell header flex={1} minHeight={40} center noRightBorder>배점</Cell>
        </View>
        <ScoreGroupRows
          groups={block.scoreGroups}
          onChangeGroup={(gi, group) => {
            const scoreGroups = block.scoreGroups.map((g, idx) => (idx === gi ? group : g));
            patchScoreGroups(scoreGroups);
          }}
        />
      </View>
    </View>
  );
}

export default function GradingRubricTable({ value, onChange }) {
  const data = value ?? createDefaultRubricState();

  const patch = (partial) => onChange?.({ ...data, ...partial });

  const setAchievement = (level, text) => {
    patch({ achievementLevels: { ...data.achievementLevels, [level]: text } });
  };

  const toggleMethod = (key) => {
    patch({ evalMethods: { ...data.evalMethods, [key]: !data.evalMethods[key] } });
  };

  const setBlock = (blockIndex, block) => {
    const blocks = data.blocks.map((b, i) => (i === blockIndex ? block : b));
    patch({ blocks });
  };

  return (
    <View style={styles.table}>
      <Cell header center minHeight={44} style={styles.titleRow}>
        채점기준표
      </Cell>

      <View style={styles.row}>
        <Cell header flex={1.2} minHeight={40}>평가 영역명</Cell>
        <Cell flex={1.6} minHeight={40} noPadding>
          <TextInput style={styles.input} value={data.areaName} onChangeText={(t) => patch({ areaName: t })} placeholder="영역명" placeholderTextColor={C.textFaint} />
        </Cell>
        <Cell header flex={1} minHeight={40}>영역만점</Cell>
        <Cell flex={0.8} minHeight={40} noPadding>
          <TextInput style={[styles.input, styles.inputCenter]} value={data.areaMaxScore} onChangeText={(t) => patch({ areaMaxScore: t })} placeholder="점" placeholderTextColor={C.textFaint} keyboardType="numeric" />
        </Cell>
        <Cell header flex={0.7} minHeight={40}>학기</Cell>
        <Cell flex={0.7} minHeight={40} noPadding noRightBorder>
          <TextInput style={[styles.input, styles.inputCenter]} value={data.semester} onChangeText={(t) => patch({ semester: t })} placeholder="1학기" placeholderTextColor={C.textFaint} />
        </Cell>
      </View>

      <View style={styles.row}>
        <Cell header flex={1.2} minHeight={56}>수행과제</Cell>
        <Cell flex={4.8} minHeight={56} noPadding noRightBorder>
          <TextInput style={[styles.input, styles.inputMultiline]} value={data.taskDescription} onChangeText={(t) => patch({ taskDescription: t })} placeholder="수행과제 내용 입력" placeholderTextColor={C.textFaint} multiline textAlignVertical="top" />
        </Cell>
      </View>

      <View>
        <View style={[styles.row, styles.rowBorder]}>
          <Cell header flex={2} minHeight={40}>성취기준</Cell>
          <Cell header flex={3} minHeight={40} noRightBorder>성취기준별 성취수준</Cell>
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <Cell flex={2} minHeight={ACHIEVE_LEVELS.length * ROW_H} noPadding>
            <TextInput
              style={[styles.input, styles.inputMultiline, styles.achievementStandardInput]}
              value={data.achievementStandard ?? ''}
              onChangeText={(t) => patch({ achievementStandard: t })}
              placeholder="예) [9기가02-09] 성취기준 내용 입력"
              placeholderTextColor={C.textFaint}
              multiline
              textAlignVertical="top"
            />
          </Cell>
          <View style={{ flex: 3 }}>
            {ACHIEVE_LEVELS.map((lv, i) => (
              <View key={lv} style={[styles.row, i > 0 && styles.rowBorder]}>
                <Cell flex={0.35} center minHeight={ROW_H}>{lv}</Cell>
                <Cell flex={1} minHeight={ROW_H} noPadding noRightBorder>
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
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.row}>
        <Cell header flex={0.8} minHeight={100} center>{'평가\n방법'}</Cell>
        <View style={{ flex: 4.2 }}>
          {EVAL_METHOD_ROWS.map((row, ri) => (
            <View key={ri} style={[styles.methodRow, ri > 0 && styles.rowBorder]}>
              {row.map((label, ci) => (
                <CheckItem key={ci} label={label} checked={!!data.evalMethods[label]} onToggle={() => label && toggleMethod(label)} />
              ))}
            </View>
          ))}
        </View>
      </View>

      {data.blocks.map((block, bi) => (
        <React.Fragment key={bi}>
          {bi > 0 && <View style={styles.rowBorder} />}
          <RubricBlock block={block} blockIndex={bi} onChangeBlock={setBlock} />
        </React.Fragment>
      ))}

      <View style={styles.row}>
        <Cell header flex={1.2} minHeight={40}>기본점수</Cell>
        <Cell flex={4.8} minHeight={40} noPadding noRightBorder>
          <TextInput style={styles.input} value={data.baseScore} onChangeText={(t) => patch({ baseScore: t })} placeholder="기본점수 입력" placeholderTextColor={C.textFaint} keyboardType="numeric" />
        </Cell>
      </View>
      <View style={[styles.row, styles.rowBorder]}>
        <Cell header flex={1.2} minHeight={40}>{'장기 미인정\n결석자'}</Cell>
        <Cell flex={4.8} minHeight={40} noPadding noRightBorder>
          <TextInput style={styles.input} value={data.absentScore} onChangeText={(t) => patch({ absentScore: t })} placeholder="점수 입력" placeholderTextColor={C.textFaint} keyboardType="numeric" />
        </Cell>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
  },
  titleRow: { borderBottomWidth: 1, borderBottomColor: BORDER },
  row: { flexDirection: 'row' },
  rowBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  cell: {
    borderRightWidth: 1,
    borderRightColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  cellNoRightBorder: { borderRightWidth: 0 },
  cellNoPadding: { paddingHorizontal: 0, paddingVertical: 0 },
  cellHeader: { backgroundColor: HDR },
  cellCenter: { alignItems: 'center' },
  cellText: { fontFamily: F.sans, fontSize: 12, color: C.text, lineHeight: 18 },
  cellHeaderText: { fontFamily: F.sansMedium, fontSize: 12, color: C.text },

  rubricBlock: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER },
  elementCol: { flex: 2.2 },
  rightCol: { flex: 5 },
  scoreGroupRow: { flexDirection: 'row', alignItems: 'stretch' },
  subBlockWrap: { flexDirection: 'row', alignItems: 'stretch' },
  subGroupsCol: { flex: 4.1 },
  subElementCol: {
    flex: 1.1,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    backgroundColor: '#fff',
  },
  levelCol: {
    flex: 4,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  levelCell: { justifyContent: 'center' },
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
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: F.sans,
    fontSize: 12,
    color: C.text,
    backgroundColor: '#fff',
  },
  inputMultiline: { minHeight: ROW_H - 4, paddingTop: 8 },
  achievementStandardInput: {
    minHeight: ACHIEVE_LEVELS.length * ROW_H - 4,
    padding: 10,
  },
  inputCenter: { textAlign: 'center' },
  elementInput: { minHeight: 120, padding: 8 },

  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 4,
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
