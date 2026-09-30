/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ActionRecord, CommitRecord, RecordingV2 } from '../../shared/schema';
import { actionText, cascadeOf, hookOf, reasonsById, type CascadeNode } from '../../shared/summary';
import { causeText, commitCausesOf, moveOf, moveText, nearMissOf, nodeText, runMoves, type ShiftRun } from '../../shared/shifts';
import { Flame } from './Flame';
import { CountedBadge, runValue, runWhen, ShiftLegend, shiftValue, type ShiftFound } from './Shifts';
import { ReasonLine, StepView } from './Stats';
import { LcpFound, lcpWho } from './Lcp';
import { mountText, phasesText, secs } from '../../shared/lcp';

/**
 * The colour says what woke the commit; the eye finds the rhythm of one store or one timer faster than a list does.
 * The colours themselves live with the rest of the palette in `styles.ts`; here they are only named.
 */
const CAUSE_COLOURS: Array<[RegExp, string]> = [
  [/^core:input/, 'var(--cause-input)'],
  [/^core:timer/, 'var(--cause-timer)'],
  [/^core:(effect|update)/, 'var(--cause-effect)'],
  [/^core:navigation/, 'var(--cause-navigation)'],
  [/^zustand:/, 'var(--cause-store)'],
  [/^react-query:/, 'var(--cause-query)'],
];

const colourOf = (key: string | undefined) => (key && CAUSE_COLOURS.find(([re]) => re.test(key))?.[1]) || 'var(--cause-unknown)';

/** The colour a cause is drawn in on the tracks, for whatever else names that cause: the legend above them. */
export const causeColour = colourOf;

/** As close as zoom gets, whatever the length of the recording: a long one zooms further from its fit. */
const DEEPEST_PX_PER_MS = 1.8;
/**
 * How hard a pinch zooms: the spread of the fingers to this power. 1 keeps the tracks under the fingers; below 1 is
 * gentler (0.5: fingers three times apart zoom ×1.7), above 1 sharper.
 */
const PINCH_SPEED = 1;
const STRIP_PX = 320;
const BUCKET_PX = 2;
/** The narrowest bar drawn: a quick commit still has to be seen; the area around it that takes the click is wider. */
const MIN_BAR_PX = 3;
const MIN_ZOOM = 1;
const MAX_ZOOM = 30;
/** A tick every ~70px, on a round number of milliseconds. */
const TICK_STEPS = [50, 100, 200, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000];
/** Lanes of the app's own roots, under the two that summarise everything. */
const ROOT_LANES = 8;
const COMMITS_LANE_H = 18;
const ROOT_LANE_H = 13;
const SHIFTS_LANE_H = 12;
/** Drawn a little beyond the edges, so a scroll of a few pixels does not show an empty strip. */
const VIEW_MARGIN_PX = 200;

interface Bar {
  x: number;
  w: number;
  h: number;
  /** How much of the lane's work this bar carries: the brightness, where the height is already spoken for. */
  weight: number;
  colour: string;
  /** Commits drawn by this bar; a bar is a few pixels and a busy second holds more commits than pixels. */
  ids: number[];
  /** The one worth opening: of the commits in the bar, the one that rendered most. */
  lead: number;
  title: string;
  /** For a root's lane: its render time in the lead commit, when the build times renders. */
  ms?: number;
}

interface Lane {
  key: string;
  label: string;
  note: string;
  height: number;
  bars: Bar[];
}

interface Layout {
  lanes: Lane[];
  actions: Array<{ x: number; w: number; action: ActionRecord }>;
  ticks: Array<{ x: number; label: string }>;
  width: number;
  scale: number;
  hidden: number;
}

/** `fitPx` is how wide the tracks are on screen: the whole recording fills them at the first zoom level. */
const baseScale = (durationMs: number, fitPx = STRIP_PX) => fitPx / Math.max(1, durationMs);

/** A bar per column of pixels: several commits in one column become one bar that opens on the busiest of them. */
const px = (value: number) => Math.round(value * 100) / 100;

function pack(
  commits: Array<{ commit: CommitRecord; hits: number; ms?: number }>,
  scale: number,
  colour: (c: CommitRecord) => string,
  height: (hits: number) => number,
  weight: (hits: number, ms?: number) => number = () => 1
) {
  const byColumn = new Map<number, Bar & { top: number }>();
  for (const { commit, hits, ms } of commits) {
    // A commit is stamped when it lands, after React rendered it: the render is the time before that moment. Drawn
    // from the stamp on, a long render would cover the commits that came after it.
    // Not snapped to whole pixels: while zooming, a snapped bar steps back and forth around where it should be.
    const x = px(Math.max(0, commit.atMs - (commit.ms ?? 0)) * scale);
    // As wide as React took, what this lane is about (a root's own render) before the whole commit.
    const w = Math.max(MIN_BAR_PX, px((ms ?? commit.ms ?? 0) * scale));
    const column = Math.round(x / BUCKET_PX);
    const bar = byColumn.get(column);
    if (!bar) {
      byColumn.set(column, {
        x,
        w,
        h: height(hits),
        weight: weight(hits, ms),
        // The commit a column opens on: the slowest where there are times, else the one that rendered most.
        top: ms ?? hits,
        ms,
        colour: colour(commit),
        ids: [commit.i],
        lead: commit.i,
        title: '',
      });
      continue;
    }
    bar.ids.push(commit.i);
    bar.w = Math.max(bar.w, w);
    if ((ms ?? hits) > bar.top) {
      bar.top = ms ?? hits;
      bar.lead = commit.i;
      // Drawn where its lead is: where the first commit is shifts when a zoom splits the column.
      bar.x = x;
      bar.colour = colour(commit);
      bar.h = height(hits);
      bar.weight = weight(hits, ms);
      bar.ms = ms;
    }
  }
  return [...byColumn.values()];
}

function layout(rec: RecordingV2, causeKeys: Map<number, string>, zoom: number, onlyChanged: boolean, fitPx = STRIP_PX): Layout {
  const duration = Math.max(1, rec.durationMs);
  const scale = baseScale(duration, fitPx) * zoom;
  const width = Math.ceil(duration * scale) + 8;
  const shown = onlyChanged ? rec.commits.list.filter((c) => c.renders > (c.noDom ?? 0)) : rec.commits.list;
  const hidden = rec.commits.list.length - shown.length;
  const causeOf = (c: CommitRecord) => colourOf(c.causeIds?.map((i) => causeKeys.get(i)).find(Boolean));
  const peak = shown.reduce((most, c) => Math.max(most, c.renders), 1);

  const lanes: Lane[] = [
    {
      key: 'commits',
      label: 'Commits',
      note: `${shown.length}`,
      height: COMMITS_LANE_H,
      // The height of a bar is how much rendered in it, by the square root: one burst must not flatten the rest.
      bars: pack(
        shown.map((commit) => ({ commit, hits: commit.renders })),
        scale,
        causeOf,
        (renders) => Math.max(3, Math.round(COMMITS_LANE_H * Math.sqrt(Math.min(1, renders / peak))))
      ),
    },
  ];

  // A lane per cascade root, in the order the report ranks them: where each one rendered, across the same time.
  const roots = rec.roots.slice(0, ROOT_LANES);
  const byRoot = new Map<number, Array<{ commit: CommitRecord; hits: number; ms?: number }>>();
  // The slowest render of any root: a root's bars are as bright as their time against it, so the slow ones stand out.
  let slowest = 0;
  for (const commit of shown) {
    for (const entry of commit.roots ?? []) {
      if (entry.i >= roots.length) continue;
      const list = byRoot.get(entry.i) ?? [];
      list.push({ commit, hits: entry.hits, ...(entry.ms !== undefined ? { ms: entry.ms } : {}) });
      byRoot.set(entry.i, list);
      slowest = Math.max(slowest, entry.ms ?? 0);
    }
  }
  for (const [index, root] of roots.entries()) {
    const commits = byRoot.get(index) ?? [];
    if (!commits.length) continue;
    const most = commits.reduce((top, c) => Math.max(top, c.hits), 1);
    lanes.push({
      key: `root-${index}`,
      label: root.name,
      note: `×${root.hits}`,
      height: ROOT_LANE_H,
      // A root either rendered in a commit or it did not, so every bar fills its lane and the columns of one moment
      // line up. The brightness is its render time against the slowest root's; without times, how many instances.
      bars: pack(
        commits,
        scale,
        causeOf,
        () => ROOT_LANE_H - 1,
        (hits, ms) => (slowest ? 0.35 + 0.65 * Math.sqrt((ms ?? 0) / slowest) : 0.5 + 0.5 * Math.sqrt(hits / most))
      ),
    });
  }

  for (const lane of lanes) {
    for (const bar of lane.bars) {
      const commit = rec.commits.list[bar.lead];
      const of = commit.ms !== undefined ? ` of ${commit.ms}ms` : '';
      const own = bar.ms !== undefined ? ` · ${lane.label} ${+bar.ms.toFixed(2)}ms${of}` : '';
      bar.title = `${(commit.atMs / 1000).toFixed(2)}s · ${commit.renders} renders${own}${bar.ids.length > 1 ? ` · ${bar.ids.length} commits` : ''}`;
    }
  }

  // An action runs until the last commit it is answerable for: the bar is how long its consequences went on.
  const actions = rec.actions.map((action) => {
    const last = (action.commitIds ?? []).reduce((end, i) => Math.max(end, rec.commits.list[i]?.atMs ?? 0), action.endMs);
    return { x: px(action.atMs * scale), w: Math.max(3, px((last - action.atMs) * scale)), action };
  });

  const step = TICK_STEPS.find((ms) => ms * scale >= 70) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: Array<{ x: number; label: string }> = [];
  for (let t = 0; t <= duration; t += step) {
    ticks.push({ x: px(t * scale), label: step < 1000 ? `${Math.round(t)}ms` : `${+(t / 1000).toFixed(1)}s` });
  }
  return { lanes, actions, ticks, width, scale, hidden };
}

/** A cause as a chip in the colour its commits are drawn in, so the detail reads against the tracks. */
const CauseChip = ({ id, keys }: { id: number; keys: Map<number, string> }) => {
  const key = keys.get(id);
  return key ? (
    <span class="cause-chip">
      <i class="swatch" style={`background:${colourOf(key)}`} />
      {key}
    </span>
  ) : null;
};

function CommitDetail({ rec, commit, more }: { rec: RecordingV2; commit: CommitRecord; more: number }): JSX.Element {
  const reasons = reasonsById(rec.reasons);
  const roots = [...rec.roots, ...rec.outsideRoots];
  const causes = new Map(rec.causes.map((c) => [c.i, c.key]));
  return (
    <div class="tl-detail">
      <div class="tl-head">
        <b>{`${(commit.atMs / 1000).toFixed(2)}s`}</b>
        <span class="badge" data-tone="count">{`${commit.renders} renders`}</span>
        {commit.noDom ? (
          <span
            class="badge"
            data-tone="warn"
            title="Renders after which nothing in the DOM of that component changed"
          >{`${commit.noDom} wasted`}</span>
        ) : null}
        {commit.mounts ? <span class="badge">{`${commit.mounts} mounts`}</span> : null}
        {commit.ms ? <span class="badge">{`${commit.ms}ms`}</span> : null}
        {commit.lane ? <span class="badge">{commit.lane}</span> : null}
        {commit.event ? <span class="badge">{commit.event}</span> : null}
        {more ? <span class="muted">{`+${more} more here`}</span> : null}
      </div>
      {commit.causeIds?.length ? (
        <div class="tl-row">
          <span class="tl-row-label">causes</span>
          <span class="chips">
            {commit.causeIds.map((id) => (
              <CauseChip key={id} id={id} keys={causes} />
            ))}
          </span>
        </div>
      ) : null}
      {(commit.roots ?? []).slice(0, 6).map((entry) => {
        const root = roots[entry.i];
        if (!root) return null;
        const reason = reasons.get(entry.reasonIds[0]);
        return (
          <ReasonLine
            key={`${commit.i}-${entry.i}`}
            who={`${root.name}${entry.hits > 1 ? ` ×${entry.hits}` : ''}`}
            entry={{ id: entry.reasonIds[0], reason, hook: reason ? hookOf(root, reason) : undefined }}
          />
        );
      })}
      <Cascade rec={rec} commit={commit} />
    </div>
  );
}

/** Whom the roots rendered in turn, and with which props: the commit's cascade as a tree, busiest branch first. */
function Cascade({ rec, commit }: { rec: RecordingV2; commit: CommitRecord }): JSX.Element | null {
  const tree = useMemo(() => cascadeOf(rec, commit), [rec, commit]);
  // Roots alone are the rows above already.
  if (!tree.some((node) => node.children.length)) return null;
  const flame = <Flame tree={tree} />;
  const rows: JSX.Element[] = [];
  const walk = (list: CascadeNode[], depth: number) => {
    for (const node of list) {
      rows.push(
        <li
          key={rows.length}
          class="cascade-row"
          data-rpr="cascade-row"
          data-equal={node.step.equal ? 'true' : undefined}
          style={`padding-left:${depth * 14}px`}
        >
          {depth ? <span class="cascade-arrow">↳</span> : null}
          {/* The count before the name: after it, "props equal ×4" would read as part of the reason. */}
          {node.n > 1 ? <span class="cascade-n">{`${node.n}×`}</span> : null}
          <StepView step={node.step} />
        </li>
      );
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return (
    <>
      {flame}
      <div class="tl-row cascade">
        <span class="tl-row-label">cascade</span>
        <ol class="cascade-tree" data-rpr="cascade">
          {rows}
        </ol>
      </div>
    </>
  );
}

/** An action and everything it set off: where it landed, what it cost, and the commits it is answerable for. */
function ActionDetail({ rec, action, onCommit }: { rec: RecordingV2; action: ActionRecord; onCommit: (i: number) => void }): JSX.Element {
  const reasons = reasonsById(rec.reasons);
  const roots = [...rec.roots, ...rec.outsideRoots];
  const segment = rec.segments.find((s) => s.action === action.id);
  const commits = (action.commitIds ?? []).map((i) => rec.commits.list[i]).filter(Boolean);
  const renders = commits.reduce((sum, c) => sum + c.renders, 0);
  const target = action.target;
  const where = [target?.selector, target?.nth !== undefined ? `#${target.nth}` : '', target?.source].filter(Boolean).join(' · ');
  return (
    <div class="tl-detail">
      <div class="tl-head">
        {`${(action.atMs / 1000).toFixed(2)}s · `}
        <b>{actionText(action)}</b>
        {` — ${commits.length} commits · ${renders} renders${segment?.latency ? ` · ${segment.latency.duration}ms to paint` : ''}${
          segment?.perChar ? ` · ${segment.perChar.renders} renders/char` : ''
        }`}
      </div>
      {where ? <div class="tl-causes">{where}</div> : null}
      {commits.slice(0, 5).map((commit) => {
        const lead = commit.roots?.[0];
        const root = lead ? roots[lead.i] : undefined;
        const reason = lead ? reasons.get(lead.reasonIds[0]) : undefined;
        return (
          <div class="tl-root" key={commit.i}>
            <button type="button" class="tl-link" onClick={() => onCommit(commit.i)}>
              {`${(commit.atMs / 1000).toFixed(2)}s`}
            </button>
            <span class="badge" data-tone="count">{`${commit.renders} renders`}</span>
            {commit.noDom ? (
              <span
                class="badge"
                data-tone="warn"
                title="Renders after which nothing in the DOM of that component changed"
              >{`${commit.noDom} wasted`}</span>
            ) : null}
            {root && lead ? (
              <ReasonLine
                who={`${root.name}${lead.hits > 1 ? ` ×${lead.hits}` : ''}`}
                entry={{ id: lead.reasonIds[0], reason, hook: reason ? hookOf(root, reason) : undefined }}
              />
            ) : null}
          </div>
        );
      })}
      {commits.length > 5 ? <div class="muted">{`+ ${commits.length - 5} more commits`}</div> : null}
      {!commits.length ? <div class="muted">rendered nothing</div> : null}
    </div>
  );
}

/** What is in the part of the recording being looked at, while nothing in particular is picked. */
function WindowDetail({ rec, window: shown }: { rec: RecordingV2; window: { from: number; to: number } }): JSX.Element {
  const roots = [...rec.roots, ...rec.outsideRoots];
  const causes = new Map(rec.causes.map((c) => [c.i, c.key]));
  const inside = rec.commits.list.filter((c) => c.atMs >= shown.from && c.atMs <= shown.to);
  const renders = inside.reduce((sum, c) => sum + c.renders, 0);
  const noDom = inside.reduce((sum, c) => sum + (c.noDom ?? 0), 0);
  const byRoot = new Map<number, number>();
  const byCause = new Map<string, number>();
  for (const commit of inside) {
    for (const entry of commit.roots ?? []) byRoot.set(entry.i, (byRoot.get(entry.i) ?? 0) + entry.hits);
    for (const id of commit.causeIds ?? []) {
      const key = causes.get(id);
      if (key) byCause.set(key, (byCause.get(key) ?? 0) + 1);
    }
  }
  const top = <T,>(map: Map<T, number>) => [...map].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div class="tl-detail">
      <div class="tl-head">
        <b>{`${(shown.from / 1000).toFixed(2)}–${(shown.to / 1000).toFixed(2)}s`}</b>
        <span class="badge">{`${inside.length} commits`}</span>
        <span class="badge" data-tone="count">{`${renders} renders`}</span>
        {noDom ? (
          <span class="badge" data-tone="warn" title="Renders after which nothing in the DOM of that component changed">{`${noDom} wasted`}</span>
        ) : null}
      </div>
      {byRoot.size ? (
        <div class="tl-row">
          <span class="tl-row-label">roots</span>
          <span class="chips">
            {top(byRoot).map(([i, n]) => (
              <span class="root-chip" key={i}>
                <span class="who">{roots[i]?.name ?? '?'}</span>
                <span class="n">{`×${n}`}</span>
              </span>
            ))}
          </span>
        </div>
      ) : null}
      {byCause.size ? (
        <div class="tl-row">
          <span class="tl-row-label">causes</span>
          <span class="chips">
            {top(byCause).map(([key, n]) => (
              <span class="cause-chip" key={key}>
                <i class="swatch" style={`background:${colourOf(key)}`} />
                {key}
                <span class="n">{`×${n}`}</span>
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** A run of layout shifts: what moved from where to where, what moved it, and the commit to open for more. */
function ShiftDetail({ rec, run, onCommit }: { rec: RecordingV2; run: ShiftRun; onCommit: (i: number) => void }): JSX.Element {
  const cause = run.first.cause;
  const since = run.first.sinceInputMs;
  const commit = 'commit' in cause ? cause.commit : null;
  return (
    <div class="tl-detail" data-rpr="shift-detail">
      <div class="tl-head">
        <b>{runWhen(run)}</b>
        <span class="badge" data-tone={run.excluded < run.count ? 'warn' : undefined}>{`shift ${runValue(run.value)}`}</span>
        <CountedBadge run={run} />
        {since !== undefined && since < 5000 ? <span class="muted">{`${since}ms after the last input`}</span> : null}
      </div>
      {runMoves(run).map((m, i) => (
        <div class="tl-row" key={i}>
          <span class="tl-row-label">moved</span>
          <span>{`${nodeText(m)} ${moveOf(m.from, m.to)}`}</span>
        </div>
      ))}
      <div class="tl-row">
        <span class="tl-row-label">by</span>
        <span>
          {causeText(cause, commitCausesOf(rec), run.count, run.first.sources[0])}
          {commit !== null && rec.commits.list[commit] ? (
            <button type="button" class="tl-link" data-rpr="shift-commit" onClick={() => onCommit(commit)}>
              open the commit
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** The largest paint: its element, its phases, and what put it on the page, with the commit to open for more. */
function LcpDetail({ rec, onCommit }: { rec: RecordingV2; onCommit: (i: number) => void }): JSX.Element | null {
  const lcp = rec.lcp;
  if (!lcp) return null;
  const mount = lcp.mount;
  const commit = mount && 'commit' in mount ? mount.commit : null;
  return (
    <div class="tl-detail" data-rpr="lcp-detail">
      <div class="tl-head">
        <b title={`${secs(lcp.atMs)} into the recording`}>{`LCP ${secs(lcp.ms)}`}</b>
        <span>{lcpWho(lcp)}</span>
      </div>
      <div class="tl-row">
        <span class="tl-row-label">phases</span>
        <span>{phasesText(lcp.phases)}</span>
      </div>
      {mount ? (
        <div class="tl-row">
          <span class="tl-row-label">mount</span>
          <span>
            {mountText(mount, commitCausesOf(rec))}
            {commit !== null && rec.commits.list[commit] ? (
              <button type="button" class="tl-link" data-rpr="lcp-commit" onClick={() => onCommit(commit)}>
                open the commit
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The whole recording in one row, whatever the zoom: the density of commits, and a box around the part the tracks
 * are showing. Dragging across it picks a range to look at, the way the overview of a profiler does.
 */
function Overview({
  rec,
  window: shown,
  onRange,
  onReset,
}: {
  rec: RecordingV2;
  window: { from: number; to: number };
  onRange: (fromMs: number, toMs: number) => void;
  onReset: () => void;
}): JSX.Element {
  const duration = Math.max(1, rec.durationMs);
  const strip = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  // What the handlers read: the state is for drawing and lags a quick tap by a render.
  const held = useRef<{ from: number; to: number; id: number } | null>(null);
  const columns = useMemo(() => {
    // A column per percent of the recording, as tall as the renders in it: the shape of the session in 100 bars.
    const buckets = new Array(100).fill(0);
    for (const commit of rec.commits.list) buckets[Math.min(99, Math.floor((commit.atMs / duration) * 100))] += commit.renders;
    const peak = Math.max(1, ...buckets);
    return buckets.map((renders, i) => ({ i, h: renders ? Math.max(2, Math.round(12 * Math.sqrt(renders / peak))) : 0 }));
  }, [rec, duration]);
  const fractionAt = (clientX: number) => {
    const box = strip.current?.getBoundingClientRect();
    if (!box || !box.width) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  };
  const box = drag ?? { from: shown.from / duration, to: shown.to / duration };
  return (
    <div
      class="tl-overview"
      ref={strip}
      data-rpr="tl-overview"
      title="Drag to look at a part of the recording; double-click for the whole of it"
      onDblClick={onReset}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const at = fractionAt(e.clientX);
        held.current = { from: at, to: at, id: e.pointerId };
        setDrag({ from: at, to: at });
      }}
      onPointerMove={(e) => {
        const now = held.current;
        if (!now || now.id !== e.pointerId) return;
        now.to = fractionAt(e.clientX);
        setDrag({ from: now.from, to: now.to });
      }}
      onPointerUp={(e) => {
        const now = held.current;
        if (!now || now.id !== e.pointerId) return;
        held.current = null;
        setDrag(null);
        const at = fractionAt(e.clientX);
        const from = Math.min(now.from, at) * duration;
        const to = Math.max(now.from, at) * duration;
        // A click rather than a drag: centre there instead of zooming into nothing.
        onRange(from, to - from < duration / 200 ? from : to);
      }}
      onPointerCancel={() => {
        held.current = null;
        setDrag(null);
      }}
    >
      {columns.map((c) => (
        <span key={c.i} class="tl-over-bar" style={`left:${c.i}%;height:${c.h}px`} />
      ))}
      <span class="tl-brush" style={`left:${Math.min(box.from, box.to) * 100}%;width:${Math.max(0.5, Math.abs(box.to - box.from) * 100)}%`} />
    </div>
  );
}

/**
 * The recording in time: the actions, every commit, and a lane per cascade root. A bar is a commit — its width how
 * long React took, its height how much rendered, its colour what woke it.
 */
export function Timeline({
  rec,
  litCause = null,
  onReset,
  onOutline,
  runs = [],
  pickedRun = null,
  onPickRun,
  runOutlined = null,
  lcpPicked = false,
  onPickLcp,
  lcpFound = null,
}: {
  rec: RecordingV2;
  litCause?: number | null;
  /** The report's own part of "show all": the cause lit in the legend above the tracks. */
  onReset?: () => void;
  /** Outlines on the page the roots of what is picked, or nothing with null; answers how many it found there. */
  onOutline?: (entries: Array<{ i: number; hits: number }> | null) => number;
  /** Runs of layout shifts: a lane of their own, picked here or in their section of the report. */
  runs?: ShiftRun[];
  pickedRun?: number | null;
  onPickRun?: (i: number | null) => void;
  /** What of the picked run is on the page now. */
  runOutlined?: ShiftFound | null;
  /** The largest paint, marked on the tracks and picked here or in its section. */
  lcpPicked?: boolean;
  onPickLcp?: (on: boolean) => void;
  lcpFound?: boolean | null;
}): JSX.Element | null {
  const [picked, setPicked] = useState<number | null>(null);
  const [pickedAction, setPickedAction] = useState<number | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  // Only what is on screen is drawn: zoomed in, a long recording is tens of thousands of pixels wide.
  const [view, setView] = useState({ from: 0, to: STRIP_PX });
  const pending = useRef(false);
  const measure = () => {
    const el = scroll.current;
    if (el) setView({ from: el.scrollLeft, to: el.scrollLeft + el.clientWidth });
  };
  const onScroll = () => {
    if (pending.current) return;
    pending.current = true;
    requestAnimationFrame(() => {
      pending.current = false;
      measure();
    });
  };
  // Dragging the tracks moves them sideways; a drag that moved is not a click on the bar it started from.
  // A finger decides its axis once: sideways moves the tracks, up and down scrolls the panel they are in.
  const drag = useRef<{ x: number; y: number; left: number; top: number; axis: 'x' | 'y' | null; on: HTMLElement } | null>(null);
  const panned = useRef(false);
  // Two fingers zoom: the moment under their middle stays under it, so moving them together also pans.
  const fingers = useRef(new Map<number, number>());
  const pinch = useRef<{ spread: number; zoom: number; heldMs: number } | null>(null);
  // Where the tracks scroll once a zoom is drawn: set before paint, or the old scroll shows at the new zoom for a frame.
  const scrollTo = useRef<number | null>(null);
  // The browser scrolls by whole pixels: the rest of a zoom's scroll is a shift of the strip, or it trembles by it.
  const nudge = useRef(0);
  const setNudge = (px: number) => {
    nudge.current = px;
    const strip = scroll.current?.firstElementChild as HTMLElement | null;
    if (strip) strip.style.transform = px ? `translateX(${px}px)` : '';
  };
  const spreadOf = () => {
    const [a, b] = [...fingers.current.values()];
    return { spread: Math.max(20, Math.abs(a - b)), middle: (a + b) / 2 - (scroll.current?.getBoundingClientRect().left ?? 0) };
  };
  // A finger lifted over something that a zoom re-rendered away never tells the tracks: the window hears it.
  useEffect(() => {
    const lift = (event: PointerEvent) => {
      if (fingers.current.delete(event.pointerId) && fingers.current.size < 2) pinch.current = null;
    };
    window.addEventListener('pointerup', lift, true);
    window.addEventListener('pointercancel', lift, true);
    return () => {
      window.removeEventListener('pointerup', lift, true);
      window.removeEventListener('pointercancel', lift, true);
    };
  }, []);
  const onPointerDown = (event: PointerEvent) => {
    const el = scroll.current;
    if (!el) return;
    if (event.pointerType === 'touch') {
      // The first finger of a gesture: whatever an earlier one left behind is gone.
      if (event.isPrimary) {
        fingers.current.clear();
        pinch.current = null;
      }
      fingers.current.set(event.pointerId, event.clientX);
    }
    if (fingers.current.size === 2) {
      event.preventDefault();
      if (drag.current?.axis) drag.current.on.releasePointerCapture?.(event.pointerId);
      drag.current = null;
      // A pinch is not a tap on the bar under either finger.
      panned.current = true;
      const { spread, middle } = spreadOf();
      pinch.current = { spread, zoom, heldMs: (el.scrollLeft + middle) / scale };
      return;
    }
    // No selection may start here: with the pointer held down over the page, the browser would otherwise select it.
    event.preventDefault();
    panned.current = false;
    const panel = el.closest('.card');
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: el.scrollLeft,
      top: panel?.scrollTop ?? 0,
      // A mouse only drags sideways: the wheel is its way up and down.
      axis: null,
      on: event.currentTarget as HTMLElement,
    };
    if (event.pointerType === 'mouse') drag.current.y = Number.NaN;
  };
  const onPointerMove = (event: PointerEvent) => {
    const el = scroll.current;
    if (fingers.current.has(event.pointerId)) fingers.current.set(event.pointerId, event.clientX);
    const pinched = pinch.current;
    if (el && pinched && fingers.current.size === 2) {
      // From where the pinch began, not step by step: the scale of the last render lags the fingers.
      const { spread, middle } = spreadOf();
      const next = clampZoom(pinched.zoom * (spread / pinched.spread) ** PINCH_SPEED);
      const left = pinched.heldMs * baseScale(rec.durationMs, fitPx) * next - middle;
      // At a zoom limit nothing renders again, so the fingers' slide is scrolled here.
      if (next === zoom) el.scrollLeft = Math.max(0, left);
      else {
        scrollTo.current = left;
        setZoom(next);
      }
      return;
    }
    const held = drag.current;
    if (!el || !held) return;
    const dx = event.clientX - held.x;
    const dy = Number.isNaN(held.y) ? 0 : event.clientY - held.y;
    if (!held.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 3) {
      held.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      panned.current = true;
      // Captured only once the drag is real: a captured pointer sends the click to the tracks instead of the bar.
      held.on.setPointerCapture?.(event.pointerId);
    }
    if (held.axis === 'x') el.scrollLeft = held.left - dx;
    // The tracks take every touch (touch-action: none), so the panel's own scroll is done here.
    const panel = held.axis === 'y' ? el.closest('.card') : null;
    if (panel) panel.scrollTop = held.top - dy;
    // The pointer is down over the page as well; without this it leaves a selection behind it.
    if (held.axis) document.getSelection()?.removeAllRanges();
  };
  const endPan = (event: PointerEvent) => {
    fingers.current.delete(event.pointerId);
    if (fingers.current.size < 2) pinch.current = null;
    if (drag.current?.axis) drag.current.on.releasePointerCapture?.(event.pointerId);
    drag.current = null;
  };
  useEffect(() => onScroll(), []);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el || scrollTo.current === null) return;
    const want = Math.max(0, scrollTo.current);
    el.scrollLeft = want;
    scrollTo.current = null;
    const rest = el.scrollLeft - want;
    // More than a pixel off is the end of the strip holding the scroll back, not rounding.
    setNudge(Math.abs(rest) < 1 ? rest : 0);
    measure();
  }, [zoom]);
  // Fit means the width the tracks have on the screen, which a wider panel makes wider.
  const [fitPx, setFitPx] = useState(STRIP_PX);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = el.clientWidth - 8;
      if (width > 100) setFitPx((was) => (Math.abs(was - width) > 2 ? width : was));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Fit shows the whole recording, however long; the deepest zoom stays as close as for a short one.
  const maxZoom = Math.max(MAX_ZOOM, DEEPEST_PX_PER_MS / baseScale(rec.durationMs, fitPx));
  const clampZoom = (next: number) => Math.min(maxZoom, Math.max(MIN_ZOOM, next));
  const causeKeys = useMemo(() => new Map(rec.causes.map((c) => [c.i, c.key])), [rec]);
  const { lanes, actions, ticks, width, scale, hidden } = useMemo(
    () => layout(rec, causeKeys, zoom, onlyChanged, fitPx),
    [rec, causeKeys, zoom, onlyChanged, fitPx]
  );
  // What is picked, outlined on the page as it is now: a commit's roots, or those of all an action's commits.
  const [outlined, setOutlined] = useState<number | null>(null);
  useEffect(() => {
    if (!onOutline) return;
    const commit = picked === null ? null : rec.commits.list[picked];
    const action = pickedAction === null ? null : rec.actions.find((a) => a.id === pickedAction) ?? null;
    let entries: Array<{ i: number; hits: number }> | null = null;
    if (commit) entries = (commit.roots ?? []).map(({ i, hits }) => ({ i, hits }));
    else if (action) {
      const hits = new Map<number, number>();
      const ids = new Set(action.commitIds ?? []);
      for (const c of rec.commits.list) if (ids.has(c.i)) for (const r of c.roots ?? []) hits.set(r.i, (hits.get(r.i) ?? 0) + r.hits);
      entries = [...hits].map(([i, n]) => ({ i, hits: n }));
    }
    setOutlined(entries?.length ? onOutline(entries) : (onOutline(null), null));
  }, [picked, pickedAction]);
  useEffect(() => () => void onOutline?.(null), []);
  // One thing is picked at a time: a shift picked in its section takes the place of a commit picked here.
  useEffect(() => {
    if (pickedRun === null && !lcpPicked) return;
    setPicked(null);
    setPickedAction(null);
  }, [pickedRun, lcpPicked]);
  const shiftMarks = useMemo(() => {
    const peak = runs.reduce((most, run) => Math.max(most, run.value), 0.001);
    return runs.map((run, i) => ({
      i,
      run,
      x: px(run.atMs * scale),
      w: Math.max(3, px((run.endMs - run.atMs) * scale)),
      h: Math.max(4, Math.round(SHIFTS_LANE_H * Math.sqrt(run.value / peak))),
      tone: run.excluded < run.count ? 'counted' : run.shifts.some((s) => nearMissOf(s, run.count === 1)) ? 'near' : 'excluded',
    }));
  }, [runs, scale]);
  if (!rec.commits.list.length) return null;
  // Painted before the recording began, it has no place on its tracks.
  const lcpX = rec.lcp && rec.lcp.atMs >= 0 && rec.lcp.atMs <= rec.durationMs ? px(rec.lcp.atMs * scale) : null;
  /**
   * Zooming holds one moment still: the one under the pointer when the wheel turns, the middle of the view when a
   * button is pressed. Without that, every step throws away the place being looked at.
   */
  const zoomTo = (next: number, anchorPx?: number) => {
    const el = scroll.current;
    const zoomed = clampZoom(next);
    const hold = anchorPx ?? (el ? el.clientWidth / 2 : 0);
    const heldMs = el ? (el.scrollLeft + hold) / scale : 0;
    scrollTo.current = heldMs * baseScale(rec.durationMs, fitPx) * zoomed - hold;
    setZoom(zoomed);
  };
  /** The wheel zooms, as it does in a profiler; a sideways wheel is left to the browser as a scroll. */
  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    const el = scroll.current;
    const at = el ? event.clientX - el.getBoundingClientRect().left : undefined;
    zoomTo(zoom * Math.exp(-event.deltaY * 0.002), at);
  };
  const commit = picked === null ? null : rec.commits.list[picked];
  const action = pickedAction === null ? null : rec.actions.find((a) => a.id === pickedAction) ?? null;
  const run = pickedRun === null ? undefined : runs[pickedRun];
  const pickedMark = pickedRun === null ? undefined : shiftMarks[pickedRun];
  // What is lit up: the commits of the action picked, or else the commits of the cause picked in the legend.
  const causeLit = litCause === null ? null : new Set(rec.commits.list.filter((c) => c.causeIds?.includes(litCause)).map((c) => c.i));
  const lit = action ? new Set(action.commitIds ?? []) : causeLit ?? new Set<number>();
  const lighting = Boolean(action) || causeLit !== null;
  const windowMs = { from: view.from / scale, to: view.to / scale };
  /** What the overview asks for: a range of the recording to fill the tracks with. */
  const lookAt = (fromMs: number, toMs: number) => {
    const el = scroll.current;
    if (!el) return;
    const span = Math.max(1, toMs - fromMs);
    const wanted = toMs > fromMs ? el.clientWidth / (baseScale(rec.durationMs, fitPx) * span) : zoom;
    const zoomed = clampZoom(wanted);
    // Its own scroll comes after the render; one a pinch or the wheel left unused would jump there first.
    scrollTo.current = null;
    setZoom(zoomed);
    requestAnimationFrame(() => {
      const after = scroll.current;
      if (!after) return;
      const next = baseScale(rec.durationMs, fitPx) * zoomed;
      after.scrollLeft = Math.max(0, toMs > fromMs ? fromMs * next : fromMs * next - after.clientWidth / 2);
      setNudge(0);
      measure();
    });
  };
  const pickedBar = picked === null ? undefined : lanes[0].bars.find((b) => b.ids.includes(picked));
  const inBar = pickedBar?.ids.length ?? 1;
  const onView = (x: number, w = 0) => x + w >= view.from - VIEW_MARGIN_PX && x <= view.to + VIEW_MARGIN_PX;
  /** Back to the whole recording with nothing picked: what the tracks showed when the report opened. */
  const narrowed = zoom > MIN_ZOOM || picked !== null || pickedAction !== null || litCause !== null || pickedRun !== null || lcpPicked;
  const showAll = () => {
    scrollTo.current = null;
    setZoom(MIN_ZOOM);
    setPicked(null);
    setPickedAction(null);
    onPickRun?.(null);
    onPickLcp?.(false);
    onReset?.();
    requestAnimationFrame(() => {
      const el = scroll.current;
      if (!el) return;
      el.scrollLeft = 0;
      setNudge(0);
      measure();
    });
  };
  const pickCommit = (i: number) => {
    onPickRun?.(null);
    onPickLcp?.(false);
    setPicked(i);
    const owner = rec.commits.list[i]?.actionId;
    setPickedAction(owner !== undefined ? owner : null);
  };
  return (
    <div class="timeline">
      <div class="row tl-controls">
        <button data-rpr="tl-out" disabled={zoom <= MIN_ZOOM} title="Zoom out" onClick={() => zoomTo(zoom / 2)}>
          −
        </button>
        <button data-rpr="tl-in" disabled={zoom >= maxZoom} title="Zoom in (or turn the wheel over the tracks)" onClick={() => zoomTo(zoom * 2)}>
          +
        </button>
        <span class="muted">{zoom <= MIN_ZOOM ? 'fit' : `×${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}`}</span>
        <button
          type="button"
          data-rpr="tl-reset"
          hidden={!narrowed}
          title="Back to the whole recording, with nothing picked (or double-click the overview)"
          onClick={showAll}
        >
          Show all
        </button>
        {/* The count grows to the left of the box, so ticking it never moves the box out from under the pointer. */}
        <span class="tl-right">
          {hidden ? <span class="muted">{`${hidden} hidden`}</span> : null}
          <label class="toggle" title="Hide the commits that rendered without changing anything on the screen">
            <input
              type="checkbox"
              data-rpr="tl-changed"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged((e.target as HTMLInputElement).checked)}
            />
            changed the DOM
          </label>
        </span>
      </div>
      <Overview rec={rec} window={windowMs} onRange={lookAt} onReset={showAll} />
      <div class="tl-tracks">
        <div class="tl-labels">
          <div class="tl-label" style="height:14px">
            Actions
          </div>
          {runs.length ? (
            <div
              class="tl-label"
              style={`height:${SHIFTS_LANE_H}px`}
              title="Layout shifts: red counted, amber near misses, grey left out after an input"
            >
              <span class="tl-name">Shifts</span>
              <span class="muted">{rec.shifts ? shiftValue(rec.shifts.cls.value) : ''}</span>
            </div>
          ) : null}
          {lanes.map((lane) => (
            <div class="tl-label" key={lane.key} style={`height:${lane.height}px`} title={lane.label}>
              <span class="tl-name">{lane.label}</span>
              <span class="muted">{lane.note}</span>
            </div>
          ))}
        </div>
        <div
          class="tl-scroll"
          ref={scroll}
          onScroll={onScroll}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <div
            class="tl-strip"
            data-lit={lighting ? 'true' : undefined}
            style={`width:${width}px${nudge.current ? `;transform:translateX(${nudge.current}px)` : ''}`}
          >
            {ticks
              .filter((t) => onView(t.x))
              .map((t) => (
                <span key={`grid-${t.label}`} class="tl-grid" style={`left:${t.x}px`} />
              ))}
            {commit ? (
              <>
                {/* The picked commit is a column: a band down every lane it rendered in, the way a profiler marks a
                    frame, instead of a frame drawn round the few pixels of each bar. */}
                <span
                  class="tl-band"
                  style={`left:${(pickedBar?.x ?? commit.atMs * scale) + (pickedBar?.w ?? 0) / 2}px;width:${Math.max(8, (pickedBar?.w ?? 2) + 6)}px`}
                />
                {/* Through the middle of the bar it belongs to, not the exact millisecond: the bar is a few pixels wide. */}
                <span class="tl-cursor" style={`left:${(pickedBar?.x ?? commit.atMs * scale) + (pickedBar?.w ?? 0) / 2}px`} />
              </>
            ) : null}
            {run && pickedMark ? (
              <span class="tl-band" style={`left:${pickedMark.x + pickedMark.w / 2}px;width:${Math.max(8, pickedMark.w + 6)}px`} />
            ) : null}
            {lcpX !== null ? <span class="tl-lcp" data-picked={lcpPicked ? 'true' : undefined} style={`left:${lcpX}px`} /> : null}
            <div class="tl-lane tl-actions" style="height:14px">
              {actions
                .filter(({ x, w }) => onView(x, w))
                .map(({ x, w, action: a }) => (
                  <button
                    key={a.id}
                    class="tl-mark"
                    data-picked={pickedAction === a.id ? 'true' : undefined}
                    style={`left:${x}px;width:${w}px`}
                    title={actionText(a)}
                    onClick={() => {
                      if (panned.current) return;
                      onPickRun?.(null);
                      onPickLcp?.(false);
                      setPickedAction(a.id);
                      setPicked(null);
                    }}
                  />
                ))}
              {lcpX !== null && rec.lcp ? (
                <button
                  type="button"
                  class="tl-lcp-tag"
                  data-rpr="tl-lcp"
                  data-picked={lcpPicked ? 'true' : undefined}
                  style={`left:${lcpX}px`}
                  title={`Largest paint, LCP ${secs(rec.lcp.ms)}: ${lcpWho(rec.lcp)}`}
                  onClick={() => !panned.current && onPickLcp?.(!lcpPicked)}
                >
                  LCP
                </button>
              ) : null}
            </div>
            {runs.length ? (
              <div class="tl-lane tl-shifts" data-rpr="tl-shifts" style={`height:${SHIFTS_LANE_H}px`}>
                {shiftMarks
                  .filter(({ x, w }) => onView(x, w))
                  .map((m) => (
                    <button
                      key={m.i}
                      class="tl-shift"
                      data-rpr="tl-shift"
                      data-tone={m.tone}
                      data-picked={pickedRun === m.i ? 'true' : undefined}
                      style={`left:${m.x}px;width:${m.w}px;height:${m.h}px`}
                      title={`${runValue(m.run.value)} · ${m.run.first.sources[0] ? nodeText(m.run.first.sources[0]) : 'an element'} ${moveText(
                        m.run
                      )}`}
                      onClick={() => !panned.current && onPickRun?.(pickedRun === m.i ? null : m.i)}
                    />
                  ))}
              </div>
            ) : null}
            {lanes.map((lane) => (
              <div class="tl-lane" key={lane.key} style={`height:${lane.height}px`}>
                {lane.bars
                  .filter((bar) => onView(bar.x, bar.w))
                  // The wide ones first, so the short commits inside a long one's span sit on top of it and take clicks.
                  .sort((a, b) => b.w - a.w)
                  .map((bar) => (
                    <button
                      // The first commit of the column, not its x: keyed by x, every bar is made anew on each step of a zoom.
                      key={bar.ids[0]}
                      class="tl-bar"
                      data-picked={picked !== null && bar.ids.includes(picked) ? 'true' : undefined}
                      data-lit={lighting && bar.ids.some((i) => lit.has(i)) ? 'true' : undefined}
                      style={`left:${bar.x}px;width:${bar.w}px;height:${bar.h}px;--bar:${bar.colour};opacity:${bar.weight}`}
                      title={bar.title}
                      onClick={() => !panned.current && pickCommit(bar.lead)}
                    />
                  ))}
              </div>
            ))}
            <div class="tl-axis">
              {ticks
                .filter((t) => onView(t.x))
                .map((t) => (
                  <span key={t.label} class="tl-tick" data-first={t.x === 0 ? 'true' : undefined} style={`left:${t.x}px`}>
                    {t.label}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>
      {lcpPicked ? (
        lcpFound !== null ? (
          <LcpFound found={lcpFound} id="tl-lcp-outlined" />
        ) : null
      ) : run ? (
        runOutlined ? (
          <ShiftLegend run={run} found={runOutlined} id="tl-outlined" />
        ) : null
      ) : outlined !== null ? (
        <p class="tl-outlined" data-rpr="tl-outlined" data-found={outlined}>
          {outlined ? `◻ outlined on the page: ${outlined}` : 'not on the page now'}
        </p>
      ) : null}
      {lcpPicked ? (
        <LcpDetail rec={rec} onCommit={pickCommit} />
      ) : run ? (
        <ShiftDetail rec={rec} run={run} onCommit={pickCommit} />
      ) : commit ? (
        <CommitDetail rec={rec} commit={commit} more={inBar - 1} />
      ) : action ? (
        <ActionDetail rec={rec} action={action} onCommit={pickCommit} />
      ) : (
        <WindowDetail rec={rec} window={windowMs} />
      )}
    </div>
  );
}
