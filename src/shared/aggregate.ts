import { buildSegments } from './segments';
import {
  RECORDING_SCHEMA,
  type ActionRecord,
  type LatencyEntry,
  type LongFrame,
  type Navigation,
  type RecordingV1,
  type RootStat,
  type SessionEvent,
  type SessionMeta,
  type TimelineEntry,
} from './schema';

interface RootAgg {
  i: number;
  key: string;
  name: string;
  source: string;
  path: string;
  outside: boolean;
  hits: number;
  cascade: number;
  times: number[];
  reasons: Map<string, number>;
  causes: Map<string, number>;
  lanes: Map<string, number>;
}

const top = (map: Map<string, number>, n: number): Array<[string, number]> => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * Rebuilds a partial recording from the streamed events of a session that is still running or was cut by a reload.
 * Hook names, components and plugin sections exist only in the final recording.
 */
export function aggregateEvents(meta: SessionMeta, events: SessionEvent[]): RecordingV1 {
  const roots = new Map<number, RootAgg>();
  const reasons = new Map<number, string>();
  const causes = new Map<string, { events: number; commits: number }>();
  const actions: ActionRecord[] = [];
  const latency: LatencyEntry[] = [];
  const loaf: LongFrame[] = [];
  const navigations: Navigation[] = [];
  const hmr: RecordingV1['hmr'] = [];
  const timeline: TimelineEntry[] = [];
  const lanes: Record<string, number> = {};
  let renders = 0;
  let noDom = 0;
  let outside = 0;
  let end = 0;
  for (const e of events) {
    switch (e.k) {
      case 'root':
        roots.set(e.i, {
          i: e.i,
          key: e.key,
          name: e.name,
          source: e.source,
          path: e.path,
          outside: Boolean(e.outside),
          hits: 0,
          cascade: 0,
          times: [],
          reasons: new Map(),
          causes: new Map(),
          lanes: new Map(),
        });
        break;
      case 'reason':
        reasons.set(e.i, e.text);
        break;
      case 'commit': {
        end = Math.max(end, e.t);
        renders += e.n;
        noDom += e.noDom ?? 0;
        if (e.lane) lanes[e.lane] = (lanes[e.lane] ?? 0) + 1;
        for (const key of e.causes ?? []) {
          const c = causes.get(key) ?? { events: 0, commits: 0 };
          c.events++;
          c.commits++;
          causes.set(key, c);
        }
        for (const [i, cascade, reasonIds] of e.roots ?? []) {
          const r = roots.get(i);
          if (!r) continue;
          if (r.outside) outside += cascade;
          r.hits++;
          r.cascade += cascade;
          r.times.push(e.t);
          for (const id of reasonIds) {
            const text = reasons.get(id);
            if (text) r.reasons.set(text, (r.reasons.get(text) ?? 0) + 1);
          }
          for (const key of e.causes ?? []) r.causes.set(key, (r.causes.get(key) ?? 0) + 1);
          if (e.lane) r.lanes.set(e.lane, (r.lanes.get(e.lane) ?? 0) + 1);
        }
        if (timeline.length < 5000) {
          timeline.push({
            t: e.t,
            n: e.n,
            ...(e.lane ? { lane: e.lane } : {}),
            ...(e.event ? { event: e.event } : {}),
            roots: (e.roots ?? []).map(([i, c]) => [i, c] as [number, number]),
            causes: e.causes,
          });
        }
        break;
      }
      case 'action':
        actions.push(e.action);
        end = Math.max(end, e.action.endMs);
        break;
      case 'latency':
        latency.push(e.entry);
        break;
      case 'frame':
        loaf.push(e.frame);
        break;
      case 'nav':
        navigations.push(e.nav);
        break;
      case 'hmr':
        hmr.push({ atMs: e.atMs, type: e.type, paths: e.paths });
        break;
      case 'end':
        end = Math.max(end, e.atMs);
        break;
    }
  }
  const all = [...roots.values()];
  const ordered = [
    ...all.filter((r) => !r.outside).sort((a, b) => b.cascade - a.cascade),
    ...all.filter((r) => r.outside).sort((a, b) => b.cascade - a.cascade),
  ];
  const remap = new Map(ordered.map((r, index) => [r.i, index]));
  const stat = (r: RootAgg): RootStat => {
    const gaps = r.times
      .slice(1)
      .map((t, i) => t - r.times[i])
      .sort((a, b) => a - b);
    return {
      key: r.key,
      name: r.name,
      source: r.source,
      path: r.path,
      hits: r.hits,
      instances: 1,
      cascade: r.cascade,
      perHit: r.hits ? Math.round(r.cascade / r.hits) : 0,
      medianGapMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      firstAtMs: r.times[0] ?? 0,
      lastAtMs: r.times.at(-1) ?? 0,
      reasons: top(r.reasons, 8),
      causes: top(r.causes, 8),
      lanes: top(r.lanes, 5),
      noDomChange: 0,
      ...(r.outside ? { scopeRenders: r.cascade } : {}),
    };
  };
  const remapped = timeline.map((entry) => ({ ...entry, roots: entry.roots?.map(([i, c]) => [remap.get(i) ?? i, c] as [number, number]) }));
  const commits = timeline.length;
  return {
    schema: RECORDING_SCHEMA,
    version: 1,
    id: meta.id,
    partial: true,
    createdAt: meta.updatedAt,
    ...(meta.label ? { label: meta.label } : {}),
    tool: { version: '', source: meta.source, plugins: meta.plugins },
    page: meta.page,
    react: { version: null, roots: 0, profileTimings: false },
    options: {},
    startedAt: meta.createdAt,
    durationMs: end,
    scope: meta.scope ? { ...meta.scope, path: [], state: 'attached', remounts: 0, lostAtMs: [] } : null,
    totals: {
      commits,
      commitsInScope: commits,
      renders,
      mounts: 0,
      rendersPerCommit: commits ? +(renders / commits).toFixed(1) : 0,
      rendersPerScopeCommit: commits ? +(renders / commits).toFixed(1) : 0,
      rendersFromOutside: outside,
      rendersWithoutDom: noDom,
      domTextChanges: 0,
      causesDropped: 0,
      lanes,
    },
    roots: ordered.filter((r) => !r.outside).map(stat),
    outsideRoots: ordered.filter((r) => r.outside).map(stat),
    components: [],
    causes: [...causes]
      .map(([key, c]) => ({ key, plugin: key.split(':')[0], type: key.slice(key.indexOf(':') + 1), events: c.events, commits: c.commits }))
      .sort((a, b) => b.commits - a.commits),
    actions,
    segments: buildSegments(actions, remapped, latency, loaf),
    latency,
    timeline: { entries: remapped, truncated: events.filter((e) => e.k === 'commit').length > 5000 },
    bigCommits: [],
    frames: { longTasks: { count: 0, maxMs: 0, totalMs: 0 }, loaf },
    dom: { text: 0 },
    navigations,
    hmr,
    conditions: meta.conditions,
    plugins: {},
    overhead: { commitMs: 0, maxCommitMs: 0, overlayMs: 0 },
    warnings: ['partial: rebuilt from streamed events; hook names, components and plugin sections come only with Stop'],
    errors: [],
  };
}
