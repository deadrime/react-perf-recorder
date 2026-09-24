export const RECORDING_SCHEMA = 'react-perf-recorder/recording';
export const SESSION_SCHEMA = 'react-perf-recorder/session';
export const SCHEMA_VERSION = 2;
export const GLOBAL_KEY = '__REACT_PERF_RECORDER__';
export const ENDPOINT = '__react-perf-recorder';
export const CLIENT_HEADER = 'x-react-perf-recorder';

export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };
export type Conditions = Record<string, Primitive>;

export interface PluginInfo {
  name: string;
  sectionVersion: number;
  error?: string;
}

export interface PluginSection<Data = unknown> {
  version: number;
  /** false: the plugin's library is not on the page, and the report leaves the plugin out. */
  active?: boolean;
  highlights?: string[];
  metrics?: Record<string, { value: number; kind: 'count' | 'gauge' }>;
  data?: Data;
}

/**
 * One render on the way down: the root first (`root` indexes the recording's roots, inside then outside), the
 * component itself last. `reason` indexes `RecordingV2.reasons`; `skipped` stands for links left out of a long chain.
 */
/** A link of the commits' cascade trees: the link above it (-1 for a root), who rendered, and why. */
export interface ChainNodeInfo {
  up: number;
  name: string;
  reason?: number;
  /** For a root's link: the root, as `ChainLink.root`. */
  root?: number;
}

export interface ChainLink {
  name: string;
  reason?: number;
  root?: number;
  skipped?: number;
}

/** A useMemo or useCallback that recomputed on at least half of its component's renders. */
export interface MemoHookStat {
  component: string;
  source?: string;
  /** Cell index in the component's hook list: the same `#N` the reasons use. */
  hook: number;
  kind: 'useMemo' | 'useCallback';
  /** Renders in which the hook had a value to keep; `recomputed` of them made a new one. */
  renders: number;
  recomputed: number;
  /** No dependency array: it recomputes on every render by definition. */
  noDeps?: true;
  /** Per dependency position: how often it changed, and how often into a value with the same content. */
  deps: Array<{ index: number; changed: number; sameContent: number }>;
  info?: HookInfo;
}

export interface HookInfo {
  /** Primitive hook type from `_debugHookTypes`, e.g. `useSyncExternalStore`. */
  type?: string;
  /** Custom hooks from the component down to the primitive, e.g. `['useActivePositionsList', 'useSelector', 'SyncExternalStore']`. */
  path?: string[];
  /** npm package the chain enters, e.g. `zustand`; absent when every custom hook is app code. */
  library?: string;
  /** Index in `path` of the first hook of `library`: the package API the app called, e.g. `useStore`. */
  libraryAt?: number;
  /** Call site in the generated code; the dev server maps it to `site` and `code`. */
  generated?: { url: string; line: number; column: number };
  site?: string;
  code?: string;
}

/** What made a component render, as fields rather than a sentence; `text` is the sentence, built from them. */
export type ReasonKind = 'state' | 'store' | 'context' | 'props' | 'parent' | 'bailout' | 'unknown';

export interface ReasonInfo {
  i: number;
  kind: ReasonKind;
  /** Index in the hook list, for `state` and `store`; the key into `RootStat.hooks`. */
  hook?: number;
  /** The store behind an external-store hook, and the selector it was read with. */
  store?: string;
  selector?: string;
  /** The context that changed, for `context`. */
  context?: string;
  /** Props that really changed, and props that are a new reference with the same content. */
  changed?: string[];
  sameRef?: string[];
  /** The children element changed by reference. */
  children?: true;
  /** The parent rendered and handed over equal props: `memo` would have skipped this render. */
  equal?: true;
  /** A new value with the same content: a subscription bug rather than new data. */
  sameContent?: true;
  /** Older recordings carry the sentence; it is built from the fields above by `reasonText` when it is not there. */
  text?: string;
}

export interface RootStat {
  key: string;
  name: string;
  source: string;
  /** Call site in the generated code, when the source alone has no line; the dev server maps it into `source`. */
  generatedSource?: { url: string; line: number; column: number };
  path: string;
  hits: number;
  instances: number;
  cascade: number;
  perHit: number;
  medianGapMs: number | null;
  firstAtMs: number;
  lastAtMs: number;
  /** `[reason id, how many hits]`; the ids index `RecordingV2.reasons`. */
  reasons: Array<[number, number]>;
  causes: Array<[string, number]>;
  lanes: Array<[string, number]>;
  /** Hits in which nothing in the root's DOM changed: the render was wasted. */
  noDomChange: number;
  renderMs?: number;
  /** Components mounted under the root in its hits: a component declared in render or an unstable key remounts. */
  mounts?: number;
  hooks?: Record<string, HookInfo>;
  /** Only for outside roots: renders inside the scope this root caused. */
  scopeRenders?: number;
}

export interface ScopeInfo {
  name: string;
  source: string;
  path: string[];
  state: 'attached' | 'lost';
  remounts: number;
  lostAtMs: number[];
}

export interface Totals {
  commits: number;
  commitsInScope: number;
  renders: number;
  mounts: number;
  rendersPerCommit: number;
  rendersPerScopeCommit: number;
  rendersFromOutside: number;
  rendersWithoutDom: number;
  domTextChanges: number;
  causesDropped: number;
  lanes: Record<string, number>;
}

export interface CauseStat {
  /** Id: what a commit references instead of repeating the key. */
  i: number;
  key: string;
  plugin: string;
  type: string;
  events: number;
  commits: number;
  keys?: Record<string, { changed: number; sameContent: number; unknown: number }>;
}

export type ActionKind = 'click' | 'typing' | 'change' | 'key' | 'submit' | 'scroll' | 'navigation';

export interface ActionTarget {
  testId?: string;
  name?: string;
  label?: string;
  tag: string;
  role?: string;
  text?: string;
  /** The component that rendered the element, where it was written, and the app's components above it. */
  component?: string;
  source?: string;
  /** React 19: the built position of the component, which the dev server maps into `source` when saving. */
  generatedSource?: { url: string; line: number; column: number };
  path?: string[];
  /** Enough to find the element again: a selector, and which one it is among its like-named siblings. */
  selector?: string;
  nth?: number;
  /** Where the click landed, and the box of the element at that moment. */
  point?: { x: number; y: number };
  box?: { x: number; y: number; w: number; h: number };
  /** The element's own state when it was acted on. */
  id?: string;
  href?: string;
  disabled?: true;
  checked?: boolean;
  inScope?: boolean;
}

export interface ActionRecord {
  id: number;
  kind: ActionKind;
  atMs: number;
  endMs: number;
  target?: ActionTarget;
  key?: string;
  /** Characters typed, for `typing`. */
  chars?: number;
  /** Value length after the action; the value itself only with `actions.values`. */
  length?: number;
  value?: string;
  secret?: boolean;
  scroll?: { from: number; to: number; pixels: number };
  url?: string;
  /** The commits that followed it, by id; empty when the action changed nothing. */
  commitIds?: number[];
}

export interface LatencyEntry {
  atMs: number;
  type: string;
  duration: number;
  inputDelay: number;
  processing: number;
  presentation: number;
  interactionId: number;
}

export interface LongFrame {
  atMs: number;
  duration: number;
  blocking: number;
  commits: number;
  scripts: Array<{ invoker: string; source: string; duration: number; layout: number; own?: boolean }>;
}

export interface Segment {
  action: number;
  /** Internal wiring while a recording is built; the saved recording keeps these on the action itself. */
  commitIds?: number[];
  atMs: number;
  durationMs: number;
  commits: number;
  renders: number;
  reaction: { commits: number; renders: number };
  background: { commits: number; renders: number };
  perChar?: { commits: number; renders: number; maxRenders: number };
  topRoots: Array<[number, number]>;
  latency?: LatencyEntry;
  longFrames: number;
  maxFrameMs: number;
}

/**
 * One commit, with everything that points at it: the action and the causes that led to it, the roots that rendered
 * in it and why. This is what a timeline is drawn from — a bar per commit, a marker per action.
 */
export interface CommitRecord {
  i: number;
  atMs: number;
  /** Milliseconds since the previous commit. */
  sinceMs?: number;
  /** React render time of the commit's cascade roots, when the build has profile timings. */
  ms?: number;
  lane?: string;
  /** The DOM event being dispatched when React was told, e.g. `click`. */
  event?: string;
  /** The action this commit answered, and the causes that claimed it. */
  actionId?: number;
  causeIds?: number[];
  /** Renders in scope (or everywhere without a scope), and how many changed nothing in the DOM. */
  renders: number;
  noDom?: number;
  outside?: number;
  mounts?: number;
  /** Cascade roots of this commit: which root, how many of its instances, and why each rendered. */
  roots?: Array<{ i: number; hits: number; reasonIds: number[] }>;
  /**
   * The commit's cascade as a tree: `[link, renders]` into `RecordingV2.chainNodes`, the busiest links and every link
   * above them. Absent in fast recordings.
   */
  ways?: Array<[number, number]>;
}

export interface Navigation {
  type: 'push' | 'replace' | 'pop';
  atMs: number;
  url: string;
  sameUrl?: true;
}

export interface RecordingV2 {
  schema: typeof RECORDING_SCHEMA;
  version: 2;
  id?: string;
  createdAt: string;
  label?: string;
  partial?: boolean;
  tool: { version: string; source: string; plugins: PluginInfo[] };
  page: { url: string; title: string; viewport: string; dpr: number; userAgent: string };
  react: { version: string | null; roots: number; profileTimings: boolean };
  meta?: Record<string, Primitive>;
  options: Record<string, JsonValue>;
  startedAt: string;
  durationMs: number;
  scope: ScopeInfo | null;
  totals: Totals;
  roots: RootStat[];
  outsideRoots: RootStat[];
  /** Every rendered component; `reasons` covers renders caused by a parent too (`parent: props …`). */
  components: Array<{
    name: string;
    renders: number;
    mounts?: number;
    /** A component of a package: the app's own come first in the list. */
    library?: true;
    /** An unnamed wrapper of the app or a component that only hands a context down: listed after the app's own. */
    wrapper?: true;
    withoutDom: number;
    byParent: number;
    memo?: true;
    reasons: Array<[number, number]>;
    /** Its most frequent ways down from a root, with how many renders came each way; only for renders a parent caused. */
    chains?: Array<{ n: number; links: ChainLink[] }>;
    /** Its parent-caused renders had their reasons worked out for a sample of the instances in a commit, not all. */
    sampled?: true;
  }>;
  watch?: Record<string, { mounted: number; renders: number; byRoot: Array<[number | null, number]> }>;
  zones?: Record<string, { renders: number; mounted: number; found: boolean }>;
  causes: CauseStat[];
  actions: ActionRecord[];
  segments: Segment[];
  /** Memo hooks that keep recomputing, worst first; absent when none do. */
  memos?: MemoHookStat[];
  latency: LatencyEntry[];
  /** Every reason any root or component gave, once; everything else points here by id. */
  reasons: ReasonInfo[];
  commits: { list: CommitRecord[]; truncated: boolean };
  /** The links the commits' `ways` point at; only in the final recording. */
  chainNodes?: ChainNodeInfo[];
  bigCommits: number[];
  frames: { longTasks: { count: number; maxMs: number; totalMs: number }; loaf: LongFrame[]; fps?: number };
  dom: { text: number; attr?: number; child?: number };
  navigations: Navigation[];
  hmr: Array<{ atMs: number; type: string; paths: string[] }>;
  conditions: Conditions;
  conditionsChanged?: Record<string, [Primitive, Primitive]>;
  plugins: Record<string, PluginSection>;
  /** `highlight`: outlines were drawn during the recording, which adds to frame and long-task times. */
  overhead: { commitMs: number; maxCommitMs: number; overlayMs: number; highlight?: boolean };
  warnings: string[];
  errors: string[];
}

export type SessionStatus = 'recording' | 'done' | 'interrupted';

export interface SessionMeta {
  schema: typeof SESSION_SCHEMA;
  version: 1;
  id: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  source: string;
  label?: string;
  page: RecordingV2['page'];
  scope: { name: string; source: string } | null;
  conditions: Conditions;
  plugins: PluginInfo[];
  events: number;
  reloads: number;
  /** What a listing shows of a finished recording, so listing does not read every recording through. */
  listing?: { durationMs: number; actions: number; commits: number; renders: number; topRoot: string | null };
}

/** One line of `events.ndjson`. Roots and reasons are sent as dictionaries once, then referenced by index. */
export type SessionEvent =
  | {
      k: 'root';
      i: number;
      key: string;
      name: string;
      source: string;
      generatedSource?: { url: string; line: number; column: number };
      path: string;
      outside?: true;
    }
  | { k: 'reason'; info: ReasonInfo }
  | {
      k: 'commit';
      t: number;
      n: number;
      ms?: number;
      lane?: string;
      event?: string;
      roots?: Array<[number, number, number[]]>;
      causes?: string[];
      outside?: number;
      noDom?: number;
    }
  | { k: 'action'; action: ActionRecord }
  | { k: 'latency'; entry: LatencyEntry }
  | { k: 'frame'; frame: LongFrame }
  | { k: 'nav'; nav: Navigation }
  | { k: 'hmr'; atMs: number; type: string; paths: string[] }
  | { k: 'reload'; atMs: number }
  | { k: 'scope'; atMs: number; state: 'attached' | 'lost' | 'remounted' }
  | { k: 'end'; atMs: number };
