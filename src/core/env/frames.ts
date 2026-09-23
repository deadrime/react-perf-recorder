import type { LatencyEntry, LongFrame } from '../../shared/schema';

interface ScriptTiming {
  invoker?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  sourceCharPosition?: number;
  duration: number;
  forcedStyleAndLayoutDuration?: number;
}

interface LoafEntry extends PerformanceEntry {
  blockingDuration?: number;
  scripts?: ScriptTiming[];
}

interface EventEntry extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  interactionId?: number;
}

const supported = (type: string) => typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes(type);

export interface FrameOptions {
  t0: number;
  projectRoot: string;
  countCommits(fromMs: number, toMs: number): number;
  onFrame(frame: LongFrame): void;
  onLatency(entry: LatencyEntry): void;
}

const shortSource = (url: string | undefined, root: string) => {
  if (!url) return '';
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
  if (root && path.startsWith(root)) return path.slice(root.length).replace(/^\/+/, '');
  return path.replace(/^\/@fs\//, '/').replace(/^\//, '');
};

/** Long tasks, long animation frames with their scripts, and input latency from the Event Timing API. */
export class FrameWatcher {
  readonly longTasks = { count: 0, maxMs: 0, totalMs: 0 };
  readonly loaf: LongFrame[] = [];
  readonly latency: LatencyEntry[] = [];
  /** Index in `latency` of the worst entry of each interaction, so the same interaction is kept once. */
  private readonly worstByInteraction = new Map<number, number>();
  private observers: Array<[PerformanceObserver, (entry: PerformanceEntry) => void]> = [];

  constructor(private options: FrameOptions) {}

  start() {
    const { t0 } = this.options;
    const at = (time: number) => Math.round(time - t0);
    if (supported('longtask')) {
      this.observe('longtask', (entry) => {
        if (entry.startTime < t0) return;
        this.longTasks.count++;
        this.longTasks.totalMs += Math.round(entry.duration);
        this.longTasks.maxMs = Math.max(this.longTasks.maxMs, Math.round(entry.duration));
      });
    }
    if (supported('long-animation-frame')) {
      this.observe('long-animation-frame', (raw) => {
        const entry = raw as LoafEntry;
        if (entry.startTime < t0 || this.loaf.length >= 500) return;
        const scripts = (entry.scripts ?? [])
          .slice()
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 5)
          .map((s) => {
            const source = shortSource(s.sourceURL, this.options.projectRoot);
            return {
              invoker: String(s.invoker ?? s.sourceFunctionName ?? '').slice(0, 120),
              source: s.sourceCharPosition != null && s.sourceCharPosition >= 0 ? `${source}@${s.sourceCharPosition}` : source,
              duration: Math.round(s.duration),
              layout: Math.round(s.forcedStyleAndLayoutDuration ?? 0),
              ...(/react-perf-recorder/.test(s.sourceURL ?? '') ? { own: true as const } : {}),
            };
          });
        const frame: LongFrame = {
          atMs: at(entry.startTime),
          duration: Math.round(entry.duration),
          blocking: Math.round(entry.blockingDuration ?? 0),
          commits: this.options.countCommits(at(entry.startTime), at(entry.startTime + entry.duration)),
          scripts,
        };
        this.loaf.push(frame);
        this.options.onFrame(frame);
      });
    }
    if (supported('event')) {
      this.observe(
        'event',
        (raw) => {
          const entry = raw as EventEntry;
          if (!entry.interactionId || entry.startTime < t0 || this.latency.length >= 2000) return;
          const latency: LatencyEntry = {
            atMs: at(entry.startTime),
            type: entry.name,
            duration: Math.round(entry.duration),
            inputDelay: Math.round(entry.processingStart - entry.startTime),
            processing: Math.round(entry.processingEnd - entry.processingStart),
            presentation: Math.max(0, Math.round(entry.startTime + entry.duration - entry.processingEnd)),
            interactionId: entry.interactionId,
          };
          // The browser reports one entry per event of an interaction — pointerdown, pointerup, click all carry the
          // same id. Only the worst of them says what the person waited for, so the rest are not kept.
          const seen = this.worstByInteraction.get(latency.interactionId);
          if (seen !== undefined && this.latency[seen].duration >= latency.duration) return;
          if (seen !== undefined) this.latency[seen] = latency;
          else {
            this.worstByInteraction.set(latency.interactionId, this.latency.length);
            this.latency.push(latency);
          }
          this.options.onLatency(latency);
        },
        { durationThreshold: 16 }
      );
    }
  }

  stop() {
    for (const [observer, onEntry] of this.observers) {
      observer.takeRecords?.().forEach(onEntry);
      observer.disconnect();
    }
    this.observers = [];
  }

  private observe(type: string, onEntry: (entry: PerformanceEntry) => void, extra: Record<string, unknown> = {}) {
    try {
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
      observer.observe({ type, buffered: false, ...extra } as PerformanceObserverInit);
      this.observers.push([observer, onEntry]);
    } catch {
      // Unsupported options in this browser: the section stays empty.
    }
  }
}
