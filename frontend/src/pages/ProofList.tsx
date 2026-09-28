import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import ProofSnapshotGrid from '../components/common/ProofSnapshotGrid';
import { DRAFT_KEYS, useLocalDraft } from '../hooks/useLocalDraft';
import { useCaseStore } from '../stores/caseStore';
import { useMatrixStore } from '../stores/matrixStore';
import { useUiStore } from '../stores/uiStore';
import { describeCapacity } from '../types/case';
import {
  CLARITY_LEVELS,
  IMPRESSION_RANGE,
  PRESSURE_RANGE,
  PROOF_TARGET_KINDS,
  validateProofInput,
  type ClarityLevel,
  type ProofInput,
  type ProofRecord,
  type ProofTargetKind,
} from '../types/proof';
import { dash, formatDate, suggestSampleNo, todayStr } from '../utils/format';
import { buildCaseSnapshot, inspectCaseForProof, slotCoord } from '../utils/proofSnapshot';

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

/** `/proofs` 试印记录：单字登记，整盘试印从现有字盘选择并固化盘面样张快照 */
export default function ProofList() {
  const matrices = useMatrixStore((s) => s.matrices);
  const proofs = useMatrixStore((s) => s.proofs);
  const proofCount = useMatrixStore((s) => s.proofs.length);
  const addProof = useMatrixStore((s) => s.addProof);
  const cases = useCaseStore((s) => s.cases);
  const casesLoaded = useCaseStore((s) => s.loaded);
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
    if (draft.targetKind === '字盘' && selectedCase) {
      patch({ targetRef: selectedCase.code });
    }
  }, [draft.targetKind, selectedCase, patch]);

  /** 整盘试印预检：停用 / 待补刻 / 缺档格位逐格列出，不通过则不生成样张 */
  const caseInspection = useMemo(() => {
    if (draft.targetKind !== '字盘' || !selectedCase) return null;
    return inspectCaseForProof(selectedCase, matrices);
  }, [draft.targetKind, selectedCase, matrices]);

  const traced = useMemo(() => {
    const q = sampleQuery.trim().toLowerCase();
    if (!q) return [];
    return proofs.filter(
      (p) =>
        p.sampleNo.toLowerCase().includes(q) ||
        p.targetRef.toLowerCase().includes(q) ||
        (p.caseSnapshot?.slots.some((s) => s.character.toLowerCase().includes(q)) ?? false),
    );
  }, [proofs, sampleQuery]);

  const clarityStats = useMemo(() => {
    const out: Record<string, number> = {};
    proofs.forEach((p) => {
      out[p.clarity] = (out[p.clarity] ?? 0) + 1;
    });
    return out;
  }, [proofs]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const isCaseProof = draft.targetKind === '字盘';
    const input: ProofInput = {
      targetKind: draft.targetKind,
      targetRef: isCaseProof ? selectedCase?.code ?? draft.targetRef : draft.targetRef,
      matrixId: draft.matrixId,
      pressureKg: Number(draft.pressureKg),
      ink: draft.ink,
      impressions: Number(draft.impressions),
      sampleNo: draft.sampleNo,
      clarity: draft.clarity,
      proofDate: draft.proofDate,
      note: draft.note,
    };
    if (isCaseProof) {
      input.caseId = draft.caseId;
      if (!selectedCase) {
        setErrors({ caseId: '请从现有字盘中选择试印字盘' });
        pushToast('请先选择试印字盘', 'warn');
        return;
      }
      const inspection = inspectCaseForProof(selectedCase, matrices);
      if (!inspection.ready) {
        setErrors({ caseId: inspection.message });
        pushToast('盘面存在待处理格位，请先处理后再生成样张', 'warn');
        return;
      }
      const snapshot = buildCaseSnapshot(selectedCase, matrices);
      if (!snapshot) {
        pushToast('样张快照生成失败，请检查盘面落位', 'error');
        return;
      }
      input.caseSnapshot = snapshot;
    }
    const next = validateProofInput(input);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      pushToast('试印登记未通过校验，请按提示修正', 'warn');
      return;
    }
    await addProof(input);
    pushToast(
      isCaseProof
        ? `已登记整盘试印样张 ${input.sampleNo}，盘面快照已随样张留存`
        : `已登记试印样张 ${input.sampleNo}（${input.clarity}）`,
    );
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

  const caseProofs = useMemo(
    () => sortedProofs.filter((p) => p.targetKind === '字盘'),
    [sortedProofs],
  );

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mt-title" data-testid="proof-list-title">
            试印记录
          </h2>
          <p className="mt-sub">
            单字试印关联字模；整盘试印从现有字盘选择，自动固化行列、工位与每格字符 / 字模编号，盘面日后调整不影响旧样张。
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
                  patch({
                    targetKind: e.target.value as ProofTargetKind,
                    caseId: e.target.value === '字盘' && !draft.caseId && cases[0] ? cases[0].id : draft.caseId,
                  });
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

            {draft.targetKind === '字盘' ? (
              <div className="md:col-span-3">
                <label className="mt-label" htmlFor="proof-case-select">
                  试印字盘（从现有字盘选择）
                </label>
                <select
                  id="proof-case-select"
                  data-testid="proof-case-select"
                  className="mt-input"
                  value={draft.caseId}
                  onChange={(e) => {
                    patch({ caseId: e.target.value });
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.caseId;
                      return next;
                    });
                  }}
                >
                  {cases.length === 0 ? (
                    <option value="">暂无字盘，请先到字盘布局建档</option>
                  ) : null}
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.kind} · {describeCapacity(c.rows, c.cols)} · 已落位 {c.slots.length} ·{' '}
                      {c.workStation}
                    </option>
                  ))}
                </select>
                {errors.caseId ? (
                  <p className="mt-error" data-testid="error-caseId">
                    {errors.caseId}
                  </p>
                ) : selectedCase ? (
                  <p className="mt-hint" data-testid="proof-case-summary">
                    {selectedCase.code} · {describeCapacity(selectedCase.rows, selectedCase.cols)} · 工位{' '}
                    {selectedCase.workStation}
                  </p>
                ) : (
                  <p className="mt-hint">
                    {casesLoaded && cases.length === 0 ? (
                      <>
                        还没有字盘，先到{' '}
                        <Link className="text-seal hover:underline" to="/cases">
                          字盘布局
                        </Link>{' '}
                        建档并落位。
                      </>
                    ) : (
                      '请选择试印字盘'
                    )}
                  </p>
                )}
              </div>
            ) : (
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

          {draft.targetKind === '字盘' && selectedCase && caseInspection ? (
            <div
              className={`rounded border px-3 py-2 text-xs ${
                caseInspection.ready
                  ? 'border-jade/40 bg-jade-pale text-jade'
                  : 'border-seal/40 bg-seal-pale text-seal'
              }`}
              data-testid="proof-case-inspection"
              data-ready={caseInspection.ready ? '1' : '0'}
            >
              {caseInspection.ready ? (
                <p data-testid="proof-case-ready">
                  盘面预检通过：已落位 {caseInspection.filled} 格，全部为可用字模，登记时将固化{' '}
                  {selectedCase.rows} 行 × {selectedCase.cols} 列、工位 {selectedCase.workStation}{' '}
                  与每格字符 / 字模编号作为样张快照。
                </p>
              ) : (
                <div className="space-y-1">
                  <p data-testid="proof-case-blocked">{caseInspection.message}本次不生成样张。</p>
                  <ul className="space-y-0.5" data-testid="proof-case-blockers">
                    {caseInspection.blockers.map((b) => (
                      <li key={`${b.row}-${b.col}`} data-testid={`proof-blocker-${b.row}-${b.col}`}>
                        {slotCoord(b.row, b.col)} 格「{b.character}」·{' '}
                        {b.matrixCode || b.matrixId || '字模编号缺失'} · {b.reason}
                      </li>
                    ))}
                  </ul>
                  <p>
                    可先到{' '}
                    <Link className="font-semibold underline" to="/cases">
                      字盘布局
                    </Link>{' '}
                    取出 / 更换格位，或到{' '}
                    <Link className="font-semibold underline" to="/defects">
                      缺损登记
                    </Link>{' '}
                    处理停用、完成补刻后再试印。
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="mt-btn mt-btn-primary"
              data-testid="submit-proof"
              disabled={draft.targetKind === '字盘' && caseInspection !== null && !caseInspection.ready}
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
              当前对象：{draft.targetKind} ·{' '}
              {draft.targetKind === '字盘' ? dash(selectedCase?.code ?? draft.targetRef) : dash(draft.targetRef)}
            </span>
          </div>
        </form>
      </section>

      <section className="mt-panel" data-testid="trace-panel">
        <div className="mt-panel-head">
          <h3 className="font-song text-sm font-semibold text-ink">按样张编号回溯</h3>
          <input
            className="mt-input max-w-[240px]"
            placeholder="输入样张编号或盘面字符，例：YZ-2025"
            data-testid="sample-search-input"
            value={sampleQuery}
            onChange={(e) => setSampleQuery(e.target.value)}
          />
        </div>
        <div className="px-4 py-3">
          {sampleQuery.trim() === '' ? (
            <p className="text-xs text-ink-mute">输入样张编号、字盘编号或盘面字符即可回溯试印批次与样张快照。</p>
          ) : traced.length === 0 ? (
            <EmptyState
              title="没有匹配的试印记录"
              description="请检查样张编号片段，或先登记一条试印记录。"
              testId="trace-empty"
            />
          ) : (
            <ul className="space-y-2" data-testid="sample-search-result">
              {traced.map((p) => (
                <li key={p.id} className="rounded border border-paper-line bg-paper/40 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-song text-sm text-ink">{p.sampleNo}</span>
                    <span className="mt-chip">{p.clarity}</span>
                    <span className="text-ink-mute">{formatDate(p.proofDate)}</span>
                    <span className="text-ink-soft">
                      {p.targetKind} · {p.targetRef} · {p.pressureKg} kg · {p.ink} · 印次 {p.impressions}
                    </span>
                    {p.targetKind === '字盘' ? (
                      <a className="mt-btn mt-btn-ghost" href={`#snapshot-${p.id}`} data-testid={`trace-snapshot-${p.id}`}>
                        {p.caseSnapshot ? '查看盘面快照' : '旧记录（仅编号）'}
                      </a>
                    ) : p.matrixId ? (
                      <Link className="mt-btn mt-btn-ghost" to={`/matrices/${p.matrixId}`} data-testid={`trace-matrix-${p.id}`}>
                        回溯字模
                      </Link>
                    ) : (
                      <span className="text-ink-mute">未关联单枚字模</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-panel">
        <div className="mt-panel-head">
          <h3 className="font-song text-sm font-semibold text-ink">整盘样张台账（盘面快照）</h3>
          <span className="mt-sub">共 {caseProofs.length} 条整盘试印</span>
        </div>
        <div className="space-y-4 px-4 py-3">
          {caseProofs.length === 0 ? (
            <p className="text-xs text-ink-mute">暂无整盘试印记录。</p>
          ) : (
            caseProofs.map((p) => <CaseProofCard key={p.id} proof={p} currentCode={cases.find((c) => c.id === p.caseId)?.code} />)
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
                sortedProofs.map((p) => (
                  <tr key={p.id} data-testid={`proof-row-${p.id}`}>
                    <td className="mt-td font-song text-ink">{p.sampleNo}</td>
                    <td className="mt-td">
                      {p.targetKind} · {p.targetRef}
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
                      {p.targetKind === '字盘' ? (
                        p.caseSnapshot ? (
                          <a className="text-seal hover:underline" href={`#snapshot-${p.id}`} data-testid={`proof-snapshot-link-${p.id}`}>
                            查看盘面快照
                          </a>
                        ) : (
                          <span className="text-ink-mute" data-testid={`proof-legacy-${p.id}`}>
                            早期记录 · 仅存编号
                          </span>
                        )
                      ) : p.matrixId ? (
                        <Link
                          className="text-seal hover:underline"
                          to={`/matrices/${p.matrixId}`}
                          data-testid={`proof-matrix-link-${p.id}`}
                        >
                          查看字模
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** 单条整盘试印样张：展示登记时固化的盘面；只有编号的旧记录给出兼容提示 */
function CaseProofCard({ proof, currentCode }: { proof: ProofRecord; currentCode?: string }) {
  const snapshot = proof.caseSnapshot;
  const codeChanged = Boolean(snapshot && currentCode && currentCode !== snapshot.caseCode);

  return (
    <article
      className="rounded border border-paper-line bg-white/60 px-4 py-3"
      id={`snapshot-${proof.id}`}
      data-testid={`case-proof-card-${proof.id}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-song text-sm text-ink">{proof.sampleNo}</span>
        <span
          className={`mt-chip ${
            proof.clarity === '清晰'
              ? 'border-jade/40 text-jade'
              : proof.clarity === '偏淡'
                ? 'border-brass/40 text-brass'
                : 'border-seal/40 text-seal'
          }`}
        >
          {proof.clarity}
        </span>
        <span className="text-ink-mute">{formatDate(proof.proofDate)}</span>
        <span className="text-ink-soft">
          {proof.pressureKg} kg · {proof.ink} · 印次 {proof.impressions}
        </span>
        {snapshot ? (
          <span className="mt-chip" data-testid={`snapshot-meta-${proof.id}`}>
            快照盘面 {snapshot.rows}×{snapshot.cols} · {snapshot.slots.length} 格 · 工位 {snapshot.workStation}
          </span>
        ) : null}
      </div>

      {snapshot ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-ink-mute" data-testid={`snapshot-head-${proof.id}`}>
            登记时盘面：{snapshot.caseCode}（{snapshot.caseKind}）
            {codeChanged ? ` · 该字盘当前编号已变为 ${currentCode}，样张仍按登记时盘面展示` : ''}
          </p>
          <ProofSnapshotGrid snapshot={snapshot} testIdPrefix={`snapshot-${proof.id}`} />
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-ink-mute" data-testid={`snapshot-legacy-${proof.id}`}>
          这是改版前登记的整盘试印记录，当时只记下了字盘编号「{proof.targetRef}」，登记时盘面已无从还原；编号与试印结论照常保留可查。
        </p>
      )}

      {proof.note ? <p className="mt-2 text-[11px] text-ink-mute">备注：{proof.note}</p> : null}
    </article>
  );
}
