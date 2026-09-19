import { sameContent } from '../shared/same-content';
import {
  RECORDING_SCHEMA,
  type ActionRecord,
  type CauseStat,
  type Conditions,
  type HookInfo,
  type JsonValue,
  type Navigation,
  type Primitive,
  type RecordingV1,
  type RootStat,
  type SessionEvent,
  type TimelineEntry,
} from '../shared/schema';
import { buildSegments, USER_EVENTS, type SegmentCommit } from '../shared/segments';
import { ActionTracker } from './actions';
import { hookCommits, hookOwner, laneLabel, RecorderError, type CommitHook, type CommitInfo } from './commit-hook';
import { DomWatcher } from './dom';
import { FrameWatcher } from './env/frames';
import { trackHistory } from './env/navigations';
import {
  findRoots,
  hasProfileTimings,
  hostRootOf,
  isComposite,
  isHost,
  isProvider,
  nameOf,
  nearestHosts,
  reactVersion,
  sourceOf,
  Tag,
  type Fiber,
  type FiberRoot,
} from './fiber';
import { inspectHooks } from './hook-names';
import type { CauseEvent, PluginHost } from './plugins';
import { didRender, hookTypeAt, parentReason, reasonsOf, snapshotOf, type Reason, type Snapshot } from './reasons';
import { ScopeTracker, type ScopeHandle, type ScopeResolution } from './scope';

export interface EngineConfig {
  version: string;
  projectRoot: string;
  wrapperPattern: string;
  actions: { values: boolean; secretSelector: string };
  maxDurationMs: number;
  bigCommit: number;
  timelineLimit: number;
}

export interface RecordOptions {
  source?: string;
  label?: string;
  scope?: ScopeHandle | null;
  watch?: string[];
  zones?: Record<string, string | { selector: string; viaAriaControls?: boolean }>;
  highlight?: boolean;
  actions?: boolean;
  hookNames?: boolean;
  prune?: boolean;
  bigCommit?: number;
  timeline?: number;
  meta?: Record<string, Primitive>;
}

export interface HighlightSink {
  flash(pairs: Array<[Element, string, Fiber]>, withoutDom: Set<Fiber>): void;
}

export interface RecorderDeps {
  config: EngineConfig;
  plugins: PluginHost;
  ownHost: Element | null;
  highlight: HighlightSink | null;
  onEvent(event: SessionEvent): void;
}

interface RootAgg {
  index: number;
  key: string;
  name: string;
  source: string;
  path: string;
  outside: boolean;
  hits: number;
  instances: number;
  inCommit: number;
  lastCommit: number;
  cascade: number;
  times: number[];
  reasons: Map<string, number>;
  causes: Map<string, number>;
  lanes: Map<string, number>;
  noDomChange: number;
  renderMs: number;
  hookIdx: Set<number>;
  latest: WeakRef<Fiber> | null;
}

interface ComponentAgg {
  renders: number;
  withoutDom: number;
  byParent: number;
  memo: boolean;
  reasons: Map<string, number>;
}

interface CommitState {
  t: number;
  renders: number;
  renderMs: number;
  noDom: number;
  cascade: Map<RootAgg, number>;
  reasons: Map<RootAgg, Set<number>>;
  outside: RootAgg | null;
  pairs: Array<[Element, string, Fiber]>;
  withoutDom: Set<Fiber>;
  touched: Set<Fiber>;
}

type StackItem = [fiber: Fiber, parentRendered: boolean, path: string, rootKey: string | null, pending: [string, Fiber] | null, zone: string | null];

const MAX_TIMES = 2000;
const MAX_SEGMENT_COMMITS = 20_000;

const currentEventType = (): string | undefined => {
  const event = (globalThis as { event?: Event }).event;
  return event && typeof event.type === 'string' ? event.type : undefined;
};

const median = (xs: number[]) => {
  if (xs.length < 2) return null;
  const gaps = xs
    .slice(1)
    .map((x, i) => x - xs[i])
    .sort((a, b) => a - b);
  return Math.round(gaps[Math.floor(gaps.length / 2)]);
};

const topEntries = (map: Map<string, number>, n: number): Array<[string, number]> => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);

/** One recording: from start() to stop(). */
export class Recorder {
  readonly t0 = performance.now();
  readonly startedAt = new Date();
  private readonly config: EngineConfig;
  private readonly wrapperRe: RegExp;
  private readonly prune: boolean;
  private readonly records = new WeakMap<Fiber, Snapshot>();
  private readonly rootsByKey = new Map<string, RootAgg>();
  private readonly rootList: RootAgg[] = [];
  private readonly reasonIds = new Map<string, number>();
  private readonly components = new Map<string, ComponentAgg>();
  private readonly watch = new Map<string, { mounted: number; renders: number; byRoot: Map<RootAgg | null, number> }>();
  private readonly zoneNodes = new Map<Element, string>();
  private readonly zones = new Map<string, { renders: number; mounted: number; found: boolean }>();
  private readonly causeStats = new Map<string, CauseStat>();
  private readonly timeline: TimelineEntry[] = [];
  private readonly segmentCommits: SegmentCommit[] = [];
  private readonly commitTimes: number[] = [];
  private readonly bigCommits: number[] = [];
  private readonly navigations: Navigation[] = [];
  private readonly hmr: Array<{ atMs: number; type: string; paths: string[] }> = [];
  private readonly errors: string[] = [];
  private readonly warnings: string[] = [];
  private readonly scope: ScopeTracker | null;
  private readonly dom = new DomWatcher();
  private readonly frames: FrameWatcher;
  private readonly actions: ActionTracker | null;
  private hook: CommitHook | null = null;
  private stopHistory: (() => void) | null = null;
  private roots: FiberRoot[] = [];
  private conditions: Conditions = {};
  private truncated = false;
  private stopped = false;
  private overlayMs = 0;
  private readonly totals = {
    commits: 0,
    commitsInScope: 0,
    renders: 0,
    mounts: 0,
    rendersFromOutside: 0,
    rendersWithoutDom: 0,
    causesDropped: 0,
    lanes: {} as Record<string, number>,
  };

  constructor(private deps: RecorderDeps, private options: RecordOptions) {
    this.config = deps.config;
    this.wrapperRe = new RegExp(this.config.wrapperPattern || '^$');
    this.prune = options.prune !== false;
    this.scope = options.scope ? new ScopeTracker(options.scope) : null;
    for (const name of options.watch ?? []) this.watch.set(name, { mounted: 0, renders: 0, byRoot: new Map() });
    this.frames = new FrameWatcher({
      t0: this.t0,
      projectRoot: this.config.projectRoot,
      countCommits: (from, to) => this.countCommits(from, to),
      onFrame: (frame) => this.emit({ k: 'frame', frame }),
      onLatency: (entry) => this.emit({ k: 'latency', entry }),
    });
    this.actions =
      options.actions === false
        ? null
        : new ActionTracker(
            {
              values: this.config.actions.values,
              secretSelector: this.config.actions.secretSelector,
              wrapperPattern: this.wrapperRe,
              ownHost: deps.ownHost,
              inScope: (el) => (this.scope ? this.scopeHosts().some((h) => h.contains(el)) : undefined),
            },
            () => this.now(),
            (action) => this.emit({ k: 'action', action })
          );
  }

  now() {
    return performance.now() - this.t0;
  }

  get startConditions(): Conditions {
    return this.conditions;
  }

  get scopeInfo() {
    return this.scope ? { name: this.scope.name, source: this.scope.source } : null;
  }

  start() {
    this.roots = this.scope ? [hostRootOf(this.scope.target)].filter((r): r is FiberRoot => Boolean(r)) : findRoots();
    if (!this.roots.length) throw new RecorderError('NO_ROOT', 'React 18 dev root not found on the page');
    for (const root of this.roots) {
      const owner = hookOwner(root);
      if (owner) throw new RecorderError('BUSY', `root.current is already hooked by ${owner}: wait for it to finish or call its stop()`, owner);
    }
    this.resolveZones();
    for (const root of this.roots) this.seed(root.current);
    this.conditions = this.readConditions();
    this.deps.plugins.start({ scope: this.scopeInfo, findFibers: (pred, limit) => this.findFibers(pred, limit) }, this.t0);
    if (this.scope) this.dom.setScopeHosts(this.scopeHosts());
    this.dom.start();
    this.hook = hookCommits(this.roots, this.options.source ?? 'panel', (info) => this.onCommit(info));
    this.frames.start();
    this.actions?.start();
    this.stopHistory = trackHistory(
      () => this.now(),
      (nav) => {
        if (this.navigations.length < 500) this.navigations.push(nav);
        this.emit({ k: 'nav', nav });
        this.deps.plugins.emit('core', { type: `navigation ${nav.type}` });
        if (nav.type === 'pop') this.actions?.navigation(nav.url);
      }
    );
  }

  noteHmr(type: string, paths: string[]) {
    const entry = { atMs: Math.round(this.now()), type, paths: paths.slice(0, 10) };
    this.hmr.push(entry);
    this.emit({ k: 'hmr', ...entry });
    if (!this.warnings.some((w) => w.startsWith('HMR')))
      this.warnings.push('HMR update during the recording: commits around it include react-refresh work');
  }

  live() {
    return {
      commits: this.totals.commits,
      commitsInScope: this.totals.commitsInScope,
      renders: this.totals.renders,
      elapsedMs: Math.round(this.now()),
      scopeState: this.scope?.state ?? null,
    };
  }

  stop(): RecordingV1 {
    if (this.stopped) throw new RecorderError('NOT_RECORDING', 'recording already stopped');
    this.stopped = true;
    const hookErrors = this.hook?.stop() ?? [];
    this.errors.push(...hookErrors);
    this.dom.stop();
    this.frames.stop();
    this.actions?.stop();
    this.stopHistory?.();
    const sections = this.deps.plugins.stop({ scope: this.scopeInfo, findFibers: (pred, limit) => this.findFibers(pred, limit) });
    this.warnings.push(...this.deps.plugins.warnings.splice(0));
    const conditionsAfter = this.readConditions();
    const durationMs = Math.round(this.now());
    this.emit({ k: 'end', atMs: durationMs });
    return this.build(durationMs, sections, conditionsAfter);
  }

  // ---- commits -------------------------------------------------------------------------------------------------

  private onCommit({ fiber, lanes }: CommitInfo) {
    const started = performance.now();
    const t = Math.round(started - this.t0);
    this.totals.commits++;
    if (this.commitTimes.length < MAX_SEGMENT_COMMITS) this.commitTimes.push(t);
    const lane = laneLabel(lanes);
    const event = currentEventType();
    const causes = this.deps.plugins.drain();
    const c: CommitState = {
      t,
      renders: 0,
      renderMs: 0,
      noDom: 0,
      cascade: new Map(),
      reasons: new Map(),
      outside: null,
      pairs: [],
      withoutDom: new Set(),
      touched: this.dom.takeForCommit(),
    };
    if (this.scope) {
      const prevs: Array<Snapshot | undefined> = [];
      const resolution = this.scope.resolve(fiber, (f) => this.visitChain(f, prevs), t);
      if (resolution.status === 'found') this.scanScope(resolution, prevs, c);
      else if (resolution.status === 'lost' && this.scope.lostAtMs.at(-1) === t) this.emit({ k: 'scope', atMs: t, state: 'lost' });
    } else {
      this.scan(fiber, false, '', null, c, false);
    }
    this.finishCommit(c, causes, lane, event);
  }

  private visitChain(f: Fiber, prevs: Array<Snapshot | undefined>) {
    const prev = this.prevOf(f);
    prevs.push(prev);
    const rendered = didRender(prev, f);
    this.remember(f);
    return { rendered };
  }

  private scanScope(res: Extract<ScopeResolution, { status: 'found' }>, prevs: Array<Snapshot | undefined>, c: CommitState) {
    const { fibers, rendered } = res;
    const n = fibers.length;
    const target = fibers[n - 1];
    if (res.remounted) {
      this.emit({ k: 'scope', atMs: c.t, state: 'remounted' });
      this.dom.setScopeHosts(this.scopeHosts());
    }
    const parentRendered = n >= 2 ? rendered[n - 2] : false;
    let rootKey: string | null = null;
    if (rendered[n - 1] && parentRendered) {
      let top = n - 2;
      while (top > 0 && rendered[top - 1]) top--;
      let j = top;
      while (j < n - 1 && !nameOf(fibers[j])) j++;
      if (j < n - 1 && prevs[j]) {
        const { agg } = this.hitRoot(fibers[j], nameOf(fibers[j])!, this.chainPath(fibers, j), prevs[j]!, c, true);
        c.outside = agg;
        rootKey = agg.key;
      }
    }
    // The chain walk already stored the scope's new snapshot; the scan compares against the previous one.
    const prevTarget = prevs[n - 1];
    if (prevTarget) {
      this.records.set(target, prevTarget);
      if (target.alternate) this.records.set(target.alternate, prevTarget);
    }
    this.scan(target, parentRendered, this.chainPath(fibers, n - 1), rootKey, c, true);
    if (c.renders) this.dom.setScopeHosts(nearestHosts(target));
  }

  private chainPath(fibers: Fiber[], upTo: number) {
    const names: string[] = [];
    for (let i = upTo - 1; i >= 0 && names.length < 4; i--) {
      const name = nameOf(fibers[i]);
      if (name && !this.wrapperRe.test(name) && !isProvider(name)) names.push(name);
    }
    return names.join(' < ');
  }

  private scan(start: Fiber, parentRendered: boolean, path: string, rootKey: string | null, c: CommitState, isolate: boolean) {
    const highlight = Boolean(this.deps.highlight) && this.options.highlight !== false;
    const stack: StackItem[] = [[start, parentRendered, path, rootKey, null, null]];
    while (stack.length) {
      const [f, parentDid, currentPath, currentKey, pending, zoneTag] = stack.pop()!;
      const prev = this.prevOf(f);
      const rendered = didRender(prev, f);
      const name = nameOf(f);
      let key = currentKey;
      let nextPending = pending;
      const zone = isHost(f) && this.zoneNodes.size ? this.zoneNodes.get(f.stateNode) ?? zoneTag : zoneTag;
      if (name && !prev) this.totals.mounts++;
      if (name && rendered) {
        c.renders++;
        this.totals.renders++;
        const wasted = !c.touched.has(f);
        let comp = this.components.get(name);
        if (!comp) {
          comp = {
            renders: 0,
            withoutDom: 0,
            byParent: 0,
            memo: f.tag === Tag.MemoComponent || f.tag === Tag.SimpleMemoComponent,
            reasons: new Map(),
          };
          this.components.set(name, comp);
        }
        comp.renders++;
        if (wasted) {
          comp.withoutDom++;
          c.noDom++;
          this.totals.rendersWithoutDom++;
          c.withoutDom.add(f);
        }
        let reasons: Reason[] | null = null;
        if (!parentDid) {
          const hit = this.hitRoot(f, name, currentPath, prev!, c, false);
          key = hit.agg.key;
          reasons = hit.reasons;
        } else if (isComposite(f) && !isProvider(name)) {
          comp.byParent++;
          reasons = parentReason(prev!, f, this.deps.plugins);
        }
        for (const reason of reasons ?? []) comp.reasons.set(reason.text, (comp.reasons.get(reason.text) ?? 0) + 1);
        const agg = key ? this.rootsByKey.get(key) : undefined;
        if (agg) {
          agg.cascade++;
          c.cascade.set(agg, (c.cascade.get(agg) ?? 0) + 1);
          if (agg.outside) this.totals.rendersFromOutside++;
        }
        const w = this.watch.get(name);
        if (w) {
          w.renders++;
          w.byRoot.set(agg ?? null, (w.byRoot.get(agg ?? null) ?? 0) + 1);
        }
        if (zone) {
          const z = this.zones.get(zone);
          if (z) z.renders++;
        }
        if (highlight && !pending && isComposite(f)) nextPending = [name, f];
      }
      if (nextPending && (isHost(f) || f.tag === Tag.HostText)) {
        const el = isHost(f) ? (f.stateNode as Element) : (f.stateNode as Text).parentElement;
        if (el) c.pairs.push([el, nextPending[0], nextPending[1]]);
        nextPending = null;
      }
      this.remember(f);
      if (!(isolate && f === start) && f.sibling) stack.push([f.sibling, parentDid, currentPath, currentKey, pending, zoneTag]);
      const untouched = this.prune && f.alternate !== null && f.child === f.alternate.child;
      if (f.child && !untouched) {
        const childPath =
          name && !this.wrapperRe.test(name) && !isProvider(name)
            ? [name, ...currentPath.split(' < ').filter(Boolean)].slice(0, 4).join(' < ')
            : currentPath;
        stack.push([f.child, rendered, childPath, rendered ? key : currentKey, nextPending, zone]);
      }
    }
  }

  private hitRoot(f: Fiber, name: string, path: string, prev: Snapshot, c: CommitState, outside: boolean): { agg: RootAgg; reasons: Reason[] } {
    const source = sourceOf(f, this.config.projectRoot);
    const key = `${outside ? 'outside|' : ''}${name}|${source}|${path}`;
    let agg = this.rootsByKey.get(key);
    if (!agg) {
      agg = {
        index: this.rootList.length,
        key,
        name,
        source,
        path,
        outside,
        hits: 0,
        instances: 0,
        inCommit: 0,
        lastCommit: -1,
        cascade: 0,
        times: [],
        reasons: new Map(),
        causes: new Map(),
        lanes: new Map(),
        noDomChange: 0,
        renderMs: 0,
        hookIdx: new Set(),
        latest: null,
      };
      this.rootsByKey.set(key, agg);
      this.rootList.push(agg);
      this.emit({ k: 'root', i: agg.index, key, name, source, path, ...(outside ? { outside: true as const } : {}) });
    }
    if (agg.lastCommit !== this.totals.commits) {
      agg.lastCommit = this.totals.commits;
      agg.hits++;
      agg.inCommit = 0;
      if (agg.times.length < MAX_TIMES) agg.times.push(c.t);
    }
    agg.inCommit++;
    agg.instances = Math.max(agg.instances, agg.inCommit);
    agg.latest = new WeakRef(f);
    const ids = c.reasons.get(agg) ?? new Set<number>();
    const reasons = reasonsOf(prev, f, this.deps.plugins);
    for (const reason of reasons) {
      agg.reasons.set(reason.text, (agg.reasons.get(reason.text) ?? 0) + 1);
      if (reason.hook !== undefined) agg.hookIdx.add(reason.hook);
      ids.add(this.reasonId(reason.text));
    }
    c.reasons.set(agg, ids);
    if (!outside && !c.touched.has(f)) agg.noDomChange++;
    if (hasProfileTimings(f)) {
      agg.renderMs += f.actualDuration!;
      c.renderMs += f.actualDuration!;
    }
    if (!outside) c.cascade.set(agg, c.cascade.get(agg) ?? 0);
    return { agg, reasons };
  }

  private finishCommit(c: CommitState, causes: CauseEvent[], lane: string | undefined, event: string | undefined) {
    if (lane) this.totals.lanes[lane] = (this.totals.lanes[lane] ?? 0) + 1;
    if (!c.renders) {
      this.totals.causesDropped += causes.length;
      return;
    }
    this.totals.commitsInScope++;
    const keys = new Set<string>();
    for (const cause of causes) keys.add(this.attachCause(cause));
    if (event && USER_EVENTS.has(event)) keys.add(this.attachCause({ plugin: 'core', type: `input ${event}`, atMs: c.t }));
    if (!keys.size) keys.add(this.attachCause({ plugin: 'core', type: 'none', atMs: c.t }));
    for (const key of keys) this.causeStats.get(key)!.commits++;
    const involved = new Set<RootAgg>([...c.cascade.keys(), ...(c.outside ? [c.outside] : [])]);
    for (const agg of involved) {
      for (const key of keys) agg.causes.set(key, (agg.causes.get(key) ?? 0) + 1);
      if (lane && agg.lastCommit === this.totals.commits) agg.lanes.set(lane, (agg.lanes.get(lane) ?? 0) + 1);
    }
    const ranked = [...c.cascade].sort((a, b) => b[1] - a[1]);
    const roots = ranked.slice(0, 5).map(([agg, n]) => [agg.index, n] as [number, number]);
    const entry: TimelineEntry = {
      t: c.t,
      n: c.renders,
      ...(c.renderMs ? { ms: +c.renderMs.toFixed(2) } : {}),
      ...(lane ? { lane } : {}),
      ...(event ? { event } : {}),
      ...(roots.length ? { roots } : {}),
      causes: [...keys],
      ...(c.outside ? { outside: c.outside.index } : {}),
      ...(c.noDom ? { noDom: c.noDom } : {}),
    };
    const limit = this.options.timeline ?? this.config.timelineLimit;
    if (this.timeline.length < limit) this.timeline.push(entry);
    else this.truncated = true;
    if (c.renders >= (this.options.bigCommit ?? this.config.bigCommit)) this.bigCommits.push(this.timeline.length - 1);
    if (this.segmentCommits.length < MAX_SEGMENT_COMMITS) this.segmentCommits.push({ t: c.t, n: c.renders, event, roots });
    this.emit({
      k: 'commit',
      t: c.t,
      n: c.renders,
      ...(entry.ms ? { ms: entry.ms } : {}),
      ...(lane ? { lane } : {}),
      ...(event ? { event } : {}),
      roots: ranked.map(([agg, n]) => [agg.index, n, [...(c.reasons.get(agg) ?? [])]] as [number, number, number[]]),
      causes: [...keys],
      ...(c.outside ? { outside: c.outside.index } : {}),
      ...(c.noDom ? { noDom: c.noDom } : {}),
    });
    if (c.pairs.length && this.deps.highlight) {
      const started = performance.now();
      this.deps.highlight.flash(c.pairs, c.withoutDom);
      this.overlayMs += performance.now() - started;
    }
  }

  private attachCause(cause: CauseEvent): string {
    const key = `${cause.plugin}:${cause.type}`;
    let stat = this.causeStats.get(key);
    if (!stat) {
      stat = { key, plugin: cause.plugin, type: cause.type, events: 0, commits: 0 };
      this.causeStats.set(key, stat);
    }
    stat.events++;
    if (cause.changes?.length) {
      stat.keys ??= {};
      for (const change of cause.changes.slice(0, 40)) {
        const k = (stat.keys[change.key] ??= { changed: 0, sameContent: 0, unknown: 0 });
        const same = sameContent(change.prev, change.next, 20_000);
        if (same === true) k.sameContent++;
        else if (same === 'unknown') k.unknown++;
        else k.changed++;
      }
    }
    return key;
  }

  // ---- snapshots and helpers ------------------------------------------------------------------------------------

  private prevOf(f: Fiber): Snapshot | undefined {
    return this.records.get(f) ?? (f.alternate ? this.records.get(f.alternate) : undefined);
  }

  private remember(f: Fiber) {
    const snapshot = snapshotOf(f);
    this.records.set(f, snapshot);
    if (f.alternate) this.records.set(f.alternate, snapshot);
  }

  private seed(start: Fiber) {
    const stack: Array<[Fiber, string | null]> = [[start, null]];
    while (stack.length) {
      const [f, zoneTag] = stack.pop()!;
      this.remember(f);
      const name = nameOf(f);
      const w = name ? this.watch.get(name) : undefined;
      if (w) w.mounted++;
      const zone = isHost(f) && this.zoneNodes.size ? this.zoneNodes.get(f.stateNode) ?? zoneTag : zoneTag;
      if (zone && name) this.zones.get(zone)!.mounted++;
      if (f.sibling) stack.push([f.sibling, zoneTag]);
      if (f.child) stack.push([f.child, zone]);
    }
  }

  private findFibers(pred: (f: Fiber) => boolean, limit = Infinity): Fiber[] {
    const out: Fiber[] = [];
    for (const root of this.roots.length ? this.roots : findRoots()) {
      const stack: Fiber[] = [root.current];
      while (stack.length && out.length < limit) {
        const f = stack.pop()!;
        try {
          if (pred(f)) out.push(f);
        } catch {
          // A predicate reading odd props must not stop the walk.
        }
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
    }
    return out;
  }

  private resolveZones() {
    for (const [name, spec] of Object.entries(this.options.zones ?? {})) {
      const { selector, viaAriaControls } = typeof spec === 'string' ? { selector: spec, viaAriaControls: false } : spec;
      let el = document.querySelector(selector);
      if (el && viaAriaControls) {
        const id = el.getAttribute('aria-controls');
        el = id ? document.getElementById(id) : null;
      }
      this.zones.set(name, { renders: 0, mounted: 0, found: Boolean(el) });
      if (el) this.zoneNodes.set(el, name);
    }
  }

  private scopeHosts(): Element[] {
    return this.scope ? nearestHosts(this.scope.target) : [];
  }

  private countCommits(from: number, to: number) {
    let n = 0;
    for (const t of this.commitTimes) if (t >= from && t <= to) n++;
    return n;
  }

  private reasonId(text: string) {
    let id = this.reasonIds.get(text);
    if (id === undefined) {
      id = this.reasonIds.size;
      this.reasonIds.set(text, id);
      this.emit({ k: 'reason', i: id, text });
    }
    return id;
  }

  private emit(event: SessionEvent) {
    if (this.stopped && event.k !== 'end') return;
    try {
      this.deps.onEvent(event);
    } catch {
      // The transport must never break a commit.
    }
  }

  private readConditions(): Conditions {
    return {
      viewport: `${innerWidth}×${innerHeight}`,
      url: location.pathname + location.search,
      dpr: devicePixelRatio,
      ...this.deps.plugins.conditions(),
    };
  }

  // ---- result ----------------------------------------------------------------------------------------------------

  private hookInfo(agg: RootAgg): Record<string, HookInfo> | undefined {
    if (!agg.hookIdx.size) return undefined;
    const fiber = agg.latest?.deref();
    if (!fiber) return undefined;
    const out: Record<string, HookInfo> = {};
    let names: Map<number, HookInfo> | null = null;
    if (this.options.hookNames !== false && isMounted(fiber)) {
      try {
        names = inspectHooks(fiber);
      } catch (error) {
        this.warnings.push(`hook names for ${agg.name}: ${String((error as Error)?.message ?? error).slice(0, 120)}`);
      }
    }
    for (const index of agg.hookIdx) out[index] = names?.get(index) ?? { type: hookTypeAt(fiber, index) };
    return out;
  }

  private rootStat(agg: RootAgg, withHooks: boolean): RootStat {
    return {
      key: agg.key,
      name: agg.name,
      source: agg.source,
      path: agg.path,
      hits: agg.hits,
      instances: agg.instances,
      cascade: agg.cascade,
      perHit: agg.hits ? Math.round(agg.cascade / agg.hits) : 0,
      medianGapMs: median(agg.times),
      firstAtMs: agg.times[0] ?? 0,
      lastAtMs: agg.times.at(-1) ?? 0,
      reasons: topEntries(agg.reasons, 8),
      causes: topEntries(agg.causes, 8),
      lanes: topEntries(agg.lanes, 5),
      noDomChange: agg.noDomChange,
      ...(agg.renderMs ? { renderMs: +agg.renderMs.toFixed(1) } : {}),
      ...(withHooks ? { hooks: this.hookInfo(agg) } : {}),
      ...(agg.outside ? { scopeRenders: agg.cascade } : {}),
    };
  }

  private build(durationMs: number, sections: Record<string, RecordingV1['plugins'][string]>, conditionsAfter: Conditions): RecordingV1 {
    const inside = this.rootList.filter((r) => !r.outside).sort((a, b) => b.cascade - a.cascade);
    const outside = this.rootList.filter((r) => r.outside).sort((a, b) => b.cascade - a.cascade);
    const hooksFor = new Set([...inside.slice(0, 30), ...outside.slice(0, 10)]);
    const statsByIndex = new Map<number, RootStat>();
    for (const agg of this.rootList) statsByIndex.set(agg.index, this.rootStat(agg, hooksFor.has(agg)));
    // Roots are ordered by cascade, inside the scope first; timeline, segments and watch are remapped to that order.
    const remap = new Map<number, number>();
    const orderedInside = inside.map((agg) => agg.index);
    const allOrdered = [...orderedInside, ...outside.map((agg) => agg.index)];
    allOrdered.forEach((index, i) => remap.set(index, i));
    const mapRoots = (pairs?: Array<[number, number]>) => pairs?.map(([index, n]) => [remap.get(index)!, n] as [number, number]);
    const rootsOrdered = allOrdered.map((index) => statsByIndex.get(index)!);
    const changed = Object.fromEntries(
      Object.keys({ ...this.conditions, ...conditionsAfter })
        .filter((key) => this.conditions[key] !== conditionsAfter[key])
        .map((key) => [key, [this.conditions[key] ?? null, conditionsAfter[key] ?? null] as [Primitive, Primitive]])
    );
    const actions: ActionRecord[] = this.actions?.actions ?? [];
    const segments = buildSegments(
      actions,
      this.segmentCommits.map((c) => ({ ...c, roots: mapRoots(c.roots) })),
      this.frames.latency,
      this.frames.loaf
    );
    const commits = this.totals.commits;
    const commitsInScope = this.totals.commitsInScope;
    return {
      schema: RECORDING_SCHEMA,
      version: 1,
      createdAt: new Date().toISOString(),
      ...(this.options.label ? { label: this.options.label } : {}),
      tool: { version: this.config.version, source: this.options.source ?? 'panel', plugins: this.deps.plugins.info() },
      page: {
        url: location.href,
        title: document.title,
        viewport: `${innerWidth}×${innerHeight}`,
        dpr: devicePixelRatio,
        userAgent: navigator.userAgent,
      },
      react: { version: reactVersion(), roots: this.roots.length, profileTimings: this.rootList.some((r) => r.renderMs > 0) },
      ...(this.options.meta ? { meta: this.options.meta } : {}),
      options: optionsJson(this.options),
      startedAt: this.startedAt.toISOString(),
      durationMs,
      scope: this.scope
        ? {
            name: this.scope.name,
            source: this.scope.source,
            path: this.scope.ancestorNames().slice(-6),
            state: this.scope.state,
            remounts: this.scope.remounts,
            lostAtMs: this.scope.lostAtMs,
          }
        : null,
      totals: {
        commits,
        commitsInScope,
        renders: this.totals.renders,
        mounts: this.totals.mounts,
        rendersPerCommit: commits ? +(this.totals.renders / commits).toFixed(1) : 0,
        rendersPerScopeCommit: commitsInScope ? +(this.totals.renders / commitsInScope).toFixed(1) : 0,
        rendersFromOutside: this.totals.rendersFromOutside,
        rendersWithoutDom: this.totals.rendersWithoutDom,
        domTextChanges: this.dom.counts.text,
        causesDropped: this.totals.causesDropped,
        lanes: this.totals.lanes,
      },
      roots: rootsOrdered.slice(0, orderedInside.length),
      outsideRoots: rootsOrdered.slice(orderedInside.length),
      components: [...this.components]
        .sort((a, b) => b[1].renders - a[1].renders)
        .slice(0, 150)
        .map(([name, s]) => ({
          name,
          renders: s.renders,
          withoutDom: s.withoutDom,
          byParent: s.byParent,
          ...(s.memo ? { memo: true as const } : {}),
          reasons: topEntries(s.reasons, 4),
        })),
      ...(this.watch.size
        ? {
            watch: Object.fromEntries(
              [...this.watch].map(([name, w]) => [
                name,
                {
                  mounted: w.mounted,
                  renders: w.renders,
                  byRoot: [...w.byRoot]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([agg, n]) => [agg ? remap.get(agg.index)! : null, n] as [number | null, number]),
                },
              ])
            ),
          }
        : {}),
      ...(this.zones.size ? { zones: Object.fromEntries(this.zones) } : {}),
      causes: [...this.causeStats.values()].sort((a, b) => b.commits - a.commits),
      actions,
      segments,
      latency: this.frames.latency,
      timeline: {
        entries: this.timeline.map((e) => ({
          ...e,
          ...(e.roots ? { roots: mapRoots(e.roots) } : {}),
          ...(e.outside !== undefined ? { outside: remap.get(e.outside) } : {}),
        })),
        truncated: this.truncated,
      },
      bigCommits: this.bigCommits,
      frames: { longTasks: this.frames.longTasks, loaf: this.frames.loaf },
      dom: { ...this.dom.counts },
      navigations: this.navigations,
      hmr: this.hmr,
      conditions: this.conditions,
      ...(Object.keys(changed).length ? { conditionsChanged: changed } : {}),
      plugins: sections,
      overhead: {
        commitMs: +(this.hook?.overhead.commitMs ?? 0).toFixed(1),
        maxCommitMs: +(this.hook?.overhead.maxCommitMs ?? 0).toFixed(1),
        overlayMs: +this.overlayMs.toFixed(1),
      },
      warnings: this.warnings,
      errors: this.errors,
    };
  }
}

function isMounted(fiber: Fiber): boolean {
  const root = hostRootOf(fiber);
  if (!root) return false;
  let top: Fiber | null = fiber;
  while (top?.return) top = top.return;
  return top === root.current || top === root.current.alternate;
}

function optionsJson(options: RecordOptions): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(options)) {
    if (key === 'scope' || key === 'meta' || value === undefined) continue;
    out[key] = value as JsonValue;
  }
  return out;
}
