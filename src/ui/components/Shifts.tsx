/** @jsxImportSource preact */
import type { JSX } from 'preact';
import type { RecordingV2 } from '../../shared/schema';
import { causeText, commitCausesOf, moveText, nearMissOf, type ShiftRun } from '../../shared/shifts';

const SHOWN = 8;

export const shiftValue = (value: number) => String(+value.toFixed(3));

/** When a run happened: one frame, or the span of the frames it took. */
export const runWhen = (run: ShiftRun) =>
  run.count > 1 ? `${(run.atMs / 1000).toFixed(2)}–${(run.endMs / 1000).toFixed(2)}s · ${run.count} frames` : `${(run.atMs / 1000).toFixed(2)}s`;

/** Whether the browser counted it, as a badge: excluded after an input, and likely counted on a slower device. */
export function CountedBadge({ run }: { run: ShiftRun }): JSX.Element {
  if (!run.excluded)
    return (
      <span class="badge" data-tone="warn">
        counted
      </span>
    );
  const near = run.shifts.some(nearMissOf);
  return (
    <span
      class="badge"
      data-tone={near ? 'warn' : undefined}
      title={
        near
          ? 'Left out of CLS because an input came less than 500 ms before; on a slower device it would likely start later and count'
          : 'Left out of CLS because an input came less than 500 ms before'
      }
    >
      {near ? 'near miss' : run.excluded === run.count ? 'after input' : `${run.count - run.excluded} counted`}
    </span>
  );
}

/**
 * The layout shifts of the recording, worst first, in the words the MCP section uses: what moved, how far, what moved
 * it. A row picked outlines on the page where the element was and is, and the culprit.
 */
export function Shifts({
  rec,
  runs,
  picked,
  onPick,
  outlined,
}: {
  rec: RecordingV2;
  runs: ShiftRun[];
  picked: number | null;
  onPick: (i: number | null) => void;
  /** How many of the picked run's elements were found on the page now. */
  outlined: number | null;
}): JSX.Element {
  const cls = rec.shifts!.cls;
  const commitCauses = commitCausesOf(rec);
  return (
    <div class="shifts" data-rpr="shifts">
      {cls.nearMiss && !rec.conditions.throttle ? (
        <p class="shift-hint muted" data-rpr="shift-hint">
          {'Near misses were left out only because they came soon after an input; on a slower phone they would likely count. ' +
            'Record again with the CPU slowed ×4–6 (DevTools › Performance) to see.'}
        </p>
      ) : null}
      {runs.slice(0, SHOWN).map((run, i) => {
        const source = run.first.sources[0];
        return (
          <div class="shift" key={`${run.atMs}-${i}`} data-picked={picked === i ? 'true' : undefined}>
            <button
              type="button"
              class="shift-row"
              data-rpr="shift"
              aria-pressed={picked === i}
              title={picked === i ? 'Take the outline off the page' : 'Outline on the page where it was, where it is, and what moved it'}
              onClick={() => onPick(picked === i ? null : i)}
            >
              <span class="shift-head">
                <span class="badge" data-tone={run.counted ? 'warn' : undefined}>
                  {shiftValue(run.value)}
                </span>
                <span class="who">{source?.component ?? source?.node ?? 'an element'}</span>
                <span class="shift-move">{moveText(run)}</span>
                <span class="shift-at">{runWhen(run)}</span>
                <CountedBadge run={run} />
              </span>
              <span class="shift-cause">{causeText(run.first.cause, commitCauses)}</span>
              {source?.file ? <code class="shift-where">{source.file}</code> : null}
            </button>
            {picked === i && outlined !== null ? (
              <p class="tl-outlined" data-rpr="shift-outlined" data-found={outlined}>
                {outlined ? `◻ outlined on the page: ${outlined}` : 'not on the page now'}
              </p>
            ) : null}
          </div>
        );
      })}
      {runs.length > SHOWN ? <p class="muted">{`+ ${runs.length - SHOWN} smaller ones`}</p> : null}
    </div>
  );
}
