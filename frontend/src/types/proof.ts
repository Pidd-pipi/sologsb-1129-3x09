/** 试印记录（ProofRecord）：单字或整盘试印的压力、用墨与样张评价 */

/** 试印对象类型：单字试印 / 整盘试印 */
export const PROOF_TARGET_KINDS = ['字符', '字盘'] as const;
export type ProofTargetKind = (typeof PROOF_TARGET_KINDS)[number];

/** 清晰度评价 */
export const CLARITY_LEVELS = ['清晰', '偏淡', '糊版'] as const;
export type ClarityLevel = (typeof CLARITY_LEVELS)[number];

/** 压力 / 印次合法区间 */
export const PRESSURE_RANGE = { min: 0.5, max: 60 } as const;
export const IMPRESSION_RANGE = { min: 1, max: 999 } as const;

/**
 * 样张快照中的单个格位。
 * 落位瞬间把字符与字模编号一起固化，之后字盘如何调整都不影响样张。
 */
export interface ProofSnapshotSlot {
  /** 行（0 基） */
  row: number;
  /** 列（0 基） */
  col: number;
  /** 登记时该格位上的字符 */
  character: string;
  /** 登记时该格位上的字模 id */
  matrixId: string;
  /** 登记时的字模编号，例：ZM-1985-007（冗余快照，字模日后删改也不影响样张） */
  matrixCode: string;
}

/** 整盘试印的样张快照：登记当时的盘面 */
export interface ProofCaseSnapshot {
  /** 字盘 id（快照来源；旧记录可能为空） */
  caseId: string;
  /** 字盘编号，例：ZP-A-01 */
  caseCode: string;
  /** 字盘类型 */
  caseKind: string;
  rows: number;
  cols: number;
  /** 试印时所在工位 */
  workStation: string;
  /** 登记时全部已落位格位（按行、列排序） */
  slots: ProofSnapshotSlot[];
  /** 快照生成时间 ISO */
  snapshotedAt: string;
}

export interface ProofRecord {
  id: string;
  /** 字符或字盘 */
  targetKind: ProofTargetKind;
  /** 字符内容或字盘编号 */
  targetRef: string;
  /** 关联字模 id（整盘试印时可为空） */
  matrixId: string;
  /** 整盘试印时选择的字盘 id（单字试印为空；v4 之前的历史整盘记录也为空） */
  caseId: string;
  /** 整盘试印时固化的盘面样张快照；只有编号的历史记录没有此字段 */
  caseSnapshot?: ProofCaseSnapshot;
  /** 压力 kg */
  pressureKg: number;
  /** 用墨 */
  ink: string;
  /** 印次 */
  impressions: number;
  /** 样张编号，用于回溯试印批次 */
  sampleNo: string;
  clarity: ClarityLevel;
  /** 试印日期 YYYY-MM-DD */
  proofDate: string;
  note: string;
  createdAt: string;
}

export interface ProofInput {
  targetKind: ProofTargetKind;
  targetRef: string;
  matrixId: string;
  /** 整盘试印时选择的字盘 id */
  caseId?: string;
  /** 整盘试印的样张快照 */
  caseSnapshot?: ProofCaseSnapshot;
  pressureKg: number;
  ink: string;
  impressions: number;
  sampleNo: string;
  clarity: ClarityLevel;
  proofDate: string;
  note?: string;
}

export function validateProofInput(input: Partial<ProofInput>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.targetKind) errors.targetKind = '请选择试印对象';
  if (input.targetKind === '字盘') {
    if (!(input.caseId || '').trim()) errors.caseId = '请从现有字盘中选择试印字盘';
  } else if (!(input.targetRef || '').trim()) {
    errors.targetRef = '请填写字符或选择关联字模';
  }
  const p = Number(input.pressureKg);
  if (!Number.isFinite(p) || p < PRESSURE_RANGE.min || p > PRESSURE_RANGE.max) {
    errors.pressureKg = `压力需在 ${PRESSURE_RANGE.min}–${PRESSURE_RANGE.max} kg 之间`;
  }
  const n = Number(input.impressions);
  if (!Number.isInteger(n) || n < IMPRESSION_RANGE.min || n > IMPRESSION_RANGE.max) {
    errors.impressions = `印次需在 ${IMPRESSION_RANGE.min}–${IMPRESSION_RANGE.max} 之间`;
  }
  if (!(input.ink || '').trim()) errors.ink = '请填写用墨';
  if (!(input.sampleNo || '').trim()) errors.sampleNo = '样张编号不能为空';
  if (!input.clarity) errors.clarity = '请选择清晰度评价';
  const d = (input.proofDate || '').trim();
  if (!d) errors.proofDate = '请填写试印日期';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.proofDate = '日期格式需为 YYYY-MM-DD';
  return errors;
}
