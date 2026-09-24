import { medianGap, topEntries } from './stats';
import { buildSegments } from './segments';
import {
  RECORDING_SCHEMA,
  type ActionRecord,
  type LatencyEntry,
  type LongFrame,
  type Navigation,
  type RecordingV2,
  type RootStat,
  type SessionEvent,
  type CommitRecord,
  type ReasonInfo,
  type SessionMeta,
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
  reasons: Map<number, number>;
  causes: Map<string, number>;
  lanes: Map<string, number>;
}

/**
 * Rebuilds a partial recording from the streamed events of a session that is still running or was cut by a reload.
 * Hook names, components and plugin sections exist only in the final recording.
 */
export function aggregateEvents(meta: SessionMeta, events: SessionEvent[]): RecordingV2 {
  const roots = new Map<number, RootAgg>();
  const reasons: ReasonInfo[] = [];
  const causes = new Map<string, { i: number; events: number; commits: number }>();
  const actions: ActionRecord[] = [];
  const latency: LatencyEntry[] = [];
  const loaf: LongFrame[] = [];
  const navigations: Navigation[] = [];
  const hmr: RecordingV2['hmr'] = [];
  const commits: CommitRecord[] = [];
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
        reasons[e.info.i] = e.info;
        break;
      case 'commit': {
        end = Math.max(end, e.t);
        renders += e.n;
        noDom += e.noDom ?? 0;
        if (e.lane) lanes[e.lane] = (lanes[e.lane] ?? 0) + 1;
        for (const key of e.causes ?? []) {
          const c = causes.get(key) ?? { i: causes.size, events: 0, commits: 0 };
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
          for (const id of reasonIds) r.reasons.set(id, (r.reasons.get(id) ?? 0) + 1);
          for (const key of e.causes ?? []) r.causes.set(key, (r.causes.get(key) ?? 0) + 1);
          if (e.lane) r.lanes.set(e.lane, (r.lanes.get(e.lane) ?? 0) + 1);
        }
        if (commits.length < 5000) {
          const previous = commits[commits.length - 1];
          commits.push({
            i: commits.length,
            atMs: e.t,
            ...(previous ? { sinceMs: +(e.t - previous.atMs).toFixed(1) } : {}),
            renders: e.n,
            ...(e.ms ? { ms: e.ms } : {}),
            ...(e.lane ? { lane: e.lane } : {}),
            ...(e.event ? { event: e.event } : {}),
            ...(e.noDom ? { noDom: e.noDom } : {}),
            ...(e.causes?.length ? { causeIds: e.causes.map((key) => causes.get(key)!.i) } : {}),
            ...(e.roots?.length ? { roots: e.roots.map(([i, hits, reasonIds]) => ({ i, hits, reasonIds })) } : {}),
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
    return {
      key: r.key,
      name: r.name,
      source: r.source,
      path: r.path,
      hits: r.hits,
      instances: 1,
      cascade: r.cascade,
      perHit: r.hits ? Math.round(r.cascade / r.hits) : 0,
      medianGapMs: medianGap(r.times),
      firstAtMs: r.times[0] ?? 0,
      lastAtMs: r.times.at(-1) ?? 0,
      reasons: topEntries(r.reasons, 8),
      causes: topEntries(r.causes, 8),
      lanes: topEntries(r.lanes, 5),
      noDomChange: 0,
      ...(r.outside ? { scopeRenders: r.cascade } : {}),
    };
  };
  const remapped: CommitRecord[] = commits.map((commit) => ({
    ...commit,
    ...(commit.roots ? { roots: commit.roots.map((r) => ({ ...r, i: remap.get(r.i) ?? r.i })) } : {}),
  }));
  const total = commits.length;
  const segments = buildSegments(
    actions,
    remapped.map((c) => ({ i: c.i, t: c.atMs, n: c.renders, event: c.event, roots: c.roots?.map((r) => [r.i, r.hits] as [number, number]) })),
    latency,
    loaf
  );
  for (const segment of segments) {
    for (const i of segment.commitIds ?? []) if (remapped[i]) remapped[i].actionId = segment.action;
    const action = actions.find((a) => a.id === segment.action);
    if (action && segment.commitIds?.length) action.commitIds = segment.commitIds;
  }
  return {
    schema: RECORDING_SCHEMA,
    version: 2,
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
      commits: total,
      commitsInScope: total,
      renders,
      mounts: 0,
      rendersPerCommit: total ? +(renders / total).toFixed(1) : 0,
      rendersPerScopeCommit: total ? +(renders / total).toFixed(1) : 0,
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
      .map(([key, c]) => ({ i: c.i, key, plugin: key.split(':')[0], type: key.slice(key.indexOf(':') + 1), events: c.events, commits: c.commits }))
      .sort((a, b) => b.commits - a.commits),
    actions,
    segments: segments.map(({ commitIds: _ids, ...rest }) => rest),
    latency,
    reasons: reasons.filter(Boolean),
    commits: { list: remapped, truncated: events.filter((e) => e.k === 'commit').length > 5000 },
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
