import { sameContent } from '../shared/same-content';
import { medianGap, topEntries } from '../shared/stats';
import {
  RECORDING_SCHEMA,
  type ActionRecord,
  type CauseStat,
  type Conditions,
  type HookInfo,
  type JsonValue,
  type Navigation,
  type Primitive,
  type RecordingV2,
  type RootStat,
  type SessionEvent,
  type CommitRecord,
  type ReasonInfo,
  type ChainLink,
  type ChainNodeInfo,
  type CommitWay,
} from '../shared/schema';
import { buildSegments, eventName, USER_EVENTS, type SegmentCommit } from '../shared/segments';
import { safeUrl } from '../shared/url';
import { ActionTracker } from './actions';
import { hookCommits, hookOwner, laneLabel, RecorderError, type CommitHook, type CommitInfo } from './commit-hook';
import { DomWatcher, touchedHas } from './dom';
import { MemoHits } from './memo-hits';
import { FrameWatcher } from './env/frames';
import { trackHistory } from './env/navigations';
import {
  mountedInPlace,
  findRoots,
  generatedSourceOf,
  hasProfileTimings,
  hostRootOf,
  isComposite,
  isHost,
  isLibraryFiber,
  isProvider,
  wrapsProvider,
  nameOf,
  nearestHosts,
  reactVersion,
  siteKeyOf,
  sourceOf,
  sourcesUnavailable,
  Tag,
  type Fiber,
  type FiberRoot,
} from './fiber';
import { contextKey, reasonText, textOf } from '../shared/summary';
import { inspectHooks, type InspectedHooks } from './hook-names';
import type { CauseEvent, PluginHost } from './plugins';
import { didRender, hookTypeAt, parentReason, reasonsOf, snapshotOf, type Reason, type Snapshot } from './reasons';
import { ScopeTracker, type ScopeHandle, type ScopeResolution } from './scope';
import { updateOrigin, type UpdateOrigin } from './env/origin';
import { runningTimer, runningTimerLibrary, setTimerSink } from './env/timers';

export interface EngineConfig {
  version: string;
  projectRoot: string;
  wrapperPattern: string;
  actions: { values: boolean; secretSelector: string };
  maxDurationMs: number;
  bigCommit: number;
  timelineLimit: number;
  /** Timers are wrapped at boot; off leaves the page's timers alone and timer causes out. */
  timers?: boolean;
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
  /** Count animation frames for a rough fps; the commit scan itself costs frame time, so trust long frames more. */
  frames?: boolean;
  bigCommit?: number;
  timeline?: number;
  meta?: Record<string, Primitive>;
  /** Work out parent-caused reasons for the first instances of a component per commit only; render counts stay exact. */
  sampleReasons?: boolean;
}

export interface HighlightSink {
  /** The panel's toggle; a recording draws and counts as highlighted only while it is on. */
  enabled?: boolean;
  /** `mounted`: the tops of subtrees mounted into the tree, outlined apart from renders. */
  flash(pairs: Array<[Element, string, Fiber]>, withoutDom: Set<Fiber>, mounted?: Set<Fiber>): void;
  /** Time spent measuring and drawing outside commits since the last call. */
  takeCostMs?(): number;
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
  /** React 19: the built position of the call site, which the dev server maps into `source` when saving. */
  generated?: { url: string; line: number; column: number };
  path: string;
  outside: boolean;
  hits: number;
  instances: number;
  inCommit: number;
  lastCommit: number;
  cascade: number;
  times: number[];
  reasons: Map<number, number>;
  causes: Map<string, number>;
  lanes: Map<string, number>;
  noDomChange: number;
  renderMs: number;
  mounts: number;
  library: boolean;
  hookIdx: Set<number>;
  contexts: Map<string, object>;
  latest: WeakRef<Fiber> | null;
}

interface ComponentAgg {
  renders: number;
  mounts: number;
  library: boolean;
  wrapper: boolean;
  withoutDom: number;
  byParent: number;
  memo: boolean;
  reasons: Map<number, number>;
  /** Chain node id → renders that came down that chain from their root. */
  chains: Map<number, number>;
  sampled?: boolean;
}

/** A link of a render chain: who rendered and why, and the link above it; a root's link has none above. */
interface ChainNode {
  up: number;
  name: string;
  reason: number;
  root?: RootAgg;
}

interface CommitState {
  t: number;
  renders: number;
  renderMs: number;
  noDom: number;
  cascade: Map<RootAgg, number>;
  /** With sampled reasons: how many parent reasons each component has had worked out in this commit. */
  sampledParents: Map<ComponentAgg, number> | null;
  reasons: Map<RootAgg, Set<number>>;
  outside: RootAgg | null;
  pairs: Array<[Element, string, Fiber]>;
  withoutDom: Set<Fiber>;
  mounted: Set<Fiber>;
  touched: Set<Fiber>;
  /** Renders by chain link in this commit, its cascade as a tree; null when recording fast. */
  ways: Map<number, number> | null;
  /** Milliseconds each link took, its subtree included (`actualDuration`), when the build has profile timings. */
  wayMs: Map<number, number> | null;
}

/** The app's components above a fiber, nearest first, shared by every fiber below: text only when a root needs it. */
interface PathRef {
  name: string;
  up: PathRef | null;
}

const PATH_DEPTH = 4;

function pathText(ref: PathRef | null, base: string[]): string {
  const names: string[] = [];
  for (let r = ref; r && names.length < PATH_DEPTH; r = r.up) names.push(r.name);
  for (let i = 0; i < base.length && names.length < PATH_DEPTH; i++) names.push(base[i]);
  return names.join(' < ');
}

/** `pending` carries the component an outline will be labelled with, and whether it is a package's own. */
type StackItem = [
  fiber: Fiber,
  parentRendered: boolean,
  path: PathRef | null,
  rootKey: string | null,
  pending: [string, Fiber, boolean] | null,
  zone: string | null,
  chain: number
];

const MAX_TIMES = 2000;
/** With sampled reasons: parent reasons worked out per component per commit. */
const SAMPLED_PARENTS = 50;
/** Stacks are read only while a commit window is unexplained; a burst of updates does not pay for all of them. */
const MAX_UPDATE_NOTES = 10;
const MAX_CAUSE_KEYS = 300;
/** Distinct links of render chains; past it, chains are not kept, counts and reasons still are. */
const MAX_CHAIN_NODES = 50_000;
const CHAINS_PER_COMPONENT = 3;
const MAX_CHAIN_LINKS = 20;
/** Links of a commit's cascade tree kept, the busiest; the links above them come along. */
const WAYS_PER_COMMIT = 30;
const MAX_SEGMENT_COMMITS = 20_000;

const currentEventType = (): string | undefined => {
  const event = (globalThis as { event?: Event }).event;
  return event && typeof event.type === 'string' ? event.type : undefined;
};

/** Constructor of a socket, worker or channel whose message is being handled; the scheduler's own MessagePort is not a cause. */
const messageSource = (): string | undefined => {
  const event = (globalThis as { event?: Event }).event;
  const target = event?.type === 'message' ? event.target : null;
  if (!target || target === globalThis || (typeof MessagePort !== 'undefined' && target instanceof MessagePort)) return undefined;
  return (target as object).constructor?.name || undefined;
};

const shallowEqual = (x: unknown, y: unknown) => {
  const a = x as Record<string, unknown> | null;
  const b = y as Record<string, unknown> | null;
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
};

const medianGapMs = (times: number[]) => {
  const gap = medianGap(times);
  return gap === null ? null : Math.round(gap);
};

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
  private readonly reasonIdsByFields = new Map<string, number>();
  private readonly memoHits = new MemoHits((f) => sourceOf(f, this.config.projectRoot));
  private readonly reasonList: ReasonInfo[] = [];
  private readonly components = new Map<string, ComponentAgg>();
  private readonly watch = new Map<string, { mounted: number; renders: number; byRoot: Map<RootAgg | null, number> }>();
  private readonly zoneNodes = new Map<Element, string>();
  private readonly zones = new Map<string, { renders: number; mounted: number; found: boolean }>();
  private readonly causeStats = new Map<string, CauseStat>();
  private readonly commitList: CommitRecord[] = [];
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
  /** Whether childLanes can be trusted to point at fresh updates; React 19 answers no and the walk widens. */
  private narrowUpdateWalk = true;
  private hook: CommitHook | null = null;
  private stopHistory: (() => void) | null = null;
  private roots: FiberRoot[] = [];
  private conditions: Conditions = {};
  private truncated = false;
  /** Commits so far, kept or not: the list stops at the timeline limit, the ids do not. */
  private commitSeq = 0;
  private stopped = false;
  private overlayMs = 0;
  private highlighted = false;
  /** Fibers a cause already names since the last commit. */
  private claimed = new WeakSet<Fiber>();
  /** Where updates of this commit window came from, used only for the components no other event explains. */
  private origins: Array<UpdateOrigin & { fibers: Set<Fiber>; event: string | undefined }> = [];
  private frameCount = 0;
  private counting = false;
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

  /**
   * Left out of a path: an unnamed wrapper, a provider-only component, a package's own. Cached by type, as the
   * answer is the same for every instance.
   */
  private readonly structuralByType = new WeakMap<object, boolean>();

  private structural(name: string, f: Fiber): boolean {
    const type = f.type as object | null;
    const keyed = type !== null && (typeof type === 'object' || typeof type === 'function');
    const known = keyed ? this.structuralByType.get(type) : undefined;
    if (known !== undefined) return known;
    const result = this.wrapperRe.test(name) || isProvider(name) || wrapsProvider(f) || isLibraryFiber(f);
    if (keyed) this.structuralByType.set(type, result);
    return result;
  }

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
              projectRoot: this.config.projectRoot,
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
    this.deps.plugins.start(this.pluginSession(), this.t0);
    if (this.scope) this.dom.setScopeHosts(this.scopeHosts());
    this.dom.start();
    this.hook = hookCommits(
      this.roots,
      this.options.source ?? 'panel',
      (info) => this.onCommit(info),
      () => this.noteUpdate()
    );
    // A store or query notifies its subscribers before the recorder hears about it, so the fibers React just
    // marked are the ones this event updated.
    this.deps.plugins.targets = () => this.freshUpdates();
    setTimerSink({
      after: (text, ours, library, startedAt) => {
        const plugins = this.deps.plugins;
        if (!this.freshUpdates(false).size) return;
        // A timer of the recorder's own — the panel's clock, its outlines — takes no one's updates.
        if (ours()) return;
        if (plugins.hasWaiting && plugins.deliver(library(), () => this.freshUpdates(), startedAt)) return;
        plugins.emit('core', { type: text() }, this.freshUpdates());
      },
    });
    this.frames.start();
    if (this.options.frames) {
      this.counting = true;
      const tick = () => {
        if (!this.counting) return;
        this.frameCount++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
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

  /** What the panel shows while the recording runs: counters and the roots leading so far, with their reason. */
  live() {
    const elapsedMs = Math.round(this.now());
    return {
      commits: this.totals.commits,
      commitsInScope: this.totals.commitsInScope,
      renders: this.totals.renders,
      rendersPerSec: elapsedMs > 200 ? Math.round((this.totals.renders * 1000) / elapsedMs) : 0,
      elapsedMs,
      scopeState: this.scope?.state ?? null,
      topRoots: [...this.rootList]
        .sort((a, b) => b.cascade - a.cascade)
        .slice(0, 3)
        .map((agg) => ({
          name: agg.name,
          hits: agg.hits,
          perHit: agg.hits ? Math.round(agg.cascade / agg.hits) : 0,
          ...(() => {
            const info = this.reasonList[topEntries(agg.reasons, 1)[0]?.[0] ?? -1];
            // The sentence for whoever prints it, the fields for whoever draws them.
            return info ? { reason: textOf(info), info } : { reason: '' };
          })(),
        })),
    };
  }

  stop(): RecordingV2 {
    if (this.stopped) throw new RecorderError('NOT_RECORDING', 'recording already stopped');
    this.stopped = true;
    setTimerSink(null);
    this.deps.plugins.targets = null;
    const hookErrors = this.hook?.stop() ?? [];
    this.errors.push(...hookErrors);
    this.dom.stop();
    this.frames.stop();
    this.counting = false;
    this.actions?.stop();
    this.stopHistory?.();
    const sections = this.deps.plugins.stop(this.pluginSession());
    this.warnings.push(...this.deps.plugins.warnings.splice(0));
    const conditionsAfter = this.readConditions();
    this.overlayMs += this.deps.highlight?.takeCostMs?.() ?? 0;
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
    const source = event === 'message' ? messageSource() : undefined;
    this.claimed = new WeakSet();
    const origins = this.origins;
    this.origins = [];
    const timer = runningTimer();
    // A commit inside a library's timer (a legacy root): its waiting events are the cause, the timer is how they came.
    if (timer && !(this.deps.plugins.hasWaiting && this.deps.plugins.deliver(runningTimerLibrary(), () => null)))
      this.deps.plugins.emit('core', { type: timer });
    const causes = this.deps.plugins.drain();
    this.deps.plugins.commit(this.pluginSession());
    const c: CommitState = {
      t,
      renders: 0,
      renderMs: 0,
      noDom: 0,
      cascade: new Map(),
      sampledParents: this.options.sampleReasons ? new Map() : null,
      reasons: new Map(),
      outside: null,
      pairs: [],
      withoutDom: new Set(),
      mounted: new Set(),
      ways: this.options.sampleReasons ? null : new Map(),
      wayMs: this.options.sampleReasons ? null : new Map(),
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
    this.finishCommit(c, causes, lane, event, source, origins);
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
      if (name && !this.structural(name, fibers[i])) names.push(name);
    }
    return names.join(' < ');
  }

  private scan(start: Fiber, parentRendered: boolean, path: string, rootKey: string | null, c: CommitState, isolate: boolean) {
    const highlight = Boolean(this.deps.highlight) && this.deps.highlight!.enabled !== false && this.options.highlight !== false;
    if (highlight) this.highlighted = true;
    const base = path ? path.split(' < ') : [];
    const stack: StackItem[] = [[start, parentRendered, null, rootKey, null, null, -1]];
    while (stack.length) {
      const [f, parentDid, currentPath, currentKey, pending, zoneTag, currentChain] = stack.pop()!;
      let chain = currentChain;
      const prev = this.prevOf(f);
      const rendered = didRender(prev, f);
      const name = nameOf(f);
      let key = currentKey;
      let nextPending = pending;
      const zone = isHost(f) && this.zoneNodes.size ? this.zoneNodes.get(f.stateNode) ?? zoneTag : zoneTag;
      if (name && !prev && isComposite(f)) {
        // A remount costs more than a render and changes no count of renders: it gets an outline of its own.
        if (highlight && !nextPending && mountedInPlace(f)) {
          nextPending = [name, f, isLibraryFiber(f)];
          c.mounted.add(f);
        }
        this.totals.mounts++;
        this.componentOf(name, f).mounts++;
        const agg = currentKey ? this.rootsByKey.get(currentKey) : undefined;
        if (agg) agg.mounts++;
      }
      if (name && rendered) {
        c.renders++;
        this.totals.renders++;
        this.memoHits.track(name, f, prev!.state);
        const wasted = !touchedHas(c.touched, f);
        const comp = this.componentOf(name, f);
        comp.renders++;
        if (wasted) {
          comp.withoutDom++;
          c.noDom++;
          this.totals.rendersWithoutDom++;
          c.withoutDom.add(f);
        }
        let reasons: Reason[] | null = null;
        // The parent rendered but handed the same props (children passed through, or equal props to memo): the
        // parent did not cause this render, the component's own state, store or context did.
        const ownWork =
          parentDid &&
          isComposite(f) &&
          prev !== undefined &&
          (prev.props === f.memoizedProps ||
            ((f.tag === Tag.MemoComponent || f.tag === Tag.SimpleMemoComponent) && shallowEqual(prev.props, f.memoizedProps)));
        let rootAgg: RootAgg | null = null;
        if (!parentDid || ownWork) {
          const hit = this.hitRoot(f, name, pathText(currentPath, base), prev!, c, false);
          key = hit.agg.key;
          reasons = hit.reasons;
          rootAgg = hit.agg;
        } else if (isComposite(f) && !isProvider(name)) {
          comp.byParent++;
          const sampled = c.sampledParents?.get(comp) ?? 0;
          if (sampled < SAMPLED_PARENTS) {
            c.sampledParents?.set(comp, sampled + 1);
            reasons = parentReason(prev!, f, this.deps.plugins);
          } else comp.sampled = true;
        }
        let firstId = -1;
        for (const reason of reasons ?? []) {
          const id = this.reasonId(reason);
          if (firstId < 0) firstId = id;
          comp.reasons.set(id, (comp.reasons.get(id) ?? 0) + 1);
        }
        // Fast recordings keep no chains: they are there to cost less, and a chain is a sample of nothing.
        if (rootAgg) {
          chain = this.options.sampleReasons ? -1 : this.chainLink(-1, name, firstId, rootAgg);
          if (chain >= 0) this.countWay(c, chain, f);
        }
        // A link of its own for what the app wrote; a package's internals and bare wrappers pass the chain through.
        else if (chain >= 0 && isComposite(f) && !isProvider(name) && !comp.library && !comp.wrapper) {
          chain = this.chainLink(chain, name, firstId);
          comp.chains.set(chain, (comp.chains.get(chain) ?? 0) + 1);
          this.countWay(c, chain, f);
        }
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
        // The outline says the app's component, not the UI-kit wrapper it happens to sit under.
        if (highlight && isComposite(f) && (!nextPending || (nextPending[2] && !isLibraryFiber(f)))) nextPending = [name, f, isLibraryFiber(f)];
      }
      // A package's own render is outlined only when nothing of the app's is above it — a router re-rendering
      // would otherwise draw a box over the whole page, on top of the ones worth looking at.
      if (nextPending && !nextPending[2] && (isHost(f) || f.tag === Tag.HostText)) {
        const el = isHost(f) ? (f.stateNode as Element) : (f.stateNode as Text).parentElement;
        if (el) c.pairs.push([el, nextPending[0], nextPending[1]]);
        nextPending = null;
      }
      // A fiber that did not render has the snapshot it had: nothing to write.
      if (rendered || !prev) this.remember(f);
      if (!(isolate && f === start) && f.sibling) stack.push([f.sibling, parentDid, currentPath, currentKey, pending, zoneTag, currentChain]);
      const untouched = this.prune && f.alternate !== null && f.child === f.alternate.child;
      if (f.child && !untouched) {
        const childPath = name && !this.structural(name, f) ? { name, up: currentPath } : currentPath;
        stack.push([f.child, rendered, childPath, rendered ? key : currentKey, nextPending, zone, rendered ? chain : -1]);
      }
    }
  }

  private readonly chainNodes: ChainNode[] = [];
  /** Interned links: parent id → name → reason id → node id. */
  private readonly chainIndex = new Map<number, Map<string, Map<number, number>>>();
  /** A root's links are told apart by the root itself: two roots of one name start two chains. */
  private readonly rootChains = new Map<RootAgg, Map<number, number>>();

  private chainLink(up: number, name: string, reason: number, root?: RootAgg): number {
    let byReason: Map<number, number> | undefined;
    if (root) {
      byReason = this.rootChains.get(root);
      if (!byReason) this.rootChains.set(root, (byReason = new Map()));
    } else {
      let byName = this.chainIndex.get(up);
      if (!byName) this.chainIndex.set(up, (byName = new Map()));
      byReason = byName.get(name);
      if (!byReason) byName.set(name, (byReason = new Map()));
    }
    const known = byReason.get(reason);
    if (known !== undefined) return known;
    if (this.chainNodes.length >= MAX_CHAIN_NODES) return -1;
    const id = this.chainNodes.length;
    this.chainNodes.push({ up, name, reason, ...(root ? { root } : {}) });
    byReason.set(reason, id);
    return id;
  }

  /** The links of a chain from its root down; one past 20 keeps its root, the two below it and the last sixteen. */
  private chainLinks(id: number, rootIndex: (agg: RootAgg) => number | undefined): ChainLink[] {
    const links: ChainLink[] = [];
    for (let at = id; at >= 0; at = this.chainNodes[at].up) {
      const node = this.chainNodes[at];
      const root = node.root ? rootIndex(node.root) : undefined;
      links.push({ name: node.name, ...(node.reason >= 0 ? { reason: node.reason } : {}), ...(root !== undefined ? { root } : {}) });
    }
    links.reverse();
    return links.length > MAX_CHAIN_LINKS
      ? [...links.slice(0, 3), { name: '…', skipped: links.length - (MAX_CHAIN_LINKS - 1) }, ...links.slice(-(MAX_CHAIN_LINKS - 4))]
      : links;
  }

  private countWay(c: CommitState, chain: number, f: Fiber) {
    if (!c.ways) return;
    c.ways.set(chain, (c.ways.get(chain) ?? 0) + 1);
    if (c.wayMs && hasProfileTimings(f)) c.wayMs.set(chain, (c.wayMs.get(chain) ?? 0) + f.actualDuration!);
  }

  /**
   * A commit's busiest links and its slowest, and every link above them, so the tree they make has no holes:
   * `[link, renders]`, and the milliseconds when the build times renders.
   */
  private commitWays(ways: Map<number, number>, wayMs: Map<number, number> | null): Array<[number, number] | [number, number, number]> {
    const ids = new Set([
      ...topEntries(ways, WAYS_PER_COMMIT).map(([id]) => id),
      ...(wayMs?.size ? topEntries(wayMs, WAYS_PER_COMMIT / 2).map(([id]) => id) : []),
    ]);
    for (const id of [...ids]) for (let up = this.chainNodes[id].up; up >= 0 && !ids.has(up); up = this.chainNodes[up].up) ids.add(up);
    return [...ids].map((id) => {
      const ms = wayMs?.get(id);
      return ms !== undefined ? [id, ways.get(id) ?? 0, +ms.toFixed(2)] : [id, ways.get(id) ?? 0];
    });
  }

  /** The links the commits point at, numbered afresh from 0, and each commit's links in those numbers. */
  private exportNodes(rootIndex: (agg: RootAgg) => number | undefined) {
    const used = new Set<number>();
    for (const commit of this.commitList) for (const [id] of commit.ways ?? []) used.add(id);
    const ids = [...used].sort((a, b) => a - b);
    const renumber = new Map(ids.map((id, i) => [id, i]));
    const nodes: ChainNodeInfo[] = ids.map((id) => {
      const node = this.chainNodes[id];
      const root = node.root ? rootIndex(node.root) : undefined;
      return {
        up: node.up >= 0 ? renumber.get(node.up) ?? -1 : -1,
        name: node.name,
        ...(node.reason >= 0 ? { reason: node.reason } : {}),
        ...(root !== undefined ? { root } : {}),
      };
    });
    return { nodes, renumber };
  }

  private componentOf(name: string, f: Fiber): ComponentAgg {
    let comp = this.components.get(name);
    if (!comp) {
      comp = {
        renders: 0,
        mounts: 0,
        library: isLibraryFiber(f),
        wrapper: this.wrapperRe.test(name) || isProvider(name) || wrapsProvider(f),
        withoutDom: 0,
        byParent: 0,
        memo: f.tag === Tag.MemoComponent || f.tag === Tag.SimpleMemoComponent,
        reasons: new Map(),
        chains: new Map(),
      };
      this.components.set(name, comp);
    }
    return comp;
  }

  private hitRoot(f: Fiber, name: string, path: string, prev: Snapshot, c: CommitState, outside: boolean): { agg: RootAgg; reasons: Reason[] } {
    const source = sourceOf(f, this.config.projectRoot);
    const generated = generatedSourceOf(f);
    // Two roots of the same name in one file are told apart by the call site, which the source alone carries only
    // on React 18; on 19 it is the built position, and it keys them just as well before the server maps it.
    const key = `${outside ? 'outside|' : ''}${name}|${siteKeyOf(f, this.config.projectRoot) || source}|${path}`;
    let agg = this.rootsByKey.get(key);
    if (!agg) {
      agg = {
        index: this.rootList.length,
        key,
        name,
        source,
        generated,
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
        mounts: 0,
        library: isLibraryFiber(f),
        hookIdx: new Set(),
        contexts: new Map(),
        latest: null,
      };
      this.rootsByKey.set(key, agg);
      this.rootList.push(agg);
      this.emit({
        k: 'root',
        i: agg.index,
        key,
        name,
        source,
        path,
        ...(generated ? { generatedSource: generated } : {}),
        ...(outside ? { outside: true as const } : {}),
      });
    }
    if (agg.lastCommit !== this.totals.commits) {
      agg.lastCommit = this.totals.commits;
      agg.hits++;
      agg.inCommit = 0;
      if (agg.times.length < MAX_TIMES) agg.times.push(c.t);
      // One instance is enough to name the hooks by at stop: one reference a commit, not one a hit.
      agg.latest = new WeakRef(f);
    }
    agg.inCommit++;
    agg.instances = Math.max(agg.instances, agg.inCommit);
    const ids = c.reasons.get(agg) ?? new Set<number>();
    const reasons = reasonsOf(prev, f, this.deps.plugins);
    for (const reason of reasons) {
      const id = this.reasonId(reason);
      agg.reasons.set(id, (agg.reasons.get(id) ?? 0) + 1);
      if (reason.hook !== undefined) agg.hookIdx.add(reason.hook);
      if (reason.contextObject && reason.context) agg.contexts.set(contextKey(reason.context), reason.contextObject);
      ids.add(id);
    }
    c.reasons.set(agg, ids);
    if (!outside && !touchedHas(c.touched, f)) agg.noDomChange++;
    if (hasProfileTimings(f)) {
      agg.renderMs += f.actualDuration!;
      c.renderMs += f.actualDuration!;
    }
    if (!outside) c.cascade.set(agg, c.cascade.get(agg) ?? 0);
    return { agg, reasons };
  }

  private finishCommit(
    c: CommitState,
    causes: CauseEvent[],
    lane: string | undefined,
    event: string | undefined,
    source: string | undefined,
    origins: Array<UpdateOrigin & { fibers: Set<Fiber>; event: string | undefined }>
  ) {
    if (lane) this.totals.lanes[lane] = (this.totals.lanes[lane] ?? 0) + 1;
    if (!c.renders) {
      this.totals.causesDropped += causes.length;
      return;
    }
    this.totals.commitsInScope++;
    const keys = new Set<string>();
    const targets = new Map<string, Set<Fiber>>();
    // When something in this task did mark work, a write that marked none is not what the commit is about. When
    // nothing could say — a query cache, a navigation — the events stand as they are.
    const someoneAimed = causes.some((cause) => cause.fibers?.size);
    for (const cause of causes) {
      if (someoneAimed && cause.aimed && !cause.fibers) {
        this.totals.causesDropped++;
        continue;
      }
      const key = this.attachCause(cause);
      keys.add(key);
      if (cause.fibers?.size) targets.set(key, new Set([...(targets.get(key) ?? []), ...cause.fibers]));
    }
    if (event && USER_EVENTS.has(event)) keys.add(this.attachCause({ plugin: 'core', type: `input ${eventName(event)}`, atMs: c.t }));
    else if (source) keys.add(this.attachCause({ plugin: 'core', type: `message ${source}`, atMs: c.t }));
    // Where the update came from, for the components no store, query or timer event claimed. An update made while
    // the person's event was being handled is already told by `input`; an effect flushed in the same window is not.
    const claimedByEvents = new Set([...targets.values()].flatMap((set) => [...set]));
    for (const origin of origins) {
      if (origin.kind === 'update' && origin.event && origin.event === event) continue;
      if ([...origin.fibers].some((f) => claimedByEvents.has(f))) continue;
      const key = this.attachCause({ plugin: 'core', type: origin.text, atMs: c.t });
      keys.add(key);
      targets.set(key, new Set([...(targets.get(key) ?? []), ...origin.fibers]));
    }
    if (!keys.size) keys.add(this.attachCause({ plugin: 'core', type: 'none', atMs: c.t }));
    for (const key of keys) this.causeStats.get(key)!.commits++;
    const involved = new Set<RootAgg>([...c.cascade.keys(), ...(c.outside ? [c.outside] : [])]);
    const fiberOf = (agg: RootAgg) => agg.latest?.deref();
    // A cause that knows its components goes only to their roots, unless none of them started a cascade here.
    const hits = (key: string, agg: RootAgg) => {
      const set = targets.get(key);
      if (!set) return true;
      const f = fiberOf(agg);
      return (f !== undefined && set.has(f)) || ![...involved].some((other) => set.has(fiberOf(other)!));
    };
    for (const agg of involved) {
      const own = [...keys].filter((key) => hits(key, agg));
      // Aimed causes that missed every root here would leave it without any: a late subscriber, or an event the
      // recorder could not follow. Then the root takes the commit's causes as they are.
      for (const key of own.length ? own : keys) agg.causes.set(key, (agg.causes.get(key) ?? 0) + 1);
      if (lane && agg.lastCommit === this.totals.commits) agg.lanes.set(lane, (agg.lanes.get(lane) ?? 0) + 1);
    }
    const ranked = [...c.cascade].sort((a, b) => b[1] - a[1]);
    const roots = ranked.slice(0, 5).map(([agg, n]) => [agg.index, n] as [number, number]);
    const previous = this.commitList[this.commitList.length - 1];
    const record: CommitRecord = {
      i: this.commitSeq++,
      atMs: c.t,
      ...(previous ? { sinceMs: +(c.t - previous.atMs).toFixed(1) } : {}),
      renders: c.renders,
      ...(c.renderMs ? { ms: +c.renderMs.toFixed(2) } : {}),
      ...(lane ? { lane } : {}),
      ...(event ? { event } : {}),
      ...(keys.size ? { causeIds: [...keys].map((key) => this.causeStats.get(key)!.i) } : {}),
      ...(ranked.length
        ? { roots: ranked.slice(0, 10).map(([agg, hits]) => ({ i: agg.index, hits, reasonIds: [...(c.reasons.get(agg) ?? [])] })) }
        : {}),
      ...(c.outside ? { outside: c.outside.index } : {}),
      ...(c.noDom ? { noDom: c.noDom } : {}),
      ...(c.ways?.size ? { ways: this.commitWays(c.ways, c.wayMs) } : {}),
    };
    const limit = this.options.timeline ?? this.config.timelineLimit;
    if (this.commitList.length < limit) this.commitList.push(record);
    else this.truncated = true;
    if (c.renders >= (this.options.bigCommit ?? this.config.bigCommit)) this.bigCommits.push(record.i);
    if (this.segmentCommits.length < MAX_SEGMENT_COMMITS) this.segmentCommits.push({ i: record.i, t: c.t, n: c.renders, event, roots });
    this.emit({
      k: 'commit',
      t: c.t,
      n: c.renders,
      ...(record.ms ? { ms: record.ms } : {}),
      ...(lane ? { lane } : {}),
      ...(event ? { event } : {}),
      roots: ranked.map(([agg, n]) => [agg.index, n, [...(c.reasons.get(agg) ?? [])]] as [number, number, number[]]),
      causes: [...keys],
      ...(c.outside ? { outside: c.outside.index } : {}),
      ...(c.noDom ? { noDom: c.noDom } : {}),
    });
    if (c.pairs.length && this.deps.highlight) {
      const started = performance.now();
      this.deps.highlight.flash(c.pairs, c.withoutDom, c.mounted);
      this.overlayMs += performance.now() - started;
    }
  }

  private attachCause(cause: CauseEvent): string {
    let key = `${cause.plugin}:${cause.type}`;
    // A page with very many distinct call sites should not grow the cause list without end.
    if (!this.causeStats.has(key) && this.causeStats.size >= MAX_CAUSE_KEYS) key = `${cause.plugin}:other`;
    let stat = this.causeStats.get(key);
    if (!stat) {
      stat = { i: this.causeStats.size, key, plugin: cause.plugin, type: key.slice(cause.plugin.length + 1), events: 0, commits: 0 };
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

  /**
   * An update was just scheduled and nothing else explains it: no user event, no timer callback, no store or query
   * event yet. The stack still holds the code that asked for it, so the cause names that code.
   */
  private noteUpdate() {
    if (this.origins.length >= MAX_UPDATE_NOTES || runningTimer()) return;
    // No claim: the store or query that is about to report this update should keep the right to name it.
    const fibers = this.freshUpdates(false);
    if (!fibers.size) return;
    const origin = updateOrigin();
    if (origin) this.origins.push({ ...origin, fibers, event: currentEventType() });
  }

  /**
   * Unclaimed fibers updated since the last commit. React 19 sets childLanes only at render, so once a narrow walk
   * misses what a wide one finds, the walk stays wide.
   */
  private freshUpdates(claim = true): Set<Fiber> {
    const lanes = this.roots.reduce((all, root) => all | (root.pendingLanes ?? 0), 0);
    if (!lanes) return new Set();
    if (!this.narrowUpdateWalk) return this.scanUpdates(lanes, false, claim);
    const narrow = this.scanUpdates(lanes, true, claim);
    if (narrow.size) return narrow;
    const wide = this.scanUpdates(lanes, false, claim);
    if (wide.size) this.narrowUpdateWalk = false;
    return wide;
  }

  private scanUpdates(lanes: number, narrow: boolean, claim: boolean): Set<Fiber> {
    const out = new Set<Fiber>();
    const stack = this.roots.map((root) => root.current);
    const limit = narrow ? 2000 : 20_000;
    for (let visits = 0; stack.length && visits < limit; visits++) {
      const f = stack.pop()!;
      if ((f.lanes ?? 0) & lanes && !this.claimed.has(f)) {
        out.add(f);
        if (f.alternate) out.add(f.alternate);
        if (claim) {
          this.claimed.add(f);
          if (f.alternate) this.claimed.add(f.alternate);
        }
      }
      for (let child = f.child; child; child = child.sibling)
        if (!narrow || ((child.lanes ?? 0) | (child.childLanes ?? 0)) & lanes) stack.push(child);
    }
    return out;
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

  private pluginSession() {
    return { scope: this.scopeInfo, findFibers: (pred: (f: Fiber) => boolean, limit?: number) => this.findFibers(pred, limit) };
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

  /** One entry per distinct reason; everything else — roots, components, commits — points at it by id. */
  private reasonId(reason: Reason): number {
    // A parent reason — most renders of a big list — has four fields of its own, keyed without a copy of them.
    const fieldKey =
      reason.kind === 'parent'
        ? `parent|${reason.changed?.join(',') ?? ''}|${reason.sameRef?.join(',') ?? ''}|${reason.children ? 1 : 0}${reason.equal ? 1 : 0}`
        : JSON.stringify({ ...reason, contextObject: undefined });
    const known = this.reasonIdsByFields.get(fieldKey);
    if (known !== undefined) return known;
    // The fields are a cheaper key than the sentence; the sentence decides only for a set of fields not seen yet.
    const { contextObject: _context, ...fields } = reason;
    const text = reasonText(fields);
    let id = this.reasonIds.get(text);
    if (id === undefined) {
      id = this.reasonIds.size;
      this.reasonIds.set(text, id);
      // The sentence is the key that tells two reasons apart, and the readers build it again from the fields.
      const info: ReasonInfo = { i: id, ...fields };
      this.reasonList.push(info);
      this.emit({ k: 'reason', info });
    }
    this.reasonIdsByFields.set(fieldKey, id);
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
      url: safeUrl(location.pathname + location.search),
      dpr: devicePixelRatio,
      ...this.deps.plugins.conditions(),
    };
  }

  // ---- result ----------------------------------------------------------------------------------------------------

  private hookInfo(agg: RootAgg): Record<string, HookInfo> | undefined {
    if (!agg.hookIdx.size && !agg.contexts.size) return undefined;
    const fiber = agg.latest?.deref();
    if (!fiber) return undefined;
    const out: Record<string, HookInfo> = {};
    let names: InspectedHooks | null = null;
    if (this.options.hookNames !== false && isMounted(fiber)) {
      try {
        names = inspectHooks(fiber);
      } catch (error) {
        this.warnings.push(`hook names for ${agg.name}: ${String((error as Error)?.message ?? error).slice(0, 120)}`);
      }
    }
    for (const index of agg.hookIdx) out[index] = names?.hooks.get(index) ?? { type: hookTypeAt(fiber, index) };
    for (const [key, context] of agg.contexts) {
      const info = names?.contexts.get(context);
      if (info) out[key] = info;
    }
    return out;
  }

  private rootStat(agg: RootAgg, withHooks: boolean): RootStat {
    return {
      key: agg.key,
      name: agg.name,
      source: agg.source,
      ...(agg.generated ? { generatedSource: agg.generated } : {}),
      path: agg.path,
      hits: agg.hits,
      instances: agg.instances,
      cascade: agg.cascade,
      perHit: agg.hits ? Math.round(agg.cascade / agg.hits) : 0,
      medianGapMs: medianGapMs(agg.times),
      firstAtMs: agg.times[0] ?? 0,
      lastAtMs: agg.times.at(-1) ?? 0,
      reasons: topEntries(agg.reasons, 8),
      causes: topEntries(agg.causes, 8),
      lanes: topEntries(agg.lanes, 5),
      noDomChange: agg.noDomChange,
      ...(agg.renderMs ? { renderMs: +agg.renderMs.toFixed(1) } : {}),
      ...(agg.mounts ? { mounts: agg.mounts } : {}),
      ...(agg.library ? { library: true as const } : {}),
      ...(withHooks ? { hooks: this.hookInfo(agg) } : {}),
      ...(agg.outside ? { scopeRenders: agg.cascade } : {}),
    };
  }

  private build(durationMs: number, sections: Record<string, RecordingV2['plugins'][string]>, conditionsAfter: Conditions): RecordingV2 {
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
    const ways = this.exportNodes((agg) => remap.get(agg.index));
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
    // An action and the commits that answered it, both ways round: the segments decide which belongs to which.
    const actionOfCommit = new Map<number, number>();
    for (const segment of segments) for (const i of segment.commitIds ?? []) actionOfCommit.set(i, segment.action);
    const commitsOfAction = new Map<number, number[]>(segments.map((s) => [s.action, s.commitIds ?? []]));
    // Past the timeline limit a commit is counted but not kept: an id must lead to a commit in the list.
    const kept = (i: number) => i < this.commitList.length;
    for (const action of actions) {
      const ids = commitsOfAction.get(action.id)?.filter(kept);
      if (ids?.length) action.commitIds = ids;
    }
    const memos = this.memoHits.result((fiber) => {
      if (this.options.hookNames === false || !isMounted(fiber)) return null;
      try {
        return inspectHooks(fiber)?.hooks ?? null;
      } catch {
        return null;
      }
    });
    const commits = this.totals.commits;
    const commitsInScope = this.totals.commitsInScope;
    return {
      schema: RECORDING_SCHEMA,
      version: 2,
      createdAt: new Date().toISOString(),
      ...(this.options.label ? { label: this.options.label } : {}),
      tool: { version: this.config.version, source: this.options.source ?? 'panel', plugins: this.deps.plugins.info() },
      page: {
        url: safeUrl(location.href),
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
            // Asked again rather than kept from when the area was picked: by now the dev server may have mapped it.
            source: sourceOf(this.scope.target, this.config.projectRoot) || this.scope.source,
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
      // The app's own components first: a UI kit fills the top with its wrappers and internals otherwise.
      components: [...this.components]
        .sort(
          (a, b) =>
            Number(a[1].library || a[1].wrapper) - Number(b[1].library || b[1].wrapper) || b[1].renders + b[1].mounts - (a[1].renders + a[1].mounts)
        )
        .slice(0, 150)
        .map(([name, s]) => ({
          name,
          renders: s.renders,
          ...(s.mounts ? { mounts: s.mounts } : {}),
          ...(s.library ? { library: true as const } : {}),
          ...(s.wrapper ? { wrapper: true as const } : {}),
          withoutDom: s.withoutDom,
          byParent: s.byParent,
          ...(s.memo ? { memo: true as const } : {}),
          reasons: topEntries(s.reasons, 4),
          ...(s.chains.size
            ? {
                chains: topEntries(s.chains, CHAINS_PER_COMPONENT).map(([id, n]) => ({
                  n,
                  links: this.chainLinks(id, (agg) => remap.get(agg.index)),
                })),
              }
            : {}),
          ...(s.sampled ? { sampled: true as const } : {}),
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
      segments: segments.map(({ commitIds: _ids, ...rest }) => rest),
      ...(memos.length ? { memos } : {}),
      latency: this.frames.latency,
      reasons: this.reasonList,
      ...(ways.nodes.length ? { chainNodes: ways.nodes } : {}),
      commits: {
        list: this.commitList.map((commit) => ({
          ...commit,
          ...(commit.ways ? { ways: commit.ways.map(([id, ...rest]) => [ways.renumber.get(id)!, ...rest] as CommitWay) } : {}),
          ...(commit.roots ? { roots: commit.roots.map((r) => ({ ...r, i: remap.get(r.i)! })) } : {}),
          ...(commit.outside !== undefined ? { outside: remap.get(commit.outside) } : {}),
          ...(actionOfCommit.get(commit.i) !== undefined ? { actionId: actionOfCommit.get(commit.i) } : {}),
        })),
        truncated: this.truncated,
      },
      bigCommits: this.bigCommits.filter((i) => i < this.commitList.length),
      frames: {
        longTasks: this.frames.longTasks,
        loaf: this.frames.loaf,
        ...(this.options.frames && durationMs ? { fps: +((this.frameCount * 1000) / durationMs).toFixed(1) } : {}),
      },
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
        highlight: this.highlighted,
      },
      warnings: [
        ...this.warnings,
        ...([...this.components.values()].some((comp) => comp.sampled)
          ? [
              `reasons of renders caused by a parent were worked out for ${SAMPLED_PARENTS} instances of a component a commit: their counts are a sample`,
            ]
          : []),
        ...(sourcesUnavailable()
          ? [
              `React ${reactVersion() ?? '19.0'} tells nothing about where a component comes from: no files, and the app's own ` +
                "components cannot be told from a package's. React 19.1 or newer brings both back.",
            ]
          : []),
        ...(this.highlighted ? ['highlight was on: drawing the outlines costs main-thread time, so timings and long frames read high'] : []),
      ],
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
