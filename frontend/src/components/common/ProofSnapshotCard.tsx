import { Link } from 'react-router-dom';
import type { TypeMatrix } from '../../types/matrix';
import type { ProofCaseSnapshot } from '../../types/proof';
import { describeCapacity } from '../../types/case';
import { dash, formatStamp } from '../../utils/format';
import { cellLabel } from '../../utils/proofSnapshot';

export interface ProofSnapshotCardProps {
  /** 登记时固化的盘面快照 */
  snapshot: ProofCaseSnapshot;
  /** 现有字模档案，用于标出停用 / 待补刻格位（快照内容本身不会被改变） */
  matrices?: TypeMatrix[];
  /** 是否按当前可用性给格位着色（提交前预览用）；旧样张只呈现存档盘面 */
  highlightAvailability?: boolean;
  testIdPrefix?: string;
}

/** 整盘试印样张：以登记时固化的行列网格呈现盘面，不随后续字盘调整变化 */
export default function ProofSnapshotCard({
  snapshot,
  matrices = [],
  highlightAvailability = false,
  testIdPrefix = 'proof-snapshot',
}: ProofSnapshotCardProps) {
  const matrixMap = new Map(matrices.map((m) => [m.id, m]));
  const slotAt = new Map(snapshot.slots.map((s) => [`${s.row}-${s.col}`, s]));
  const filled = snapshot.slots.length;
  const capacity = snapshot.rows * snapshot.cols;

  return (
    <div className="rounded border border-paper-line bg-paper/40 px-3 py-3" data-testid={testIdPrefix}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
        <span className="font-song text-sm font-semibold text-ink" data-testid={`${testIdPrefix}-code`}>
          {snapshot.caseCode}
        </span>
        <span data-testid={`${testIdPrefix}-capacity`}>{describeCapacity(snapshot.rows, snapshot.cols)}</span>
        <span data-testid={`${testIdPrefix}-station`}>工位 {dash(snapshot.workStation)}</span>
        <span data-testid={`${testIdPrefix}-filled`}>
          已落位 {filled} / {capacity}
        </span>
        {snapshot.snapshottedAt ? (
          <span className="text-ink-mute" data-testid={`${testIdPrefix}-at`}>
            盘面存档于 {formatStamp(snapshot.snapshottedAt)}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `24px repeat(${snapshot.cols}, minmax(40px, 1fr))` }}
            data-testid={`${testIdPrefix}-grid`}
            data-rows={snapshot.rows}
            data-cols={snapshot.cols}
          >
            <div className="flex h-6 items-center justify-center text-[10px] text-ink-mute">列</div>
            {Array.from({ length: snapshot.cols }, (_, c) => (
              <div key={`h-${c}`} className="flex h-6 items-center justify-center font-song text-[10px] text-ink-mute">
                {c + 1}
              </div>
            ))}
            {Array.from({ length: snapshot.rows }, (_, r) => (
              <div key={`row-${r}`} className="contents">
                <div className="flex h-10 items-center justify-center font-song text-[10px] text-ink-mute">
                  {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[r] ?? r + 1}
                </div>
                {Array.from({ length: snapshot.cols }, (_, c) => {
                  const s = slotAt.get(`${r}-${c}`);
                  const live = s ? matrixMap.get(s.matrixId) : undefined;
                  const blocked = highlightAvailability && live && live.availability !== '可用';
                  const missing = s && !live;
                  const cell = (
                    <div
                      title={
                        s
                          ? `${cellLabel(r, c)} ${s.character} · ${s.matrixCode || '字模编号未存档'}${
                              blocked ? ` · 当前${live!.availability}` : ''
                            }`
                          : `${cellLabel(r, c)} 空格`
                      }
                      data-testid={`${testIdPrefix}-cell-${r}-${c}`}
                      data-filled={s ? '1' : '0'}
                      className={`flex h-10 flex-col items-center justify-center rounded border text-center ${
                        s
                          ? 'border-ink/25 bg-white shadow-press'
                          : 'border-dashed border-paper-line bg-paper/50'
                      } ${blocked ? 'border-seal bg-seal-pale' : ''} ${
                        missing ? 'border-brass/60 bg-brass-pale/50' : ''
                      }`}
                    >
                      <span className="font-song text-base leading-none text-ink">{s?.character ?? ''}</span>
                      <span className="mt-0.5 max-w-full truncate px-0.5 text-[8px] leading-none text-ink-mute">
                        {s ? s.matrixCode || (missing ? '字模已删' : '') : ''}
                      </span>
                    </div>
                  );
                  return s && live ? (
                    <Link key={`${r}-${c}`} to={`/matrices/${s.matrixId}`} className="block">
                      {cell}
                    </Link>
                  ) : (
                    <div key={`${r}-${c}`}>{cell}</div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {highlightAvailability && matrices.length > 0 ? (
        <p className="mt-2 text-[11px] text-ink-mute" data-testid={`${testIdPrefix}-legend`}>
          红底格位为当前停用 / 待补刻字模，需先处理；白底为存档盘面，不随后续调整变化。
        </p>
      ) : null}
    </div>
  );
}
