export const RECORDING_SCHEMA = 'react-perf-recorder/recording';
export const SESSION_SCHEMA = 'react-perf-recorder/session';
export const SCHEMA_VERSION = 1;
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
  highlights?: string[];
  metrics?: Record<string, { value: number; kind: 'count' | 'gauge' }>;
  data?: Data;
}

export interface HookInfo {
  /** Primitive hook type from `_debugHookTypes`, e.g. `useSyncExternalStore`. */
  type?: string;
  /** Custom hooks from the component down to the primitive, e.g. `['useActivePositionsList', 'useSelector', 'SyncExternalStore']`. */
  path?: string[];
  /** Call site in the generated code; the dev server maps it to `site` and `code`. */
  generated?: { url: string; line: number; column: number };
  site?: string;
  code?: string;
}

export interface RootStat {
  key: string;
  name: string;
  source: string;
  path: string;
  hits: number;
  instances: number;
  cascade: number;
  perHit: number;
  medianGapMs: number | null;
  firstAtMs: number;
  lastAtMs: number;
  reasons: Array<[string, number]>;
  causes: Array<[string, number]>;
  lanes: Array<[string, number]>;
  /** Hits in which nothing in the root's DOM changed: the render was wasted. */
  noDomChange: number;
  renderMs?: number;
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
  component?: string;
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

export interface TimelineEntry {
  t: number;
  /** Renders in scope (or everywhere without a scope). */
  n: number;
  /** React render time of the commit's cascade roots, when the build has profile timings. */
  ms?: number;
  lane?: string;
  event?: string;
  roots?: Array<[number, number]>;
  causes?: string[];
  outside?: number;
  noDom?: number;
}

export interface Navigation {
  type: 'push' | 'replace' | 'pop';
  atMs: number;
  url: string;
  sameUrl?: true;
}

export interface RecordingV1 {
  schema: typeof RECORDING_SCHEMA;
  version: 1;
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
  components: Array<{ name: string; renders: number; withoutDom: number; byParent: number; memo?: true; reasons: Array<[string, number]> }>;
  watch?: Record<string, { mounted: number; renders: number; byRoot: Array<[number | null, number]> }>;
  zones?: Record<string, { renders: number; mounted: number; found: boolean }>;
  causes: CauseStat[];
  actions: ActionRecord[];
  segments: Segment[];
  latency: LatencyEntry[];
  timeline: { entries: TimelineEntry[]; truncated: boolean };
  bigCommits: number[];
  frames: { longTasks: { count: number; maxMs: number; totalMs: number }; loaf: LongFrame[]; fps?: number };
  dom: { text: number; attr?: number; child?: number };
  navigations: Navigation[];
  hmr: Array<{ atMs: number; type: string; paths: string[] }>;
  conditions: Conditions;
  conditionsChanged?: Record<string, [Primitive, Primitive]>;
  plugins: Record<string, PluginSection>;
  overhead: { commitMs: number; maxCommitMs: number; overlayMs: number };
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
  page: RecordingV1['page'];
  scope: { name: string; source: string } | null;
  conditions: Conditions;
  plugins: PluginInfo[];
  events: number;
  reloads: number;
}

/** One line of `events.ndjson`. Roots and reasons are sent as dictionaries once, then referenced by index. */
export type SessionEvent =
  | { k: 'root'; i: number; key: string; name: string; source: string; path: string; outside?: true }
  | { k: 'reason'; i: number; text: string }
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
