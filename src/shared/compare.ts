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

const actionKey = (a: ActionRecord) => `${a.kind}|${a.target?.testId ?? a.target?.name ?? a.target?.label ?? a.target?.text ?? a.target?.tag ?? ''}`;

function compareActions(a: RecordingV2, b: RecordingV2) {
  const pick = (rec: RecordingV2) => {
    const byKey = new Map<string, Array<{ action: ActionRecord; renders: number; perChar?: number; latency?: number }>>();
    const actions = new Map(rec.actions.map((x) => [x.id, x]));
    for (const s of rec.segments) {
      const action = actions.get(s.action);
      if (!action) continue;
      const list = byKey.get(actionKey(action)) ?? [];
      list.push({ action, renders: s.renders, perChar: s.perChar?.renders, latency: s.latency?.duration });
      byKey.set(actionKey(action), list);
    }
    return byKey;
  };
  const x = pick(a);
  const y = pick(b);
  const out = [];
  for (const [key, list] of x) {
    const other = y.get(key) ?? [];
    for (let i = 0; i < Math.min(list.length, other.length); i++) {
      out.push({
        action: actionText(other[i].action),
        renders: delta(list[i].renders, other[i].renders),
        ...(list[i].perChar !== undefined || other[i].perChar !== undefined
          ? { rendersPerChar: delta(list[i].perChar ?? null, other[i].perChar ?? null) }
          : {}),
        ...(list[i].latency !== undefined || other[i].latency !== undefined
          ? { latencyMs: delta(list[i].latency ?? null, other[i].latency ?? null) }
          : {}),
      });
    }
  }
  return out.slice(0, 20);
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
    actions: compareActions(a, b),
    plugins,
  };
}
