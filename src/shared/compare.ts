import type { ActionRecord, RecordingV2, RootStat } from './schema';
import { actionText } from './summary';

export interface Delta {
  before: number | null;
  after: number | null;
  delta: number | null;
  pct: number | null;
}

const delta = (before: number | null, after: number | null): Delta => ({
  before,
  after,
  delta: before === null || after === null ? null : +(after - before).toFixed(2),
  pct: before && after !== null ? Math.round(((after - before) / before) * 100) : null,
});

const rate = (n: number, ms: number) => (ms > 0 ? +((n * 1000) / ms).toFixed(2) : 0);

export interface CompareOptions {
  top?: number;
  match?: 'key' | 'name';
}

function rootMetrics(r: RootStat | undefined, ms: number) {
  if (!r) return null;
  return { hitsPerSec: rate(r.hits, ms), perHit: r.perHit, instances: r.instances, cascadePerSec: rate(r.cascade, ms) };
}

function compareRoots(a: RootStat[], b: RootStat[], msA: number, msB: number, match: 'key' | 'name', top: number) {
  const keyOf = (r: RootStat) => (match === 'name' ? `${r.name}|${r.source}` : r.key);
  const before = new Map(a.map((r) => [keyOf(r), r]));
  const after = new Map(b.map((r) => [keyOf(r), r]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys]
    .map((key) => {
      const x = rootMetrics(before.get(key), msA);
      const y = rootMetrics(after.get(key), msB);
      const r = (after.get(key) ?? before.get(key))!;
      return {
        root: r.name,
        source: r.source,
        path: r.path,
        status: !x ? 'new' : !y ? 'gone' : 'changed',
        hitsPerSec: delta(x?.hitsPerSec ?? null, y?.hitsPerSec ?? null),
        perHit: delta(x?.perHit ?? null, y?.perHit ?? null),
        instances: delta(x?.instances ?? null, y?.instances ?? null),
        cascadePerSec: delta(x?.cascadePerSec ?? 0, y?.cascadePerSec ?? 0),
      };
    })
    .sort((p, q) => Math.abs(q.cascadePerSec.delta ?? 0) - Math.abs(p.cascadePerSec.delta ?? 0))
    .slice(0, top);
}

/** What an action is, whichever time it was done: its kind, its element and the component it is in. */
const actionKey = (a: ActionRecord) =>
  `${a.kind}|${a.target?.component ?? ''}|${a.target?.testId ?? a.target?.name ?? a.target?.label ?? a.target?.text ?? a.target?.tag ?? ''}`;

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
};

/** The cost of one kind of action: renders per time it was done (per character for typing), and its latency. */
export interface ActionCost {
  key: string;
  what: string;
  /** The parts of `what`, for a view that sets them apart: `click`, `tab-people`, `Tab`. */
  kind: string;
  target: string;
  component?: string;
  /** How many times it was done. */
  n: number;
  per: 'action' | 'char';
  renders: number;
  latencyMs?: number;
}

/**
 * What a recording cost, in a form two recordings compare in however many times a button was pressed and however
 * long each one ran: the median of each action, and the renders nobody asked for per second. Small enough to keep
 * in the page's session storage until the next recording.
 */
export interface Digest {
  id?: string;
  createdAt: string;
  path: string;
  area: string | null;
  durationMs: number;
  /** Began with the page load: its mounts are in the renders per second, and a run that did not is not like it. */
  fromLoad?: boolean;
  actions: ActionCost[];
  /** Renders outside the reactions to actions: timers, sockets, stores, per second. */
  backgroundPerSec: number;
  wastedPerSec: number;
}

const pathOf = (url: string) => {
  try {
    return new URL(url || 'http://x').pathname;
  } catch {
    return url;
  }
};

export function digestOf(rec: RecordingV2 & { id?: string }): Digest {
  const actions = new Map(rec.actions.map((x) => [x.id, x]));
  const groups = new Map<
    string,
    { what: string; kind: string; target: string; component?: string; typing: boolean; renders: number[]; chars: number; latency: number[] }
  >();
  let reacted = 0;
  for (const s of rec.segments) {
    const action = actions.get(s.action);
    reacted += s.reaction.renders;
    if (!action) continue;
    const key = actionKey(action);
    const t = action.target;
    const group = groups.get(key) ?? {
      what: actionText({ ...action, value: undefined, chars: undefined }),
      kind: action.kind,
      target: t ? t.testId ?? t.name ?? t.label ?? t.text ?? t.tag : '',
      ...(t?.component ? { component: t.component } : {}),
      typing: action.kind === 'typing',
      renders: [],
      chars: 0,
      latency: [],
    };
    group.renders.push(s.reaction.renders);
    group.chars += action.chars ?? 0;
    if (s.latency) group.latency.push(s.latency.duration);
    groups.set(key, group);
  }
  const seconds = Math.max(rec.durationMs, 1) / 1000;
  return {
    ...(rec.id ? { id: rec.id } : {}),
    createdAt: rec.createdAt,
    path: pathOf(rec.page.url),
    area: rec.scope?.name ?? null,
    durationMs: rec.durationMs,
    ...(rec.tool?.source === 'load' ? { fromLoad: true } : {}),
    actions: [...groups].map(([key, g]) => ({
      key,
      what: g.typing ? g.what.replace(/^typing 0 chars/, 'typing') : g.what,
      kind: g.kind,
      target: g.target,
      ...(g.component ? { component: g.component } : {}),
      n: g.renders.length,
      // Typing is priced per character: two runs never type the same amount, and a keystroke is what gets repeated.
      per: g.typing && g.chars ? ('char' as const) : ('action' as const),
      renders: g.typing && g.chars ? +(g.renders.reduce((x, y) => x + y, 0) / g.chars).toFixed(1) : median(g.renders),
      ...(g.latency.length ? { latencyMs: Math.round(median(g.latency)) } : {}),
    })),
    backgroundPerSec: +(Math.max(0, rec.totals.renders - reacted) / seconds).toFixed(1),
    wastedPerSec: +(rec.totals.rendersWithoutDom / seconds).toFixed(1),
  };
}

export interface ActionChange {
  action: string;
  kind: string;
  target: string;
  component?: string;
  per: 'action' | 'char';
  times: { before: number; after: number };
  renders: Delta;
  latencyMs?: Delta;
}

export interface DigestComparison {
  /** Same page and area: the numbers below mean something side by side. */
  comparable: boolean;
  warnings: string[];
  actions: ActionChange[];
  /** Done in one of the two recordings only. */
  unmatched: { before: string[]; after: string[] };
  backgroundPerSec: Delta;
  wastedPerSec: Delta;
  /** One run began with the page load and the other did not: renders per second are not like for like. */
  startedDifferently: boolean;
}

/** The same actions side by side, the biggest change first; what was done in one run only is listed, not compared. */
export function compareDigests(a: Digest, b: Digest): DigestComparison {
  const warnings: string[] = [];
  if (a.path !== b.path) warnings.push(`page differs: ${a.path} vs ${b.path}`);
  if (a.area !== b.area) warnings.push(`area differs: ${a.area ?? 'whole app'} vs ${b.area ?? 'whole app'}`);
  const after = new Map(b.actions.map((x) => [x.key, x]));
  const matched = new Set<string>();
  const actions: ActionChange[] = [];
  for (const x of a.actions) {
    const y = after.get(x.key);
    if (!y || x.per !== y.per) continue;
    matched.add(x.key);
    actions.push({
      action: y.what,
      kind: y.kind,
      target: y.target,
      ...(y.component ? { component: y.component } : {}),
      per: y.per,
      times: { before: x.n, after: y.n },
      renders: delta(x.renders, y.renders),
      ...(x.latencyMs !== undefined || y.latencyMs !== undefined ? { latencyMs: delta(x.latencyMs ?? null, y.latencyMs ?? null) } : {}),
    });
  }
  const size = (c: ActionChange) => Math.abs(c.renders.delta ?? 0);
  return {
    comparable: warnings.length === 0,
    warnings,
    actions: actions.sort((p, q) => size(q) - size(p)),
    unmatched: {
      before: a.actions.filter((x) => !matched.has(x.key)).map((x) => x.what),
      after: b.actions.filter((x) => !matched.has(x.key)).map((x) => x.what),
    },
    backgroundPerSec: delta(a.backgroundPerSec, b.backgroundPerSec),
    wastedPerSec: delta(a.wastedPerSec, b.wastedPerSec),
    startedDifferently: Boolean(a.fromLoad) !== Boolean(b.fromLoad),
  };
}

/** Before/after of two recordings, per second where durations differ; warns when they were not taken alike. */
export function compareRecordings(a: RecordingV2, b: RecordingV2, options: CompareOptions = {}) {
  const top = options.top ?? 15;
  const match = options.match ?? 'key';
  const warnings: string[] = [];
  const ms = [a.durationMs, b.durationMs];
  if (a.page.viewport !== b.page.viewport) warnings.push(`viewport differs: ${a.page.viewport} vs ${b.page.viewport}`);
  if (new URL(a.page.url || 'http://x').pathname !== new URL(b.page.url || 'http://x').pathname)
    warnings.push(`page differs: ${a.page.url} vs ${b.page.url}`);
  if ((a.scope?.name ?? null) !== (b.scope?.name ?? null))
    warnings.push(`area differs: ${a.scope?.name ?? 'whole app'} vs ${b.scope?.name ?? 'whole app'}`);
  if (Math.max(...ms) > 2 * Math.min(...ms)) warnings.push(`durations differ more than twice: ${ms[0]}ms vs ${ms[1]}ms`);
  for (const key of new Set([...Object.keys(a.conditions), ...Object.keys(b.conditions)])) {
    if (key !== 'url' && a.conditions[key] !== b.conditions[key]) warnings.push(`condition ${key}: ${a.conditions[key]} vs ${b.conditions[key]}`);
  }
  for (const name of new Set([...Object.keys(a.plugins), ...Object.keys(b.plugins)])) {
    const va = a.plugins[name]?.version;
    const vb = b.plugins[name]?.version;
    if (va !== undefined && vb !== undefined && va !== vb) warnings.push(`plugin ${name}: section v${va} vs v${vb}, only shared metrics compared`);
  }
  const lit = (r: RecordingV2) => Boolean(r.overhead?.highlight ?? r.overhead?.overlayMs);
  if (lit(a) !== lit(b))
    warnings.push(
      `highlight was on only ${lit(a) ? 'before' : 'after'}: its drawing inflates frame and long-task times, compare renders, not timings`
    );
  if (a.partial || b.partial) warnings.push('a partial recording is compared: hook names, components and plugin sections may be missing');
  const text = (r: RecordingV2) => r.totals.domTextChanges;
  const totals = {
    commitsPerSec: delta(rate(a.totals.commitsInScope, ms[0]), rate(b.totals.commitsInScope, ms[1])),
    rendersPerSec: delta(rate(a.totals.renders, ms[0]), rate(b.totals.renders, ms[1])),
    rendersPerCommit: delta(a.totals.rendersPerScopeCommit, b.totals.rendersPerScopeCommit),
    rendersWithoutDomPerSec: delta(rate(a.totals.rendersWithoutDom, ms[0]), rate(b.totals.rendersWithoutDom, ms[1])),
    rendersPerTextChange: delta(text(a) ? +(a.totals.renders / text(a)).toFixed(1) : null, text(b) ? +(b.totals.renders / text(b)).toFixed(1) : null),
    longTaskMaxMs: delta(a.frames.longTasks.maxMs, b.frames.longTasks.maxMs),
  };
  const causes = new Set([...a.causes.map((c) => c.key), ...b.causes.map((c) => c.key)]);
  const plugins: Record<string, Array<{ key: string } & Delta>> = {};
  for (const name of new Set([...Object.keys(a.plugins), ...Object.keys(b.plugins)])) {
    const ma = a.plugins[name]?.metrics ?? {};
    const mb = b.plugins[name]?.metrics ?? {};
    plugins[name] = [...new Set([...Object.keys(ma), ...Object.keys(mb)])]
      .filter((key) => key in ma && key in mb)
      .map((key) => {
        const count = ma[key].kind === 'count';
        return { key, ...delta(count ? rate(ma[key].value, ms[0]) : ma[key].value, count ? rate(mb[key].value, ms[1]) : mb[key].value) };
      })
      .sort((p, q) => Math.abs(q.delta ?? 0) - Math.abs(p.delta ?? 0))
      .slice(0, top);
  }
  return {
    comparable: warnings.filter((w) => !w.startsWith('a partial')).length === 0,
    warnings,
    before: { id: a.id, durationMs: ms[0] },
    after: { id: b.id, durationMs: ms[1] },
    totals,
    roots: compareRoots(a.roots, b.roots, ms[0], ms[1], match, top),
    outsideRoots: compareRoots(a.outsideRoots, b.outsideRoots, ms[0], ms[1], match, 5),
    causes: [...causes]
      .map((key) => {
        const x = a.causes.find((c) => c.key === key);
        const y = b.causes.find((c) => c.key === key);
        return { key, commitsPerSec: delta(rate(x?.commits ?? 0, ms[0]), rate(y?.commits ?? 0, ms[1])) };
      })
      .sort((p, q) => Math.abs(q.commitsPerSec.delta ?? 0) - Math.abs(p.commitsPerSec.delta ?? 0))
      .slice(0, top),
    actions: compareDigests(digestOf(a), digestOf(b)).actions,
    plugins,
  };
}
