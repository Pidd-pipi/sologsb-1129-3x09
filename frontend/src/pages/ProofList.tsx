import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import ProofSnapshotCard from '../components/common/ProofSnapshotCard';
import { DRAFT_KEYS, useLocalDraft } from '../hooks/useLocalDraft';
import { useCaseStore } from '../stores/caseStore';
import { useMatrixStore } from '../stores/matrixStore';
import { useUiStore } from '../stores/uiStore';
import {
  CLARITY_LEVELS,
  IMPRESSION_RANGE,
  PRESSURE_RANGE,
  PROOF_TARGET_KINDS,
  validateProofInput,
  type ClarityLevel,
  type ProofInput,
  type ProofTargetKind,
} from '../types/proof';
import { dash, formatDate, suggestSampleNo, todayStr } from '../utils/format';
import { buildCaseSnapshot, cellLabel, findBlockedSlots } from '../utils/proofSnapshot';

interface ProofFormState {
  targetKind: ProofTargetKind;
  matrixId: string;
  caseId: string;
  targetRef: string;
  pressureKg: string;
  ink: string;
  impressions: string;
  sampleNo: string;
  clarity: ClarityLevel;
  proofDate: string;
  note: string;
}

/** `/proofs` 试印记录：登记压力、用墨与清晰度，整盘试印固化盘面样张，按样张编号回溯 */
export default function ProofList() {
  const matrices = useMatrixStore((s) => s.matrices);
  const proofs = useMatrixStore((s) => s.proofs);
  const proofCount = useMatrixStore((s) => s.proofs.length);
  const addProof = useMatrixStore((s) => s.addProof);
  const cases = useCaseStore((s) => s.cases);
  const pushToast = useUiStore((s) => s.pushToast);
  const sampleQuery = useUiStore((s) => s.sampleQuery);
  const setSampleQuery = useUiStore((s) => s.setSampleQuery);

  const { draft, patch, reset, savedAt, existed } = useLocalDraft<ProofFormState>(
    DRAFT_KEYS.proofNew,
    {
      targetKind: '字符',
      matrixId: '',
      caseId: '',
      targetRef: '',
      pressureKg: '12.5',
      ink: '油烟墨 101',
      impressions: '40',
      sampleNo: suggestSampleNo(todayStr(), 1),
      clarity: '清晰',
      proofDate: todayStr(),
      note: '',
    },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** 台账 / 回溯中展开的样张快照面板 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!draft.matrixId && matrices.length > 0) patch({ matrixId: matrices[0].id });
  }, [draft.matrixId, matrices, patch]);

  const selectedMatrix = matrices.find((m) => m.id === draft.matrixId);
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === draft.caseId),
    [cases, draft.caseId],
  );

  useEffect(() => {
    if (draft.targetKind === '字符' && selectedMatrix) {
      patch({ targetRef: selectedMatrix.character });
    }
  }, [draft.targetKind, selectedMatrix, patch]);

  useEffect(() => {
    if (draft.targetKind === '字盘' && !draft.caseId && cases.length > 0) {
      patch({ caseId: cases[0].id });
    }
  }, [draft.targetKind, draft.caseId, cases, patch]);

  useEffect(() => {
    if (draft.targetKind === '字盘' && selectedCase) {
      patch({ targetRef: selectedCase.code });
    }
  }, [draft.targetKind, selectedCase, patch]);

  /** 所选字盘当前盘面的停用 / 待补刻格位（必须先处理，不生成样张） */
  const blockedSlots = useMemo(
    () => (draft.targetKind === '字盘' && selectedCase ? findBlockedSlots(selectedCase, matrices) : []),
    [draft.targetKind, selectedCase, matrices],
  );

  /** 提交前预览：按当前盘面生成的快照（未落库，提交成功后才随试印记录保存） */
  const previewSnapshot = useMemo(
    () =>
      draft.targetKind === '字盘' && selectedCase
        ? buildCaseSnapshot(selectedCase, matrices)
        : undefined,
    [draft.targetKind, selectedCase, matrices],
  );

  const traced = useMemo(() => {
    const q = sampleQuery.trim().toLowerCase();
    if (!q) return [];
    return proofs.filter(
      (p) => p.sampleNo.toLowerCase().includes(q) || p.targetRef.toLowerCase().includes(q),
    );
  }, [proofs, sampleQuery]);

  const clarityStats = useMemo(() => {
    const out: Record<string, number> = {};
    proofs.forEach((p) => {
      out[p.clarity] = (out[p.clarity] ?? 0) + 1;
    });
    return out;
  }, [proofs]);

  const toggleExpanded = (key: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (draft.targetKind === '字盘') {
      if (!selectedCase) {
        setErrors({ caseId: '请从现有字盘中选择试印字盘' });
        pushToast('请先选择试印字盘', 'warn');
        return;
      }
      if (blockedSlots.length > 0) {
        setErrors({ caseId: '盘内尚有停用 / 待补刻字模，请先处理对应格位' });
        pushToast(
          `盘内有 ${blockedSlots.length} 个停用 / 待补刻格位，处理后才能留存样张`,
          'warn',
        );
        return;
      }
    }
    const input: ProofInput = {
      targetKind: draft.targetKind,
      targetRef: draft.targetRef,
      matrixId: draft.targetKind === '字符' ? draft.matrixId : '',
      caseId: draft.targetKind === '字盘' ? draft.caseId : '',
      caseSnapshot:
        draft.targetKind === '字盘' && selectedCase
          ? buildCaseSnapshot(selectedCase, matrices)
          : undefined,
      pressureKg: Number(draft.pressureKg),
      ink: draft.ink,
      impressions: Number(draft.impressions),
      sampleNo: draft.sampleNo,
      clarity: draft.clarity,
      proofDate: draft.proofDate,
      note: draft.note,
    };
    const next = validateProofInput(input);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      pushToast('试印登记未通过校验，请按提示修正', 'warn');
      return;
    }
    await addProof(input);
    pushToast(`已登记试印样张 ${input.sampleNo}（${input.clarity}），盘面已存档`);
    patch({
      note: '',
      sampleNo: suggestSampleNo(todayStr(), proofs.length + 2),
    });
    setErrors({});
  };

  const sortedProofs = useMemo(
    () => [...proofs].sort((a, b) => (a.proofDate < b.proofDate ? 1 : -1)),
    [proofs],
  );

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mt-title" data-testid="proof-list-title">
            试印记录
          </h2>
          <p className="mt-sub">
            登记压力（0.5–60 kg）、用墨与清晰度评价；整盘试印从现有字盘选盘，并把登记时盘面存成样张快照。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="mt-chip" data-testid="proof-total">
            试印 {proofCount} 条
          </span>
          {CLARITY_LEVELS.map((c) => (
            <span key={c} className="mt-chip">
              {c} {clarityStats[c] ?? 0}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-panel">
        <div className="mt-panel-head">
          <h3 className="font-song text-sm font-semibold text-ink">登记试印结果</h3>
          <span className="mt-sub" data-testid="proof-draft-status">
            {existed ? `草稿已恢复 · ${savedAt || '—'}` : `草稿自动保存 ${savedAt || '—'}`}
          </span>
        </div>
        <form className="space-y-3 px-4 py-4" onSubmit={handleSubmit} data-testid="proof-form">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mt-label" htmlFor="proof-target-kind">
                试印对象
              </label>
              <select
                id="proof-target-kind"
                data-testid="proof-target-kind"
                className="mt-input"
                value={draft.targetKind}
                onChange={(e) => {
                  patch({ targetKind: e.target.value as ProofTargetKind });
                  setErrors({});
                }}
              >
                {PROOF_TARGET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            {draft.targetKind === '字符' ? (
              <>
                <div className="md:col-span-2">
                  <label className="mt-label" htmlFor="proof-matrix-select">
                    关联字模
                  </label>
                  <select
                    id="proof-matrix-select"
                    data-testid="proof-matrix-select"
                    className="mt-input"
                    value={draft.matrixId}
                    onChange={(e) => patch({ matrixId: e.target.value })}
                  >
                    <option value="">不关联具体字模</option>
                    {matrices.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.character} · {m.code} · {m.font}/{m.sizeName}
                      </option>
                    ))}
                  </select>
                  {errors.matrixId ? <p className="mt-error">{errors.matrixId}</p> : null}
                </div>
                <div>
                  <label className="mt-label" htmlFor="proof-target-ref">
                    字符
                  </label>
                  <input
                    id="proof-target-ref"
                    data-testid="proof-target-ref"
                    className="mt-input"
                    placeholder="例：活"
                    value={draft.targetRef}
                    onChange={(e) => patch({ targetRef: e.target.value })}
                  />
                  {errors.targetRef ? (
                    <p className="mt-error" data-testid="error-targetRef">
                      {errors.targetRef}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="md:col-span-3">
                <label className="mt-label" htmlFor="proof-case-select">
                  试印字盘（从现有字盘选择）
                </label>
                {cases.length === 0 ? (
                  <p className="mt-input flex items-center text-ink-mute" data-testid="proof-no-case">
                    暂无字盘，请先到
                    <Link className="ml-1 text-seal hover:underline" to="/cases">
                      字盘布局
                    </Link>
                    建档落位
                  </p>
                ) : (
                  <select
                    id="proof-case-select"
                    data-testid="proof-case-select"
                    className="mt-input"
                    value={draft.caseId}
                    onChange={(e) => {
                      patch({ caseId: e.target.value });
                      setErrors({});
                    }}
                  >
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.kind} · {c.workStation} · {c.slots.length} 格落位
                      </option>
                    ))}
                  </select>
                )}
                {errors.caseId ? (
                  <p className="mt-error" data-testid="error-caseId">
                    {errors.caseId}
                  </p>
                ) : null}
              </div>
            )}
            <div>
              <label className="mt-label" htmlFor="proof-pressure-input">
                压力 kg
              </label>
              <input
                id="proof-pressure-input"
                data-testid="proof-pressure-input"
                className="mt-input"
                type="number"
                min={PRESSURE_RANGE.min}
                max={PRESSURE_RANGE.max}
                step={0.5}
                value={draft.pressureKg}
                onChange={(e) => patch({ pressureKg: e.target.value })}
              />
              {errors.pressureKg ? (
                <p className="mt-error" data-testid="error-pressureKg">
                  {errors.pressureKg}
                </p>
              ) : (
                <p className="mt-hint">
                  {PRESSURE_RANGE.min}–{PRESSURE_RANGE.max} kg
                </p>
              )}
            </div>
            <div>
              <label className="mt-label" htmlFor="proof-ink-input">
                用墨
              </label>
              <input
                id="proof-ink-input"
                data-testid="proof-ink-input"
                className="mt-input"
                placeholder="例：油烟墨 101"
                value={draft.ink}
                onChange={(e) => patch({ ink: e.target.value })}
              />
              {errors.ink ? (
                <p className="mt-error" data-testid="error-ink">
                  {errors.ink}
                </p>
              ) : null}
            </div>
            <div>
              <label className="mt-label" htmlFor="proof-impressions-input">
                印次
              </label>
              <input
                id="proof-impressions-input"
                data-testid="proof-impressions-input"
                className="mt-input"
                type="number"
                min={IMPRESSION_RANGE.min}
                max={IMPRESSION_RANGE.max}
                step={1}
                value={draft.impressions}
                onChange={(e) => patch({ impressions: e.target.value })}
              />
              {errors.impressions ? (
                <p className="mt-error" data-testid="error-impressions">
                  {errors.impressions}
                </p>
              ) : null}
            </div>
            <div>
              <label className="mt-label" htmlFor="proof-clarity-select">
                清晰度评价
              </label>
              <select
                id="proof-clarity-select"
                data-testid="proof-clarity-select"
                className="mt-input"
                value={draft.clarity}
                onChange={(e) => patch({ clarity: e.target.value as ClarityLevel })}
              >
                {CLARITY_LEVELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mt-label" htmlFor="proof-sampleno-input">
                样张编号
              </label>
              <div className="flex gap-2">
                <input
                  id="proof-sampleno-input"
                  data-testid="proof-sampleno-input"
                  className="mt-input"
                  value={draft.sampleNo}
                  onChange={(e) => patch({ sampleNo: e.target.value })}
                />
                <button
                  type="button"
                  className="mt-btn whitespace-nowrap"
                  data-testid="suggest-sample-btn"
                  onClick={() => patch({ sampleNo: suggestSampleNo(draft.proofDate, proofs.length + 1) })}
                >
                  按日期生成
                </button>
              </div>
              {errors.sampleNo ? (
                <p className="mt-error" data-testid="error-sampleNo">
                  {errors.sampleNo}
                </p>
              ) : null}
            </div>
            <div>
              <label className="mt-label" htmlFor="proof-date-input">
                试印日期
              </label>
              <input
                id="proof-date-input"
                data-testid="proof-date-input"
                type="date"
                className="mt-input"
                value={draft.proofDate}
                onChange={(e) => patch({ proofDate: e.target.value })}
              />
              {errors.proofDate ? (
                <p className="mt-error" data-testid="error-proofDate">
                  {errors.proofDate}
                </p>
              ) : null}
            </div>
            <div className="md:col-span-4">
              <label className="mt-label" htmlFor="proof-note-input">
                备注
              </label>
              <input
                id="proof-note-input"
                data-testid="proof-note-input"
                className="mt-input"
                placeholder="例：压力偏低，建议加压至 12kg"
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
              />
            </div>
          </div>

          {draft.targetKind === '字盘' ? (
            <div
              className={`rounded border px-3 py-3 text-xs ${
                blockedSlots.length > 0
                  ? 'border-seal/50 bg-seal-pale'
                  : 'border-paper-line bg-paper/50'
              }`}
              data-testid="proof-case-panel"
            >
              {!selectedCase ? (
                <p className="text-ink-mute" data-testid="proof-case-empty">
                  请先选择试印字盘。
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-song text-sm font-semibold text-ink">
                      {selectedCase.code}
                    </span>
                    <span className="text-ink-soft">
                      {selectedCase.rows} 行 × {selectedCase.cols} 列 · 工位 {selectedCase.workStation} ·
                      已落位 {selectedCase.slots.length} 格
                    </span>
                    <Link className="mt-btn mt-btn-ghost" to="/cases" data-testid="goto-cases">
                      去调整字盘
                    </Link>
                    <Link className="mt-btn mt-btn-ghost" to="/defects" data-testid="goto-defects-from-proof">
                      去登记缺损 / 补刻
                    </Link>
                  </div>
                  {blockedSlots.length > 0 ? (
                    <div className="mt-2 space-y-1" data-testid="proof-blocked-warning">
                      <p className="font-semibold text-seal">
                        盘内有 {blockedSlots.length} 个停用 / 待补刻格位，请先处理（补刻恢复或取出字模）后再留存样张：
                      </p>
                      <ul className="space-y-0.5">
                        {blockedSlots.map((b) => (
                          <li key={`${b.row}-${b.col}`} data-testid={`blocked-slot-${b.row}-${b.col}`}>
                            <span className="font-song">{cellLabel(b.row, b.col)}</span> 格 ·
                            「{b.character}」· {b.matrixCode} ·
                            <span className="font-semibold">{b.availability}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-1 text-jade" data-testid="proof-case-ready">
                      格位字模均为可用，登记后将把当前行列、工位与每格字符 / 字模编号固化为样张快照；之后调整字盘不影响本该样张。
                    </p>
                  )}
                  {previewSnapshot ? (
                    <div className="mt-3" data-testid="proof-snapshot-preview-wrap">
                      <ProofSnapshotCard
                        snapshot={previewSnapshot}
                        matrices={matrices}
                        highlightAvailability
                        testIdPrefix="proof-preview"
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="mt-btn mt-btn-primary"
              data-testid="submit-proof"
              disabled={draft.targetKind === '字盘' && (!selectedCase || blockedSlots.length > 0)}
              title={
                draft.targetKind === '字盘' && blockedSlots.length > 0
                  ? '盘内尚有停用 / 待补刻格位，处理后才能登记'
                  : undefined
              }
            >
              登记试印
            </button>
            <button
              type="button"
              className="mt-btn"
              data-testid="reset-proof-draft"
              onClick={() => {
                reset();
                setErrors({});
                pushToast('已清空试印登记草稿', 'warn');
              }}
            >
              清空草稿
            </button>
            <span className="mt-hint">
              当前对象：{draft.targetKind} · {dash(draft.targetRef)}
            </span>
          </div>
        </form>
      </section>

      <section className="mt-panel" data-testid="trace-panel">
        <div className="mt-panel-head">
          <h3 className="font-song text-sm font-semibold text-ink">按样张编号回溯</h3>
          <input
            className="mt-input max-w-[240px]"
            placeholder="输入样张编号片段，例：YZ-2025"
            data-testid="sample-search-input"
            value={sampleQuery}
            onChange={(e) => setSampleQuery(e.target.value)}
          />
        </div>
        <div className="px-4 py-3">
          {sampleQuery.trim() === '' ? (
            <p className="text-xs text-ink-mute">输入样张编号或字符即可回溯试印批次与对应字模。</p>
          ) : traced.length === 0 ? (
            <EmptyState
              title="没有匹配的试印记录"
              description="请检查样张编号片段，或先登记一条试印记录。"
              testId="trace-empty"
            />
          ) : (
            <ul className="space-y-2" data-testid="sample-search-result">
              {traced.map((p) => {
                const key = `trace:${p.id}`;
                return (
                  <li key={p.id} className="rounded border border-paper-line bg-paper/40 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-song text-sm text-ink">{p.sampleNo}</span>
                      <span className="mt-chip">{p.clarity}</span>
                      <span className="text-ink-mute">{formatDate(p.proofDate)}</span>
                      <span className="text-ink-soft">
                        {p.pressureKg} kg · {p.ink} · 印次 {p.impressions}
                      </span>
                      {p.targetKind === '字符' && p.matrixId ? (
                        <Link className="mt-btn mt-btn-ghost" to={`/matrices/${p.matrixId}`} data-testid={`trace-matrix-${p.id}`}>
                          回溯字模
                        </Link>
                      ) : null}
                      {p.targetKind === '字盘' ? (
                        p.caseSnapshot ? (
                          <button
                            type="button"
                            className="mt-btn mt-btn-ghost"
                            data-testid={`trace-snapshot-${p.id}`}
                            onClick={() => toggleExpanded(key)}
                          >
                            {expanded.has(key) ? '收起盘面样张' : '查看盘面样张'}
                          </button>
                        ) : (
                          <span className="text-ink-mute" data-testid={`trace-legacy-${p.id}`}>
                            整盘试印（历史记录，仅留存字盘编号 {p.targetRef}）
                          </span>
                        )
                      ) : null}
                      {p.targetKind === '字符' && !p.matrixId ? (
                        <span className="text-ink-mute">未关联单枚字模</span>
                      ) : null}
                    </div>
                    {p.targetKind === '字盘' && p.caseSnapshot && expanded.has(key) ? (
                      <div className="mt-2" data-testid={`trace-snapshot-panel-${p.id}`}>
                        <ProofSnapshotCard snapshot={p.caseSnapshot} matrices={matrices} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-panel">
        <div className="mt-panel-head">
          <h3 className="font-song text-sm font-semibold text-ink">试印台账</h3>
          <span className="mt-sub">共 {proofs.length} 条</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full" data-testid="proof-table">
            <thead className="border-b border-paper-line bg-paper/60">
              <tr>
                <th className="mt-th">样张编号</th>
                <th className="mt-th">对象</th>
                <th className="mt-th">压力 / 用墨</th>
                <th className="mt-th">印次</th>
                <th className="mt-th">清晰度</th>
                <th className="mt-th">试印日期</th>
                <th className="mt-th">字模 / 样张</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-line">
              {sortedProofs.length === 0 ? (
                <tr>
                  <td className="mt-td text-ink-mute" colSpan={7}>
                    暂无试印记录。
                  </td>
                </tr>
              ) : (
                sortedProofs.flatMap((p) => {
                  const key = `row:${p.id}`;
                  const isOpen = expanded.has(key);
                  return [
                    <tr key={p.id} data-testid={`proof-row-${p.id}`}>
                      <td className="mt-td font-song text-ink">{p.sampleNo}</td>
                      <td className="mt-td">
                        <div className="space-y-1">
                          <span>
                            {p.targetKind} · {p.targetRef}
                          </span>
                          {p.targetKind === '字盘' ? (
                            p.caseSnapshot ? (
                              <button
                                type="button"
                                className="block text-seal hover:underline"
                                data-testid={`toggle-snapshot-${p.id}`}
                                onClick={() => toggleExpanded(key)}
                              >
                                {isOpen ? '收起盘面样张' : '查看盘面样张'}
                              </button>
                            ) : (
                              <span className="block text-[11px] text-ink-mute" data-testid={`legacy-case-hint-${p.id}`}>
                                历史记录，仅留存字盘编号，无盘面快照
                              </span>
                            )
                          ) : null}
                        </div>
                      </td>
                      <td className="mt-td">
                        {p.pressureKg} kg · {p.ink}
                      </td>
                      <td className="mt-td">{p.impressions}</td>
                      <td className="mt-td">
                        <span
                          className={`mt-chip ${
                            p.clarity === '清晰'
                              ? 'border-jade/40 text-jade'
                              : p.clarity === '偏淡'
                                ? 'border-brass/40 text-brass'
                                : 'border-seal/40 text-seal'
                          }`}
                        >
                          {p.clarity}
                        </span>
                      </td>
                      <td className="mt-td">{formatDate(p.proofDate)}</td>
                      <td className="mt-td">
                        {p.matrixId ? (
                          <Link
                            className="text-seal hover:underline"
                            to={`/matrices/${p.matrixId}`}
                            data-testid={`proof-matrix-link-${p.id}`}
                          >
                            查看字模
                          </Link>
                        ) : p.targetKind === '字盘' ? (
                          '整盘样张'
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>,
                    p.caseSnapshot ? (
                      <tr key={`${p.id}-snapshot`} data-testid={`snapshot-row-${p.id}`} className={isOpen ? '' : 'hidden'}>
                        <td className="bg-paper/40 px-4 py-3" colSpan={7}>
                          <ProofSnapshotCard
                            snapshot={p.caseSnapshot}
                            matrices={matrices}
                            testIdPrefix={`proof-snapshot-${p.id}`}
                          />
                        </td>
                      </tr>
                    ) : (
                      <Fragment key={`${p.id}-snapshot`} />
                    ),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
