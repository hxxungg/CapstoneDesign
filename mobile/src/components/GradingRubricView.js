import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME, FONTS } from '../config/api';
import { createDefaultRubricState } from './GradingRubricTable';

const C = THEME;
const F = FONTS;
const HDR = '#D9EAD3';
const BORDER = '#9AA89A';
const ROW_H = 44;

function Cell({ children, header, flex, minHeight = 36, center, noRightBorder }) {
  return (
    <View
      style={[
        styles.cell,
        header && styles.cellHeader,
        flex != null && { flex },
        { minHeight },
        center && styles.cellCenter,
        noRightBorder && styles.cellNoRightBorder,
      ]}
    >
      {typeof children === 'string' || typeof children === 'number'
        ? <Text style={[styles.cellText, header && styles.cellHeaderText]}>{children}</Text>
        : children}
    </View>
  );
}

function ScoreGroupReadOnly({ groups, levelFlex, scoreFlex }) {
  return groups.map((group, gi) => (
    <View key={gi} style={[styles.scoreGroupRow, gi > 0 && styles.rowBorder]}>
      <View style={[styles.levelCol, levelFlex != null && { flex: levelFlex }]}>
        <View style={styles.levelCell}>
          <Text style={styles.bodyText}>{group.levels[0] || '—'}</Text>
        </View>
      </View>
      <View style={[styles.scoreCell, scoreFlex != null && { flex: scoreFlex }, { minHeight: ROW_H }]}>
        <Text style={styles.scoreText}>{group.score || '—'}</Text>
      </View>
    </View>
  ));
}

function BlockReadOnly({ block }) {
  const totalRows = block.subBlocks
    ? block.subBlocks.reduce((sum, sub) => sum + sub.scoreGroups.reduce((s, g) => s + g.levels.length, 0), 0)
    : (block.scoreGroups || []).reduce((sum, g) => sum + g.levels.length, 0);

  if (block.subBlocks) {
    return (
      <View style={styles.rubricBlockVertical}>
        <View style={styles.row}>
          <Cell header flex={2.2} minHeight={40}>평가 요소</Cell>
          <Cell header flex={1.1} minHeight={40}>세부 요소</Cell>
          <Cell header flex={3.2} minHeight={40}>수행 수준</Cell>
          <Cell header flex={0.9} minHeight={40} center noRightBorder>배점</Cell>
        </View>
        <View style={styles.rubricBlockBody}>
          <View style={[styles.elementCol, styles.elementBodyCol, { minHeight: totalRows * ROW_H }]}>
            <Text style={styles.bodyText}>{block.element || '—'}</Text>
          </View>
          <View style={styles.rightCol}>
            {block.subBlocks.map((sub, si) => {
              const subRows = sub.scoreGroups.reduce((s, g) => s + g.levels.length, 0);
              return (
                <View key={si} style={[styles.subBlockWrap, si > 0 && styles.rowBorder]}>
                  <View style={[styles.subElementCol, { minHeight: subRows * ROW_H, padding: 8 }]}>
                    <Text style={styles.bodyText}>{sub.subElement || '—'}</Text>
                  </View>
                  <View style={styles.subGroupsCol}>
                    <ScoreGroupReadOnly groups={sub.scoreGroups} levelFlex={3.2} scoreFlex={0.9} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rubricBlockVertical}>
      <View style={styles.row}>
        <Cell header flex={2.2} minHeight={40}>평가 요소</Cell>
        <Cell header flex={4} minHeight={40}>수행 수준</Cell>
        <Cell header flex={1} minHeight={40} center noRightBorder>배점</Cell>
      </View>
      <View style={styles.rubricBlockBody}>
        <View style={[styles.elementCol, styles.elementBodyCol, { minHeight: totalRows * ROW_H }]}>
          <Text style={styles.bodyText}>{block.element || '—'}</Text>
        </View>
        <View style={styles.rightCol}>
          <ScoreGroupReadOnly groups={block.scoreGroups || []} />
        </View>
      </View>
    </View>
  );
}

/** 교사 평가 화면 — 평가 요소(블록)부터 읽기 전용 표시 */
export default function GradingRubricView({ rubric }) {
  const data = createDefaultRubricState(rubric);
  const blocks = data.blocks ?? [];

  if (blocks.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>등록된 평가 설계가 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.table}>
      {blocks.map((block, bi) => (
        <React.Fragment key={bi}>
          {bi > 0 && <View style={styles.rowBorder} />}
          <BlockReadOnly block={block} />
        </React.Fragment>
      ))}

      {(data.baseScore || data.absentScore) ? (
        <>
          <View style={styles.row}>
            <Cell header flex={1.2} minHeight={40}>기본점수</Cell>
            <Cell flex={4.8} minHeight={40} noRightBorder>
              <Text style={styles.bodyText}>{data.baseScore || '—'}</Text>
            </Cell>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <Cell header flex={1.2} minHeight={40}>{'장기 미인정\n결석자'}</Cell>
            <Cell flex={4.8} minHeight={40} noRightBorder>
              <Text style={styles.bodyText}>{data.absentScore || '—'}</Text>
            </Cell>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
  },
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
  cellHeader: { backgroundColor: HDR },
  cellCenter: { alignItems: 'center' },
  cellText: { fontFamily: F.sans, fontSize: 12, color: C.text, lineHeight: 18 },
  cellHeaderText: { fontFamily: F.sansMedium, fontSize: 12, color: C.text },
  bodyText: { fontFamily: F.sans, fontSize: 12, color: C.text, lineHeight: 20 },
  scoreText: { fontFamily: F.sansMedium, fontSize: 12, color: C.text, textAlign: 'center' },
  rubricBlockVertical: { borderTopWidth: 1, borderTopColor: BORDER },
  rubricBlockBody: { flexDirection: 'row', alignItems: 'stretch' },
  elementCol: { flex: 2.2, borderRightWidth: 1, borderRightColor: BORDER },
  elementBodyCol: { padding: 8, justifyContent: 'flex-start' },
  rightCol: { flex: 5 },
  scoreGroupRow: { flexDirection: 'row', alignItems: 'stretch' },
  subBlockWrap: { flexDirection: 'row', alignItems: 'stretch' },
  subGroupsCol: { flex: 4.1 },
  subElementCol: {
    flex: 1.1,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  levelCol: { flex: 4, borderRightWidth: 1, borderRightColor: BORDER },
  levelCell: { minHeight: ROW_H, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  levelSplit: { borderTopWidth: 1, borderTopColor: BORDER },
  scoreCell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  emptyBox: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { fontFamily: F.sans, fontSize: 13, color: C.textSecondary },
});
