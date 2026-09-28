/** 整盘试印：样张快照生成与停用 / 待补刻格位检查 */

import type { TypeCase } from '../types/case';
import type { TypeMatrix } from '../types/matrix';
import type { ProofCaseSnapshot, ProofSnapshotSlot } from '../types/proof';

/** 盘内需要先处理（停用 / 待补刻）的格位 */
export interface BlockedSlot {
  row: number;
  col: number;
  character: string;
  matrixId: string;
  matrixCode: string;
  availability: TypeMatrix['availability'];
}

/** 行号字母标签，例：0 → A */
export function rowLabel(row: number): string {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[row] ?? String(row + 1);
}

/** 格位文字位置，例：A1、C4 */
export function cellLabel(row: number, col: number): string {
  return `${rowLabel(row)}${col + 1}`;
}

/**
 * 找出盘中落了「停用 / 待补刻」字模的格位。
 * 这些格位必须先到缺损登记处理（补刻恢复或取出），否则不允许生成样张。
 */
export function findBlockedSlots(typeCase: TypeCase, matrices: TypeMatrix[]): BlockedSlot[] {
  const matrixMap = new Map(matrices.map((m) => [m.id, m]));
  return typeCase.slots
    .filter((s) => {
      const m = matrixMap.get(s.matrixId);
      return m && m.availability !== '可用';
    })
    .map((s) => {
      const m = matrixMap.get(s.matrixId)!;
      return {
        row: s.row,
        col: s.col,
        character: s.character,
        matrixId: s.matrixId,
        matrixCode: m.code,
        availability: m.availability,
      };
    })
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * 按字盘当前盘面生成不可变样张快照：
 * 固化行列、工位与每个落位的字符、字模 id 及字模编号。
 * 快照随试印记录一同落库，之后字盘调整不再影响旧样张。
 */
export function buildCaseSnapshot(typeCase: TypeCase, matrices: TypeMatrix[]): ProofCaseSnapshot {
  const matrixMap = new Map(matrices.map((m) => [m.id, m]));
  const slots: ProofSnapshotSlot[] = typeCase.slots
    .map((s) => ({
      row: s.row,
      col: s.col,
      character: s.character,
      matrixId: s.matrixId,
      matrixCode: matrixMap.get(s.matrixId)?.code ?? '',
    }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  return {
    caseId: typeCase.id,
    caseCode: typeCase.code,
    rows: typeCase.rows,
    cols: typeCase.cols,
    workStation: typeCase.workStation,
    slots,
    snapshottedAt: new Date().toISOString(),
  };
}
