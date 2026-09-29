import type { SelfProfileTrace } from '../shared/cpu';

/** The JS Self-Profiling API, where Chromium offers it: `new Profiler(...)` throws unless the document allowed it. */
interface SelfProfiler {
  readonly sampleInterval: number;
  stop(): Promise<SelfProfileTrace>;
}

type ProfilerCtor = new (options: { sampleInterval: number; maxBufferSize: number }) => SelfProfiler;

/** The shortest Chromium samples at; asking for less gets this. */
const INTERVAL_MS = 10;

export interface SelfProfile {
  intervalMs: number;
  /** Stops sampling now; the trace comes after. */
  stop(): Promise<SelfProfileTrace>;
}

/** Starts sampling the page's JS, or says why it could not: null when the browser has no such API at all. */
export function startSelfProfile(maxDurationMs: number): SelfProfile | string | null {
  const Ctor = (globalThis as { Profiler?: ProfilerCtor }).Profiler;
  if (typeof Ctor !== 'function') return null;
  try {
    const profiler = new Ctor({ sampleInterval: INTERVAL_MS, maxBufferSize: Math.ceil(maxDurationMs / INTERVAL_MS) + 100 });
    return { intervalMs: profiler.sampleInterval, stop: () => profiler.stop() };
  } catch (error) {
    return `CPU not sampled: ${String(
      (error as Error)?.message ?? error
    )} (the page needs the Document-Policy: js-profiling header the dev server sends)`;
  }
}
