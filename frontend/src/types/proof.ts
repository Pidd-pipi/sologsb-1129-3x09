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

/** 样张快照中的单个格位：登记当时某格的落位字符与字模编号 */
export interface ProofSnapshotSlot {
  /** 行（0 基） */
  row: number;
  /** 列（0 基） */
  col: number;
  character: string;
  matrixId: string;
  /** 字模编号冗余存档：字模档案后来被删除，旧样张仍可逐格阅读 */
  matrixCode: string;
}

/**
 * 整盘试印的盘面样张快照（不可变）。
 * 登记时把当时的行列、工位与每格落位一并固化，
 * 之后字盘如何调整、换面，旧样张都保持登记时的盘面。
 */
export interface ProofCaseSnapshot {
  /** 字盘 id（来源追溯；字盘删除后仍保留编号与盘面内容） */
  caseId: string;
  /** 字盘编号，例：ZP-A-01 */
  caseCode: string;
  rows: number;
  cols: number;
  workStation: string;
  slots: ProofSnapshotSlot[];
  /** 快照固化时间 ISO */
  snapshottedAt: string;
}

export interface ProofRecord {
  id: string;
  /** 字符或字盘 */
  targetKind: ProofTargetKind;
  /** 字符内容或字盘编号 */
  targetRef: string;
  /** 关联字模 id（整盘试印时为空） */
  matrixId: string;
  /** 关联字盘 id（仅整盘试印；字符试印及 v4 之前的旧记录为空） */
  caseId?: string;
  /** 整盘试印固化的盘面样张快照；字符试印与仅有编号的历史记录为空 */
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
  /** 整盘试印时选择的现有字盘 id */
  caseId?: string;
  /** 整盘试印时由当前盘面生成的样张快照 */
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
  if (!(input.targetRef || '').trim()) {
    errors.targetRef = input.targetKind === '字盘' ? '请选择试印字盘' : '请填写字符或字盘编号';
  }
  if (input.targetKind === '字盘' && !(input.caseId || '').trim()) {
    errors.caseId = '请从现有字盘中选择试印字盘';
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
