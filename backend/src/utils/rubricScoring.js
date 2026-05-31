/**
 * rubric_json + assessment_steps → 단계별 instruction 변환 및 이행 판정
 * - 모든 수행 단계마다 채점 (단계 수 ≠ 루브릭 블록 수여도 실행)
 * - instruction = (매핑된 rubric block) + 단계 제목/설명 + (필요 시) rubric 공통 맥락
 * - 이행: score_classification >= 3
 */

function parseRubric(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseScore(value) {
  if (value == null || value === '') return NaN;
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** block → { level, score }[] (scoreGroups / subBlocks / legacy rows) */
function flattenBlockRows(block) {
  if (!block) return [];
  if (Array.isArray(block.rows)) {
    return block.rows.map((r) => ({ level: r?.level ?? '', score: r?.score ?? '' }));
  }
  if (Array.isArray(block.subBlocks)) {
    return block.subBlocks.flatMap((sub) =>
      (sub.scoreGroups || []).flatMap((g) =>
        (g.levels || []).map((level) => ({ level: level ?? '', score: g.score ?? '' }))
      )
    );
  }
  if (Array.isArray(block.scoreGroups)) {
    return block.scoreGroups.flatMap((g) =>
      (g.levels || []).map((level) => ({ level: level ?? '', score: g.score ?? '' }))
    );
  }
  return [];
}

/** 배점(score)이 가장 높은 행의 level 텍스트 */
function pickTopLevelRow(blockOrRows) {
  const rows = Array.isArray(blockOrRows) ? blockOrRows : flattenBlockRows(blockOrRows);
  if (!Array.isArray(rows) || rows.length === 0) return '';

  let best = null;
  let bestScore = -Infinity;

  for (const row of rows) {
    const score = parseScore(row?.score);
    const level = (row?.level || '').trim();
    if (!level) continue;
    if (Number.isFinite(score) && score > bestScore) {
      bestScore = score;
      best = level;
    } else if (!best && level) {
      best = level;
    }
  }

  if (best) return best;

  const fallback = rows.map((r) => (r?.level || '').trim()).filter(Boolean);
  return fallback[fallback.length - 1] || '';
}

function buildInstructionFromBlock(block) {
  if (!block) return null;
  const element = (block.element || '').trim();
  const topLevel = pickTopLevelRow(block);
  if (!element && !topLevel) return null;
  if (!element) return topLevel;
  if (!topLevel) return element;
  return `${element}\n\n${topLevel}`;
}

/** 단계 순서 → rubric block 인덱스 (개수가 다를 때 균등 분배) */
function mapStepToBlockIndex(stepOrder, stepCount, blockCount) {
  if (!Number.isFinite(stepOrder) || stepCount <= 0 || blockCount <= 0) return -1;
  if (blockCount === stepCount) return stepOrder - 1;
  return Math.min(
    Math.floor(((stepOrder - 1) * blockCount) / stepCount),
    blockCount - 1
  );
}

function buildRubricContextLines(rubric) {
  if (!rubric) return [];
  const lines = [];
  const standard = (rubric.achievementStandard || '').trim();
  const task = (rubric.taskDescription || '').trim();
  if (standard) lines.push(standard);
  if (task) lines.push(task);
  return lines;
}

/**
 * @param {{ step_order?: number, title?: string, description?: string }} step
 * @param {object|null} rubric
 * @param {number} stepOrder
 * @param {number} stepCount
 */
function buildInstructionForStep(step, rubric, stepOrder, stepCount) {
  const parts = [];
  const blockCount = Array.isArray(rubric?.blocks) ? rubric.blocks.length : 0;
  const blockIndex = mapStepToBlockIndex(stepOrder, stepCount, blockCount);

  if (blockIndex >= 0 && rubric?.blocks?.[blockIndex]) {
    const blockInstruction = buildInstructionFromBlock(rubric.blocks[blockIndex]);
    if (blockInstruction) parts.push(blockInstruction);
  }

  const stepTitle = (step?.title || '').trim();
  const stepDesc = (step?.description || '').trim();
  if (stepTitle || stepDesc) {
    parts.push([stepTitle, stepDesc].filter(Boolean).join('\n\n'));
  }

  if (parts.length === 0) {
    parts.push(...buildRubricContextLines(rubric));
  } else if (blockIndex < 0) {
    const context = buildRubricContextLines(rubric);
    if (context.length) parts.unshift(context.join('\n\n'));
  }

  if (parts.length === 0) {
    const fallbackTitle = stepTitle || `${stepOrder}단계`;
    parts.push(`${fallbackTitle}의 수행 기준을 충족했는지 평가합니다.`);
  }

  return parts.join('\n\n');
}

/**
 * @param {Array<{ id?: number, step_order: number, title?: string, description?: string }>} steps
 * @param {object|string|null} rubricRaw
 * @returns {Array<{ stepOrder: number, stepId?: number, blockIndex: number, instruction: string }>|null}
 */
function buildStepScoringPlan(steps, rubricRaw) {
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const rubric = parseRubric(rubricRaw);
  const stepCount = steps.length;
  const out = [];

  for (const step of steps) {
    const stepOrder = Number(step?.step_order);
    if (!Number.isFinite(stepOrder) || stepOrder <= 0) continue;

    const blockCount = Array.isArray(rubric?.blocks) ? rubric.blocks.length : 0;
    const blockIndex = mapStepToBlockIndex(stepOrder, stepCount, blockCount);
    const instruction = buildInstructionForStep(step, rubric, stepOrder, stepCount);
    if (!instruction) continue;

    out.push({
      stepOrder,
      stepId: step.id,
      blockIndex,
      instruction,
    });
  }

  return out.length > 0 ? out : null;
}

/** @deprecated buildStepScoringPlan 사용 */
function buildStepInstructions(rubricRaw, stepCount) {
  const rubric = parseRubric(rubricRaw);
  if (!rubric || !Array.isArray(rubric.blocks)) return null;

  const steps = Array.from({ length: stepCount }, (_, i) => ({
    step_order: i + 1,
    title: '',
    description: '',
  }));
  return buildStepScoringPlan(steps, rubric);
}

function isCriteriaMet(scoreClassification) {
  const n = Number(scoreClassification);
  return Number.isFinite(n) && n >= 3;
}

function complianceStatus(scoreClassification) {
  return isCriteriaMet(scoreClassification) ? '이행' : '미이행';
}

module.exports = {
  parseRubric,
  buildInstructionFromBlock,
  buildInstructionForStep,
  buildStepScoringPlan,
  buildStepInstructions,
  mapStepToBlockIndex,
  isCriteriaMet,
  complianceStatus,
};
