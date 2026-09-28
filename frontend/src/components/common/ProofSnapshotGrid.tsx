import type { ProofCaseSnapshot } from '../../types/proof';
import { rcKey } from '../../utils/layout';
import { caseRowLabel } from '../../utils/proofSnapshot';

export interface ProofSnapshotGridProps {
  snapshot: ProofCaseSnapshot;
  /** 需要额外高亮的格位 */
  highlightKeys?: string[];
  testIdPrefix?: string;
}

const ROW_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** 只读的样张盘面快照：字符 + 登记时的字模编号，与当前字盘是否调整无关 */
export default function ProofSnapshotGrid({
  snapshot,
  highlightKeys = [],
  testIdPrefix = 'proof-snapshot-slot',
}: ProofSnapshotGridProps) {
  const { rows, cols, slots } = snapshot;
  const highlightSet = new Set(highlightKeys);
  const at = (r: number, c: number) => slots.find((s) => s.row === r && s.col === c);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `28px repeat(${cols}, minmax(52px, 1fr))` }}
          data-testid="proof-snapshot-grid"
          data-rows={rows}
          data-cols={cols}
        >
          <div className="flex h-7 items-center justify-center text-[10px] text-ink-mute">列</div>
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={`h-${c}`}
              className="flex h-7 items-center justify-center font-song text-[11px] text-ink-mute"
            >
              {c + 1}
            </div>
          ))}

          {Array.from({ length: rows }, (_, r) => (
            <div key={`row-${r}`} className="contents">
              <div className="flex h-12 items-center justify-center font-song text-[11px] text-ink-mute">
                {ROW_LABELS[r] ?? r + 1}
              </div>
              {Array.from({ length: cols }, (_, c) => {
                const slot = at(r, c);
                const isHighlighted = highlightSet.has(rcKey(r, c));
                return (
                  <div
                    key={`${r}-${c}`}
                    title={
                      slot
                        ? `${caseRowLabel(r)}${c + 1} ${slot.character}（${slot.matrixCode || slot.matrixId}）`
                        : `${caseRowLabel(r)}${c + 1} 空格`
                    }
                    data-testid={`${testIdPrefix}-${r}-${c}`}
                    data-filled={slot ? '1' : '0'}
                    className={`flex h-12 flex-col items-center justify-center rounded border text-center ${
                      slot
                        ? 'border-ink/25 bg-white shadow-press'
                        : 'border-dashed border-paper-line bg-paper/40'
                    } ${isHighlighted ? 'ring-2 ring-brass' : ''}`}
                  >
                    {slot ? (
                      <>
                        <span className="font-song text-lg leading-none text-ink">{slot.character}</span>
                        <span className="mt-0.5 max-w-full truncate px-0.5 text-[9px] leading-none text-ink-mute">
                          {slot.matrixCode || slot.matrixId}
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] leading-none text-ink-mute/70">{r + 1}·{c + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
