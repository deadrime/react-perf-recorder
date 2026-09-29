/**
 * Where the page's CPU went while it was recorded: a sampling profile, symbolized by the dev server and summed up
 * by package, function, component render and entry point. Milliseconds are sampled, not measured.
 */
export interface CpuSummary {
  version: 1;
  /** `cdp`: V8's profiler through record_page; `self`: the page's own JS Self-Profiling API, from the panel. */
  source: 'cdp' | 'self';
  intervalMs: number;
  samples: number;
  wallMs: number;
  /** Everything but idle time and `(program)`; the recorder's own share is in it and in `recorderMs`. */
  busyMs: number;
  gcMs: number;
  recorderMs: number;
  /** Scripts evaluated into the page from outside, such as the test driver's; in `busyMs`, in no list. */
  externalMs?: number;
  /** Where the sampled time was spent last, by npm package; the app's own code is `(app)`. */
  packages: CpuPackage[];
  /** Hottest functions by their own time; `site` is `file:line` for the app, a path in the package otherwise. */
  functions: CpuFunction[];
  /** Components by the time their renders took, with what inside the render took it. */
  renders: CpuRender[];
  /** Work outside component renders, by the app's function that started it or else the package. */
  entries: CpuEntry[];
  warnings?: string[];
}

export interface CpuPackage {
  name: string;
  selfMs: number;
  /** Time with the package anywhere on the stack, counted once per sample. */
  totalMs: number;
}

export interface CpuFunction {
  name: string;
  site?: string;
  package?: string;
  selfMs: number;
  totalMs: number;
}

export interface CpuRender {
  name: string;
  site?: string;
  package?: string;
  ms: number;
  /** What the render called that took the time: the innermost app function, or the package API it called. */
  hot: Array<{ name: string; site?: string; package?: string; ms: number }>;
}

export interface CpuEntry {
  name: string;
  site?: string;
  package?: string;
  ms: number;
}

/** The app's own code in `packages`. */
export const APP = '(app)';

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** `3.2s busy of 5s (64%), react-dom 40% · (app) 22% · @emotion/serialize 9%`: one line for a summary. */
export function cpuLine(cpu: CpuSummary): string {
  const top = cpu.packages
    .slice(0, 3)
    .map((p) => `${p.name} ${pct(p.selfMs, cpu.busyMs)}%`)
    .join(' · ');
  const own = `${cpu.recorderMs ? `, recorder itself ${pct(cpu.recorderMs, cpu.busyMs)}%` : ''}${
    cpu.externalMs ? `, test driver ${pct(cpu.externalMs, cpu.busyMs)}%` : ''
  }`;
  return `${fmtMs(cpu.busyMs)} busy of ${fmtMs(cpu.wallMs)} (${pct(cpu.busyMs, cpu.wallMs)}%)${top ? `: ${top}` : ''}${own}`;
}

export const fmtMs = (ms: number) => (ms >= 1000 ? `${+(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);

/** A function or an entry as one short string: `selectRows @ src/store/rows.ts:12` or `(socket.io-parser)`. */
export const placeText = (f: { name: string; site?: string; package?: string }) =>
  f.package && !f.site
    ? `${f.name ? `${f.name} ` : ''}(${f.package})`
    : `${f.name || '(anonymous)'}${f.site ? ` @ ${f.site}` : ''}${f.package ? ` (${f.package})` : ''}`;

/** What the numbers can and cannot say; a dev build is slower in React and CSS-in-JS than production. */
export const CPU_CAVEAT =
  "Sampled on the dev server build: React and CSS-in-JS libraries do extra work in development, so read their share as an upper bound; the app's own hot functions and a before/after under the same conditions hold.";

/** V8's profile as CDP's `Profiler.stop` returns it and DevTools opens it: positions 0-based, times in µs. */
export interface CpuProfile {
  nodes: Array<{ id: number; callFrame: CallFrame; children?: number[]; hitCount?: number }>;
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

export interface CallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

/** What the JS Self-Profiling API's `profiler.stop()` resolves with: positions 1-based, times in ms of the page. */
export interface SelfProfileTrace {
  frames: Array<{ name?: string; resourceId?: number; line?: number; column?: number }>;
  resources: string[];
  stacks: Array<{ frameId: number; parentId?: number }>;
  samples: Array<{ timestamp: number; stackId?: number }>;
}

/** What the page sends along with the recording; `keep` saves the profile beside it. */
export type CpuInput = (
  | { format: 'cdp'; profile: CpuProfile; intervalMs: number }
  | { format: 'self'; trace: SelfProfileTrace; intervalMs: number }
) & { keep?: boolean };
