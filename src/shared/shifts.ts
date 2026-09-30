import type { ClsTotals, LatencyEntry, LayoutShift, RecordingV2, ShiftCause, ShiftCulprit, ShiftNode, ShiftRect } from './schema';

const round = (n: number) => +n.toFixed(4);

/** Past this many shifts a recording keeps no more: an endless animation must not grow it without bound. */
export const MAX_SHIFTS = 1000;

/** Ties each shift to the latest input before it, within 5 s: the interaction it followed. */
export function linkInteractions(list: LayoutShift[], latency: LatencyEntry[]): LayoutShift[] {
  for (const shift of list) {
    let follows: LatencyEntry | undefined;
    for (const entry of latency)
      if (entry.atMs <= shift.atMs && shift.atMs - entry.atMs <= 5000 && (!follows || entry.atMs > follows.atMs)) follows = entry;
    // Event Timing leaves out inputs under 16 ms: a faster one after `follows` is the one the shift followed.
    const inputAt = shift.sinceInputMs === undefined ? null : shift.atMs - shift.sinceInputMs;
    if (follows && (inputAt === null || follows.atMs >= inputAt - 2)) shift.interactionId = follows.interactionId;
  }
  return list;
}

/**
 * Left out by the browser, but likely counted on a slower device: an animation's frames run later there. `alone`: the
 * shift's run has one frame, so a style written from script was one write, not an animation.
 */
export const nearMissOf = (s: LayoutShift, alone = false) =>
  s.hadRecentInput &&
  (('animation' in s.cause && !(alone && s.cause.animation === 'inline-style')) ||
    (s.sinceInputMs !== undefined && s.sinceInputMs >= 300 && s.sinceInputMs <= 500));

/** CLS by session windows, as web-vitals counts it: a gap under 1 s keeps a window open, for at most 5 s. */
export function clsOf(list: LayoutShift[]): ClsTotals {
  let value = 0;
  let windowAtMs: number | null = null;
  let current = 0;
  let start = -Infinity;
  let last = -Infinity;
  let nearMiss = 0;
  let excluded = 0;
  const alone = new Set(shiftRuns(list).flatMap((run) => (run.count === 1 ? [run.first] : [])));
  for (const s of [...list].sort((a, b) => a.atMs - b.atMs)) {
    if (s.hadRecentInput) {
      excluded += s.value;
      if (nearMissOf(s, alone.has(s))) nearMiss += s.value;
      continue;
    }
    if (s.atMs - last < 1000 && s.atMs - start < 5000) current += s.value;
    else {
      current = s.value;
      start = s.atMs;
    }
    last = s.atMs;
    if (current > value) {
      value = current;
      windowAtMs = start;
    }
  }
  return { value: round(value), windowAtMs, nearMiss: round(nearMiss), excluded: round(excluded), count: list.length };
}

/** Shifts of one element for one reason, frame after frame: an animation is one line, not fifty. */
export interface ShiftRun {
  atMs: number;
  endMs: number;
  count: number;
  value: number;
  counted: number;
  excluded: number;
  first: LayoutShift;
  last: LayoutShift;
  shifts: LayoutShift[];
}

const causeKind = (c: ShiftCause) => Object.keys(c)[0];
const nodeKey = (n: ShiftNode | undefined) => (n ? `${n.component ?? ''}|${n.node}` : '');
const runKey = (s: LayoutShift) => `${nodeKey(s.sources[0])}|${causeKind(s.cause)}|${'by' in s.cause ? nodeKey(s.cause.by) : ''}`;

/** Worst first. A run breaks when its element has not moved for the reason for 250 ms. */
export function shiftRuns(list: LayoutShift[]): ShiftRun[] {
  const open = new Map<string, ShiftRun>();
  const runs: ShiftRun[] = [];
  for (const s of [...list].sort((a, b) => a.atMs - b.atMs)) {
    const key = runKey(s);
    let run = open.get(key);
    if (!run || s.atMs - run.endMs > 250) {
      run = { atMs: s.atMs, endMs: s.atMs, count: 0, value: 0, counted: 0, excluded: 0, first: s, last: s, shifts: [] };
      open.set(key, run);
      runs.push(run);
    }
    run.endMs = s.atMs;
    run.count++;
    run.value += s.value;
    if (s.hadRecentInput) run.excluded++;
    else run.counted += s.value;
    run.last = s;
    run.shifts.push(s);
  }
  for (const run of runs) {
    run.value = round(run.value);
    run.counted = round(run.counted);
  }
  return runs.sort((a, b) => b.value - a.value);
}

export const nodeText = (n: ShiftNode) => (n.component ? `${n.component}${n.file ? ` (${n.file})` : ''}` : n.node);

const empty = (r: ShiftRect) => r[2] === 0 || r[3] === 0;

/** Each element the run moved, from its box in the first frame to its box in the last one. */
export function runMoves(run: ShiftRun): Array<ShiftNode & { from: ShiftRect; to: ShiftRect; fixed?: true }> {
  // Two list rows named alike are told apart by their order among the ones named so.
  const nth = (sources: ShiftNode[], i: number) => sources.slice(0, i).filter((s) => nodeKey(s) === nodeKey(sources[i])).length;
  // Rects are in the viewport: both boxes go into the last frame's, or the window's scroll during the run reads as a move.
  const [dx, dy] = [0, 1].map((k) => (run.first.scroll?.[k] ?? 0) - (run.last.scroll?.[k] ?? 0));
  const moved = (r: ShiftRect, fixed?: true): ShiftRect => (fixed || empty(r) ? r : [r[0] + dx, r[1] + dy, r[2], r[3]]);
  return run.first.sources.map((source, i) => {
    const n = nth(run.first.sources, i);
    const end = run.last.sources.filter((s) => nodeKey(s) === nodeKey(source))[n];
    return { ...source, from: moved(source.from, source.fixed), to: end ? end.to : moved(source.to, source.fixed) };
  });
}

/** `moved up 300px`, `appeared`: from the first box of the run to the last one of the same element. */
export function moveText(run: ShiftRun): string {
  const moved = runMoves(run)[0];
  return moved ? moveOf(moved.from, moved.to) : 'moved';
}

/** The words for one element's boxes before and after. */
export function moveOf(from: ShiftRect, to: ShiftRect): string {
  if (empty(from) && !empty(to)) return 'appeared';
  if (!empty(from) && empty(to)) return 'disappeared';
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  if (!dx && !dy) return `resized to ${to[2]}×${to[3]}`;
  return Math.abs(dy) >= Math.abs(dx) ? `moved ${dy > 0 ? 'down' : 'up'} ${Math.abs(dy)}px` : `moved ${dx > 0 ? 'right' : 'left'} ${Math.abs(dx)}px`;
}

function culpritText(by: ShiftCulprit): string {
  const who = nodeText(by);
  const name = by.name ? ` ${by.name}` : '';
  switch (by.change) {
    case 'added': {
      // Mounted without a size, it took its space from the file: the size is the fix, not the mount.
      const tag = by.node.split(' > ').pop();
      const what = by.unsized ? `, ${tag} with no size set,` : '';
      return by.where === 'inside' ? `${who}${what} added inside it` : `${who}${what} mounted above it`;
    }
    case 'removed':
      return by.where === 'inside' ? `an element removed inside it (${who})` : `an element removed above it (${who})`;
    case 'text':
      return by.where === 'self' || by.where === 'inside' ? `its text changed (${who})` : `text changed above it (${who})`;
    case 'loaded': {
      const what = by.component ? `${by.node.split(' > ').pop()} in ${who}` : by.node;
      return `${what} loaded with no size set${by.where === 'inside' ? ' inside it' : ' above it'}`;
    }
    case 'animated':
      return `${who} animates${name}${
        by.where === 'self' ? '' : by.where === 'ancestor' ? ' (an ancestor)' : by.where === 'before' ? ' above it' : ' inside it'
      }`;
    default:
      return by.where === 'self'
        ? `its${name} changed (${who})`
        : by.where === 'ancestor'
        ? `${who}, an ancestor, changed its${name}`
        : by.where === 'before'
        ? `${who} above it changed its${name}`
        : `${who} inside it changed its${name}`;
  }
}

/** `frames`: how many frames the run took; a style written once is not called an animation. */
export function causeText(cause: ShiftCause, commitCauses?: (id: number) => string[], frames?: number): string {
  if ('commit' in cause) {
    const why = cause.commit !== null ? commitCauses?.(cause.commit) ?? [] : [];
    const commit = cause.commit !== null ? `commit ${cause.commit}` : `a commit at ${(cause.atMs / 1000).toFixed(2)}s`;
    return `${cause.by ? culpritText(cause.by) : 'a DOM change'} in ${commit}${why.length ? ` (${why.slice(0, 2).join(', ')})` : ''}`;
  }
  if ('animation' in cause) {
    const by = cause.by;
    const on = !by
      ? ''
      : by.where === 'self'
      ? ' on it'
      : ` on ${nodeText(by)}${by.where === 'before' ? ' above it' : ` (${by.where === 'ancestor' ? 'an ancestor' : 'inside it'})`}`;
    const what = by?.name ? ` of ${by.name}` : '';
    if (cause.animation === 'inline-style')
      return frames === 1 ? `style written${on} from script` : `style written${on} from script frame after frame: an animation of layout outside CSS`;
    return `${cause.animation === 'css' ? 'a CSS animation' : 'element.animate()'}${what}${on}`;
  }
  if ('dom' in cause) return `${cause.by ? culpritText(cause.by) : 'a DOM change'} outside a React commit (an effect, a timer or a library)`;
  if ('resource' in cause) {
    if (cause.resource === 'font') return 'a web font arrived and replaced the fallback';
    if (cause.resource === 'css') return `a stylesheet arrived${cause.by ? ` (${cause.by.node})` : ''}`;
    return cause.by ? culpritText(cause.by) : 'an image loaded with no size set';
  }
  return 'nothing changed in its frame that the recorder saw: a resize, scroll anchoring, or a frame of another origin';
}

/** The causes of a commit by its id, by key: what `causeText` names after `commit N`. */
export function commitCausesOf(rec: Pick<RecordingV2, 'commits' | 'causes'>): (id: number) => string[] {
  const causeKeys = new Map(rec.causes.map((c) => [c.i, c.key]));
  const commits = new Map(rec.commits.list.map((c) => [c.i, c]));
  return (id) => (commits.get(id)?.causeIds ?? []).map((i) => causeKeys.get(i)).filter((k): k is string => Boolean(k));
}

/** What the culprit did, in a word or two: its label on the page. */
export function changeText(by: ShiftCulprit): string {
  switch (by.change) {
    case 'added':
      return by.unsized ? 'mounted, no size' : 'mounted';
    case 'removed':
      return 'removed';
    case 'text':
      return 'text changed';
    case 'loaded':
      return 'loaded, no size';
    case 'animated':
      return `animates${by.name ? ` ${by.name}` : ''}`;
    default:
      return `changed${by.name ? ` ${by.name}` : ''}`;
  }
}

/** One line in words: how much, what moved and where, what moved it, and whether the browser counted it. */
/** `rec`, or its `commitCausesOf` made once when many runs are written. */
export function runText(run: ShiftRun, rec?: Pick<RecordingV2, 'commits' | 'causes'> | ((id: number) => string[])): string {
  const source = run.first.sources[0];
  const what = source ? nodeText(source) : 'an element';
  const when =
    run.count > 1
      ? `over ${run.count} frames, ${(run.atMs / 1000).toFixed(2)}–${(run.endMs / 1000).toFixed(2)}s`
      : `at ${(run.atMs / 1000).toFixed(2)}s`;
  const commitCauses = typeof rec === 'function' ? rec : rec ? commitCausesOf(rec) : undefined;
  const counted =
    run.excluded === 0
      ? 'counted'
      : run.excluded === run.count
      ? 'excluded after an input'
      : `${run.count - run.excluded} counted, ${run.excluded} excluded after an input`;
  const since = run.first.sinceInputMs;
  const input = since !== undefined && since < 5000 ? `; began ${since}ms after the last input` : '';
  return `${run.value} ${what} ${moveText(run)} ${when}: ${causeText(run.first.cause, commitCauses, run.count)}; ${counted}${input}`;
}

/** The summary's line, when there is something to say; the rest is in section shifts. */
export function shiftsSummaryLine(rec: RecordingV2): string | null {
  const shifts = rec.shifts;
  // Below a hundredth nothing is worth a line in every summary; the section still lists it.
  if (!shifts || (shifts.cls.value < 0.01 && shifts.cls.nearMiss < 0.01)) return null;
  const worst = shiftRuns(shifts.list)[0];
  const hint =
    shifts.cls.nearMiss && !rec.conditions.throttle
      ? '; the excluded ones would likely count on a slower device — record again with throttle: 4 or 6'
      : '';
  return `CLS ${shifts.cls.value}${shifts.cls.nearMiss ? `, near miss ${shifts.cls.nearMiss}` : ''}${
    worst ? `; worst: ${runText(worst, rec)}` : ''
  }${hint}; section shifts`;
}

/** What moved, summed per element: the element named the same in both runs is the same element. */
export function shiftsByElement(list: LayoutShift[]): Map<string, { counted: number; total: number }> {
  const out = new Map<string, { counted: number; total: number }>();
  for (const s of list) {
    const source = s.sources[0];
    if (!source) continue;
    // Without the line: an edit above the component must not make it a new element in the comparison.
    const key = nodeText({ ...source, file: source.file?.replace(/(:\d+){1,2}$/, '') });
    const entry = out.get(key) ?? { counted: 0, total: 0 };
    entry.total = round(entry.total + s.value);
    if (!s.hadRecentInput) entry.counted = round(entry.counted + s.value);
    out.set(key, entry);
  }
  return out;
}
