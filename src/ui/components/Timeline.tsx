/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ActionRecord, CommitRecord, RecordingV2 } from '../../shared/schema';
import { actionText, cascadeOf, hookOf, reasonsById, type CascadeNode } from '../../shared/summary';
import { Flame } from './Flame';
import { ReasonLine, StepView } from './Stats';

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

const MIN_PX_PER_MS = 0.06;
const STRIP_PX = 320;
const BUCKET_PX = 2;
/** The narrowest bar drawn: a quick commit still has to be seen, and its padding makes it easy to hit. */
const MIN_BAR_PX = 3;
const MIN_ZOOM = 1;
const MAX_ZOOM = 30;
/** A tick every ~70px, on a round number of milliseconds. */
const TICK_STEPS = [50, 100, 200, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000];
/** Lanes of the app's own roots, under the two that summarise everything. */
const ROOT_LANES = 8;
const COMMITS_LANE_H = 18;
const ROOT_LANE_H = 13;
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
const baseScale = (durationMs: number, fitPx = STRIP_PX) => Math.max(MIN_PX_PER_MS, fitPx / Math.max(1, durationMs));

/** A bar per column of pixels: several commits in one column become one bar that opens on the busiest of them. */
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
    const x = Math.round((Math.max(0, commit.atMs - (commit.ms ?? 0)) * scale) / BUCKET_PX) * BUCKET_PX;
    // As wide as React took, what this lane is about (a root's own render) before the whole commit.
    const w = Math.max(MIN_BAR_PX, Math.round((ms ?? commit.ms ?? 0) * scale));
    const bar = byColumn.get(x);
    if (!bar) {
      byColumn.set(x, {
        x,
        w,
        h: height(hits),
        weight: weight(hits, ms),
        top: hits,
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
    if (hits > bar.top) {
      bar.top = hits;
      bar.lead = commit.i;
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
      const own = bar.ms !== undefined ? ` · ${lane.label} ${+bar.ms.toFixed(2)}ms of ${commit.ms ?? '?'}ms` : '';
      bar.title = `${(commit.atMs / 1000).toFixed(2)}s · ${commit.renders} renders${own}${bar.ids.length > 1 ? ` · ${bar.ids.length} commits` : ''}`;
    }
  }

  // An action runs until the last commit it is answerable for: the bar is how long its consequences went on.
  const actions = rec.actions.map((action) => {
    const last = (action.commitIds ?? []).reduce((end, i) => Math.max(end, rec.commits.list[i]?.atMs ?? 0), action.endMs);
    return { x: Math.round(action.atMs * scale), w: Math.max(3, Math.round((last - action.atMs) * scale)), action };
  });

  const step = TICK_STEPS.find((ms) => ms * scale >= 70) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: Array<{ x: number; label: string }> = [];
  for (let t = 0; t <= duration; t += step) {
    ticks.push({ x: Math.round(t * scale), label: step < 1000 ? `${Math.round(t)}ms` : `${+(t / 1000).toFixed(1)}s` });
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
        setDrag({ from: at, to: at });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, to: fractionAt(e.clientX) })}
      onPointerUp={(e) => {
        if (!drag) return;
        const at = fractionAt(e.clientX);
        const from = Math.min(drag.from, at) * duration;
        const to = Math.max(drag.from, at) * duration;
        setDrag(null);
        // A click rather than a drag: centre there instead of zooming into nothing.
        onRange(from, to - from < duration / 200 ? from : to);
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
}: {
  rec: RecordingV2;
  litCause?: number | null;
  /** The report's own part of "show all": the cause lit in the legend above the tracks. */
  onReset?: () => void;
  /** Outlines on the page the roots of what is picked, or nothing with null; answers how many it found there. */
  onOutline?: (entries: Array<{ i: number; hits: number }> | null) => number;
}): JSX.Element | null {
  const [picked, setPicked] = useState<number | null>(null);
  const [pickedAction, setPickedAction] = useState<number | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  // Only what is on screen is drawn: zoomed in, a long recording is tens of thousands of pixels wide.
  const [view, setView] = useState({ from: 0, to: STRIP_PX });
  const pending = useRef(false);
  const onScroll = () => {
    if (pending.current) return;
    pending.current = true;
    requestAnimationFrame(() => {
      pending.current = false;
      const el = scroll.current;
      if (el) setView({ from: el.scrollLeft, to: el.scrollLeft + el.clientWidth });
    });
  };
  // Dragging the tracks moves them sideways; a drag that moved is not a click on the bar it started from.
  const drag = useRef<{ x: number; left: number; moved: boolean; on: HTMLElement } | null>(null);
  const panned = useRef(false);
  const onPointerDown = (event: PointerEvent) => {
    const el = scroll.current;
    if (!el) return;
    // No selection may start here: with the pointer held down over the page, the browser would otherwise select it.
    event.preventDefault();
    panned.current = false;
    drag.current = { x: event.clientX, left: el.scrollLeft, moved: false, on: event.currentTarget as HTMLElement };
  };
  const onPointerMove = (event: PointerEvent) => {
    const el = scroll.current;
    const held = drag.current;
    if (!el || !held) return;
    const dx = event.clientX - held.x;
    if (!held.moved && Math.abs(dx) > 3) {
      held.moved = true;
      panned.current = true;
      // Captured only once the drag is real: a captured pointer sends the click to the tracks instead of the bar.
      held.on.setPointerCapture?.(event.pointerId);
    }
    if (held.moved) {
      el.scrollLeft = held.left - dx;
      // The pointer is down over the page as well; without this it leaves a selection behind it.
      document.getSelection()?.removeAllRanges();
    }
  };
  const endPan = (event: PointerEvent) => {
    if (drag.current?.moved) drag.current.on.releasePointerCapture?.(event.pointerId);
    drag.current = null;
  };
  useEffect(() => onScroll(), []);
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
  if (!rec.commits.list.length) return null;
  /**
   * Zooming holds one moment still: the one under the pointer when the wheel turns, the middle of the view when a
   * button is pressed. Without that, every step throws away the place being looked at.
   */
  const zoomTo = (next: number, anchorPx?: number) => {
    const el = scroll.current;
    const zoomed = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const hold = anchorPx ?? (el ? el.clientWidth / 2 : 0);
    const heldMs = el ? (el.scrollLeft + hold) / scale : 0;
    setZoom(zoomed);
    requestAnimationFrame(() => {
      const after = scroll.current;
      if (!after) return;
      after.scrollLeft = Math.max(0, heldMs * baseScale(rec.durationMs, fitPx) * zoomed - hold);
      onScroll();
    });
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
    const zoomed = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, wanted));
    setZoom(zoomed);
    requestAnimationFrame(() => {
      const after = scroll.current;
      if (!after) return;
      const next = baseScale(rec.durationMs, fitPx) * zoomed;
      after.scrollLeft = Math.max(0, toMs > fromMs ? fromMs * next : fromMs * next - after.clientWidth / 2);
      onScroll();
    });
  };
  const pickedBar = picked === null ? undefined : lanes[0].bars.find((b) => b.ids.includes(picked));
  const inBar = pickedBar?.ids.length ?? 1;
  const onView = (x: number, w = 0) => x + w >= view.from - VIEW_MARGIN_PX && x <= view.to + VIEW_MARGIN_PX;
  /** Back to the whole recording with nothing picked: what the tracks showed when the report opened. */
  const narrowed = zoom > MIN_ZOOM || picked !== null || pickedAction !== null || litCause !== null;
  const showAll = () => {
    setZoom(MIN_ZOOM);
    setPicked(null);
    setPickedAction(null);
    onReset?.();
    requestAnimationFrame(() => {
      const el = scroll.current;
      if (!el) return;
      el.scrollLeft = 0;
      onScroll();
    });
  };
  const pickCommit = (i: number) => {
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
        <button data-rpr="tl-in" disabled={zoom >= MAX_ZOOM} title="Zoom in (or turn the wheel over the tracks)" onClick={() => zoomTo(zoom * 2)}>
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
          <div class="tl-strip" data-lit={lighting ? 'true' : undefined} style={`width:${width}px`}>
            {ticks
              .filter((t) => onView(t.x))
              .map((t) => (
                <span key={`grid-${t.x}`} class="tl-grid" style={`left:${t.x}px`} />
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
                      setPickedAction(a.id);
                      setPicked(null);
                    }}
                  />
                ))}
            </div>
            {lanes.map((lane) => (
              <div class="tl-lane" key={lane.key} style={`height:${lane.height}px`}>
                {lane.bars
                  .filter((bar) => onView(bar.x, bar.w))
                  // The wide ones first, so the short commits inside a long one's span sit on top of it and take clicks.
                  .sort((a, b) => b.w - a.w)
                  .map((bar) => (
                    <button
                      key={bar.x}
                      class="tl-bar"
                      data-picked={picked !== null && bar.ids.includes(picked) ? 'true' : undefined}
                      data-lit={lighting && bar.ids.some((i) => lit.has(i)) ? 'true' : undefined}
                      // `background-color`, not the `background` shorthand: the shorthand would reset the clip that
                      // keeps the colour off the padding, and the padding is the part that catches the pointer.
                      style={`left:${bar.x}px;width:${bar.w}px;height:${bar.h}px;background-color:${bar.colour};opacity:${bar.weight}`}
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
                  <span key={t.x} class="tl-tick" data-first={t.x === 0 ? 'true' : undefined} style={`left:${t.x}px`}>
                    {t.label}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>
      {outlined !== null ? (
        <p class="tl-outlined" data-rpr="tl-outlined" data-found={outlined}>
          {outlined ? `◻ outlined on the page: ${outlined}` : 'not on the page now'}
        </p>
      ) : null}
      {commit ? (
        <CommitDetail rec={rec} commit={commit} more={inBar - 1} />
      ) : action ? (
        <ActionDetail rec={rec} action={action} onCommit={pickCommit} />
      ) : (
        <WindowDetail rec={rec} window={windowMs} />
      )}
    </div>
  );
}
