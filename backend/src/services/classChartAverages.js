const { enrichAiLogsWithCriticalUseFromDb } = require('./criticalUseAnalysis');
const {
  enrichAiLogsPromptFieldsFromDb,
  aggregatePromptStats,
} = require('./promptClassificationService');

const ORIGINALITY_META = [
  { key: 'red', label: 'AI 의존', color: '#E53935' },
  { key: 'yellow', label: '주의', color: '#F9A825' },
  { key: 'green', label: '독창적', color: '#43A047' },
];

const PROMPT_TYPE_META = [
  { key: 'info', label: '정보 요구', color: '#1E88E5' },
  { key: 'summary', label: '내용 요약', color: '#8E24AA' },
  { key: 'compare', label: '비교 및 대조', color: '#00897B' },
  { key: 'predict', label: '예측 및 적용', color: '#F4511E' },
  { key: 'evaluate', label: '판단 및 평가', color: '#3949AB' },
  { key: 'generate', label: '창안', color: '#039BE5' },
];

const LEVEL_COLORS = ['#90CAF9', '#42A5F5', '#1565C0', '#0D2E6B'];

const CRITICAL_META = [
  { key: 'critical', label: '비판적 사용', color: '#7B1FA2' },
  { key: 'other', label: '기타', color: '#BDBDBD' },
];

function countsToPercents(countsByKey) {
  const total = Object.values(countsByKey).reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;
  const out = {};
  for (const [key, value] of Object.entries(countsByKey)) {
    out[key] = Math.round((value / total) * 100);
  }
  return out;
}

function averageStudentPercents(perStudentPercentsList) {
  if (!perStudentPercentsList.length) return null;
  const keys = new Set();
  perStudentPercentsList.forEach((row) => {
    Object.keys(row).forEach((key) => keys.add(key));
  });
  const avg = {};
  for (const key of keys) {
    const sum = perStudentPercentsList.reduce((acc, row) => acc + (row[key] ?? 0), 0);
    avg[key] = Math.round(sum / perStudentPercentsList.length);
  }
  return avg;
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

function buildChartFromAvg(avgPercents, metaList, studentCount, aggregateCounts = {}) {
  if (!avgPercents || studentCount <= 0) {
    return { student_count: 0, total_count: 0, items: [] };
  }
  const items = metaList
    .filter((m) => (avgPercents[m.key] ?? 0) > 0)
    .map((m) => ({
      label: m.label,
      color: m.color,
      value: avgPercents[m.key],
      count: aggregateCounts[m.key] ?? 0,
    }));
  const total_count = Object.values(aggregateCounts).reduce((sum, v) => sum + v, 0);
  return { student_count: studentCount, total_count, items };
}

function computeClassChartAverages(participations, aiByP, urlByP, simByP) {
  const origStudentPercents = [];
  const typeStudentPercents = [];
  const levelStudentPercents = [];
  const criticalStudentPercents = [];
  const levelKeysSeen = new Set();
  const origAggregate = { red: 0, yellow: 0, green: 0 };
  const typeAggregate = {};
  const levelAggregate = {};
  const criticalAggregate = { critical: 0, other: 0 };

  for (const p of participations) {
    const simRows = simByP[p.id] || [];
    const origCount = { red: 0, yellow: 0, green: 0 };
    simRows.forEach((row) => {
      if (row.originality) {
        origCount[row.originality] = (origCount[row.originality] || 0) + 1;
      }
    });
    mergeCounts(origAggregate, origCount);
    const origPct = countsToPercents(origCount);
    if (origPct) origStudentPercents.push(origPct);

    const aiLogs = enrichAiLogsPromptFieldsFromDb(aiByP[p.id] || []);
    const { promptTypes, promptLevels } = aggregatePromptStats(aiLogs);
    mergeCounts(typeAggregate, promptTypes);
    mergeCounts(levelAggregate, promptLevels);
    const typePct = countsToPercents(promptTypes);
    if (typePct) typeStudentPercents.push(typePct);

    const levelPct = countsToPercents(promptLevels);
    if (levelPct) {
      levelStudentPercents.push(levelPct);
      Object.keys(levelPct).forEach((k) => levelKeysSeen.add(k));
    }

    const { criticalUseSummary } = enrichAiLogsWithCriticalUseFromDb(
      aiLogs,
      urlByP[p.id] || []
    );
    if (criticalUseSummary.total_prompts > 0) {
      criticalAggregate.critical += criticalUseSummary.critical_count;
      criticalAggregate.other += criticalUseSummary.non_critical_count;
      criticalStudentPercents.push({
        critical: Math.round(
          (criticalUseSummary.critical_count / criticalUseSummary.total_prompts) * 100
        ),
        other: Math.round(
          (criticalUseSummary.non_critical_count / criticalUseSummary.total_prompts) * 100
        ),
      });
    }
  }

  const levelMeta = [...levelKeysSeen]
    .sort((a, b) => Number(a) - Number(b))
    .map((key, i) => ({
      key,
      label: `Lv.${key}`,
      color: LEVEL_COLORS[i % LEVEL_COLORS.length],
    }));

  return {
    originality: buildChartFromAvg(
      averageStudentPercents(origStudentPercents),
      ORIGINALITY_META,
      origStudentPercents.length,
      origAggregate
    ),
    prompt_type: buildChartFromAvg(
      averageStudentPercents(typeStudentPercents),
      PROMPT_TYPE_META,
      typeStudentPercents.length,
      typeAggregate
    ),
    prompt_level: buildChartFromAvg(
      averageStudentPercents(levelStudentPercents),
      levelMeta,
      levelStudentPercents.length,
      levelAggregate
    ),
    critical_use: buildChartFromAvg(
      averageStudentPercents(criticalStudentPercents),
      CRITICAL_META,
      criticalStudentPercents.length,
      criticalAggregate
    ),
  };
}

module.exports = { computeClassChartAverages };
