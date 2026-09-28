import type { CaseSlot, TypeCase } from '../types/case';
import type { TypeMatrix } from '../types/matrix';
import type { ProofCaseSnapshot, ProofSnapshotSlot } from '../types/proof';

/** 整盘试印前的盘面预检结果 */

/** 需要先处理的格位：停用 / 待补刻字模、或字模档案缺失 */
export interface SnapshotBlocker {
  row: number;
  col: number;
  character: string;
  matrixId: string;
  matrixCode: string;
  /** 停用 / 待补刻 / 字模档案缺失 */
  reason: string;
}

export interface CaseProofInspection {
  blockers: SnapshotBlocker[];
  /** 已落位字模数（含被拦下的格位） */
  filled: number;
  /** 是否可以生成样张（无停用 / 待补刻 / 缺档格位且至少落位 1 枚） */
  ready: boolean;
  /** ready 为 false 时的汇总提示 */
  message: string;
}

const ROW_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 行号（0 基）转盘面行标，例：0 → A */
export function caseRowLabel(row: number): string {
  return ROW_LABELS[row] ?? String(row + 1);
}

/** 格位的盘面坐标，例：(0, 1) → A2 */
export function slotCoord(row: number, col: number): string {
  return `${caseRowLabel(row)}${col + 1}`;
}

/**
 * 整盘试印预检：
 * - 落位字模为「停用」「待补刻」或档案缺失时，逐格列出，要求先处理格位；
 * - 字盘没有任何落位时也不允许出样张。
 */
export function inspectCaseForProof(typeCase: TypeCase, matrices: TypeMatrix[]): CaseProofInspection {
  const byId = new Map(matrices.map((m) => [m.id, m]));
  const blockers: SnapshotBlocker[] = [];
  for (const slot of typeCase.slots) {
    const matrix = byId.get(slot.matrixId);
    if (!matrix) {
      blockers.push({
        row: slot.row,
        col: slot.col,
        character: slot.character,
        matrixId: slot.matrixId,
        matrixCode: '',
        reason: '字模档案缺失',
      });
      continue;
    }
    if (matrix.availability !== '可用') {
      blockers.push({
        row: slot.row,
        col: slot.col,
        character: slot.character,
        matrixId: slot.matrixId,
        matrixCode: matrix.code,
        reason: matrix.availability,
      });
    }
  }
  const filled = typeCase.slots.length;
  let message = '';
  if (blockers.length > 0) {
    message =
      `盘面有 ${blockers.length} 个格位的字模为停用 / 待补刻或缺档，` +
      '请先取出、补刻或更换后再试印。';
  } else if (filled === 0) {
    message = '字盘还没有任何落位，无法生成样张。';
  }
  return { blockers, filled, ready: blockers.length === 0 && filled > 0, message };
}

/** 把字模 id 解析成编号；找不到档案时回退为 id，保证快照仍可读 */
function codeOfMatrix(matrix: TypeMatrix | undefined, matrixId: string): string {
  return matrix?.code || matrixId || '';
}

function toSnapshotSlot(slot: CaseSlot, matricesById: Map<string, TypeMatrix>): ProofSnapshotSlot {
  return {
    row: slot.row,
    col: slot.col,
    character: slot.character,
    matrixId: slot.matrixId,
    matrixCode: codeOfMatrix(matricesById.get(slot.matrixId), slot.matrixId),
  };
}

/**
 * 由当前字盘盘面生成样张快照。
 * 调用前应先通过 inspectCaseForProof；未通过预检时返回 null，不生成样张。
 */
export function buildCaseSnapshot(typeCase: TypeCase, matrices: TypeMatrix[]): ProofCaseSnapshot | null {
  const inspection = inspectCaseForProof(typeCase, matrices);
  if (!inspection.ready) return null;
  const byId = new Map(matrices.map((m) => [m.id, m]));
  const slots = [...typeCase.slots]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((s) => toSnapshotSlot(s, byId));
  return {
    caseId: typeCase.id,
    caseCode: typeCase.code,
    caseKind: typeCase.kind,
    rows: typeCase.rows,
    cols: typeCase.cols,
    workStation: typeCase.workStation,
    slots,
    snapshotedAt: new Date().toISOString(),
  };
}
