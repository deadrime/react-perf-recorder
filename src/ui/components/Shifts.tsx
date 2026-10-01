/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { RecordingV2 } from '../../shared/schema';
import { causeText, commitCausesOf, moveText, nearMissOf, type ShiftRun } from '../../shared/shifts';

const SHOWN = 8;

/** What of a picked shift was found on the page now. */
export interface ShiftFound {
  moved: number;
  culprit: boolean;
}

/**
 * The key to what a picked shift draws on the page, in the page's own colours and names: blue is what moved, solid
 * where it is and dashed where it was, red stripes the cause.
 */
export function ShiftLegend({ run, found, id }: { run: ShiftRun; found: ShiftFound; id: string }): JSX.Element {
  const total = found.moved + (found.culprit ? 1 : 0);
  if (!total)
    return (
      <p class="tl-outlined" data-rpr={id} data-found={0}>
        not on the page now
      </p>
    );
  const source = run.first.sources[0];
  const cause = run.first.cause;
  const by = 'by' in cause ? cause.by : undefined;
  const moved = source && source.from[2] && source.from[3] && (source.from[0] !== source.to[0] || source.from[1] !== source.to[1]);
  return (
    <p class="shift-legend" data-rpr={id} data-found={total}>
      {found.moved ? (
        <span class="lg">
          <i class="lg-now" />
          {`${source?.component ?? source?.node ?? 'moved'} now`}
        </span>
      ) : null}
      {found.moved && moved ? (
        <span class="lg">
          <i class="lg-was" />
          where it was
        </span>
      ) : null}
      {found.culprit && by ? (
        <span class="lg">
          <i class="lg-cause" />
          {`${by.component ?? by.node}, the cause`}
        </span>
      ) : by?.change === 'removed' ? (
        <span class="muted">the cause was removed</span>
      ) : null}
    </p>
  );
}

export const shiftValue = (value: number) => String(+value.toFixed(3));

/** Under a thousandth a shift is a few pixels of a small element: text that grew, an icon that came. */
const TINY = 0.001;

/** A run's score as its badge shows it: a tiny one is not zero, it is only too small to print. */
export const runValue = (value: number) => (value < TINY ? `<${TINY}` : shiftValue(value));

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
  const near = run.shifts.some((s) => nearMissOf(s, run.count === 1));
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
  /** What of the picked run was found on the page now. */
  outlined: ShiftFound | null;
}): JSX.Element {
  const cls = rec.shifts!.cls;
  const commitCauses = commitCausesOf(rec);
  // Tiny ones wait behind a line when there is anything larger to read first; a picked one always shows.
  const [allTiny, setAllTiny] = useState(false);
  const tiny = runs.filter((run) => run.value < TINY).length;
  const folded = tiny < runs.length && !allTiny;
  const visible = runs.map((run, i) => ({ run, i })).filter(({ run, i }) => !folded || run.value >= TINY || picked === i);
  const listed = visible.slice(0, SHOWN);
  const more = visible.length - listed.length;
  const hidden = runs.length - visible.length;
  return (
    <div class="shifts" data-rpr="shifts">
      {cls.nearMiss && !rec.conditions.throttle ? (
        <p class="shift-hint muted" data-rpr="shift-hint">
          {'Near misses were left out only because they came soon after an input; on a slower phone they would likely count. ' +
            'Record again with the CPU slowed ×4–6 (DevTools › Performance) to see.'}
        </p>
      ) : null}
      {listed.map(({ run, i }) => {
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
                <span class="badge" data-tone={run.excluded < run.count && run.value >= TINY ? 'warn' : undefined}>
                  {runValue(run.value)}
                </span>
                <span class="who">{source?.component ?? source?.node ?? 'an element'}</span>
                <span class="shift-move">{moveText(run)}</span>
                <span class="shift-at">{runWhen(run)}</span>
                <CountedBadge run={run} />
              </span>
              <span class="shift-cause">{causeText(run.first.cause, commitCauses, run.count, source)}</span>
              {source?.file ? <code class="shift-where">{source.file}</code> : null}
            </button>
            {picked === i && outlined ? <ShiftLegend run={run} found={outlined} id="shift-outlined" /> : null}
          </div>
        );
      })}
      {more > 0 ? <p class="muted">{`+ ${more} smaller ones`}</p> : null}
      {hidden ? (
        <button type="button" class="tl-link shift-tiny" data-rpr="shift-tiny" onClick={() => setAllTiny(true)}>
          {`+ ${hidden} under ${TINY}: a few pixels each`}
        </button>
      ) : null}
    </div>
  );
}
