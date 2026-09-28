import { GROWTH_KEYS, type GrowthKey, type GrowthMetric, type GrowthStats } from '../shared/schema';
import { liveListeners } from './env/listeners';
import { liveConnections, liveObservers } from './env/observers';
import { RetainWatcher } from './retained';
import type { Fiber } from './fiber';
import type { Origin } from './stack';
import { StyleWatcher } from './styles';
import { liveIntervals } from './env/timers';

const TICK_MS = 250;
/** Four a second for the first ten seconds: a short recording has too few points to tell a leak from a burst. */
const FAST_TICKS = 40;
const SLOW_EVERY = 1000 / TICK_MS;
/** Ten minutes a second apart; a longer recording keeps every other sample and samples half as often. */
const MAX_SAMPLES = 600;

/** Below this a change is noise: a route that mounts, a tooltip, a lazy chunk's styles. */
const NOISE: Record<GrowthKey, (start: number) => number> = {
  domNodes: (start) => Math.max(100, start * 0.1),
  cssRules: () => 20,
  styleElements: () => 5,
  intervals: () => 1,
  listeners: () => 2,
  heapKB: (start) => Math.max(5 * 1024, start * 0.1),
  observers: () => 2,
  connections: () => 1,
};

function cssRules(): number {
  let n = 0;
  const sheets = [
    ...Array.from(document.styleSheets),
    ...((document as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []),
  ];
  for (const sheet of sheets) {
    try {
      n += sheet.cssRules.length;
    } catch {
      // A stylesheet from another origin keeps its rules to itself.
    }
  }
  return n;
}

function heapKB(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1024) : null;
}

/** Counts, now, of everything a leak makes grow, in `GROWTH_KEYS` order. */
function measure(): Array<number | null> {
  return [
    document.getElementsByTagName('*').length,
    cssRules(),
    document.getElementsByTagName('style').length,
    liveIntervals().length,
    liveListeners().length,
    heapKB(),
    liveObservers().length,
    liveConnections().length,
  ];
}

/** Least-squares slope, per ms. */
function slopeOf(points: Array<[number, number]>): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den ? num / den : 0;
}

function slopePerMin(points: Array<[number, number]>): number {
  const perMin = slopeOf(points) * 60_000;
  return Math.abs(perMin) >= 10 ? Math.round(perMin) : +perMin.toFixed(1);
}

export function growthMetric(key: GrowthKey, points: Array<[number, number]>): GrowthMetric | null {
  if (!points.length) return null;
  const start = points[0][1];
  const end = points[points.length - 1][1];
  const noise = NOISE[key](start);
  // The trend of the second half, not one point in it: a popover that opens and closes saws the count up and down.
  const t1 = points[points.length - 1][0];
  const half = (points[0][0] + t1) / 2;
  const lateRise = slopeOf(points.filter((p) => p[0] >= half)) * (t1 - half);
  // A quarter of the growth after the middle: a burst at the start that settled is a page loading, not a leak.
  const growing = end - start >= noise && (points.length < 3 || lateRise >= Math.max(noise / 2, (end - start) / 4));
  return {
    start,
    end,
    peak: points.reduce((m, p) => Math.max(m, p[1]), start),
    perMin: slopePerMin(points),
    ...(growing ? { growing: true as const } : {}),
  };
}

/** By where they were added, most first: one call site leaving N behind is one line of the report. */
function byOrigin<T extends { origin: () => Origin }>(items: T[], prefix: (item: T) => string = () => '') {
  const out = new Map<string, { item: T; origin: Origin; live: number }>();
  for (const item of items) {
    const origin = item.origin();
    const key = `${prefix(item)}\u0000${origin.text}\u0000${origin.at ? `${origin.at.url}:${origin.at.line}:${origin.at.column}` : ''}`;
    const entry = out.get(key);
    if (entry) entry.live++;
    else out.set(key, { item, origin, live: 1 });
  }
  return [...out.values()]
    .sort((a, b) => b.live - a.live)
    .slice(0, 20)
    .map(({ item, origin, live }) => ({
      item,
      origin: origin.text || 'unknown',
      live,
      ...(origin.at ? { generated: { url: origin.at.url, line: origin.at.line, column: origin.at.column } } : {}),
    }));
}

/** Samples the page while a recording runs and says, at the end, what kept growing and who added it. */
export class GrowthWatcher {
  private samples: Array<[number, ...Array<number | null>]> = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private every = 1;
  private ticks = 0;
  /** `performance.now()` at the start: what was added before it is not the recording's. */
  private startedAt = 0;
  private readonly styles = new StyleWatcher();
  private readonly retain: RetainWatcher;

  constructor(private readonly now: () => number, projectRoot = '', forget?: (f: Fiber) => void) {
    this.retain = new RetainWatcher(projectRoot, forget);
  }

  commit(root: Fiber) {
    this.retain.commit(root);
  }

  start() {
    this.startedAt = performance.now();
    this.styles.start();
    this.sample();
    this.timer = setInterval(() => {
      if (++this.ticks === FAST_TICKS) this.every = SLOW_EVERY;
      if (this.ticks % this.every === 0) this.sample();
    }, TICK_MS);
  }

  private sample() {
    this.samples.push([Math.round(this.now()), ...measure()]);
    if (this.samples.length >= MAX_SAMPLES) {
      this.samples = this.samples.filter((_, i, all) => i % 2 === 0 || i === all.length - 1);
      this.every *= 2;
    }
  }

  /** `collected`: the page's garbage was collected just before, as record_page does through CDP. */
  stop(collected = false): GrowthStats {
    // Chrome run with --js-flags=--expose-gc collects on its own.
    const gc = (globalThis as { gc?: () => void }).gc;
    if (!collected && typeof gc === 'function') {
      try {
        gc();
        collected = true;
      } catch {
        // Not the real one.
      }
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sample();
    const metrics: GrowthStats['metrics'] = {};
    GROWTH_KEYS.forEach((key, k) => {
      const points = this.samples.filter((s) => s[k + 1] !== null).map((s) => [s[0], s[k + 1] as number] as [number, number]);
      const metric = growthMetric(key, points);
      if (metric) metrics[key] = metric;
    });
    const since = (item: { atMs: number }) => item.atMs >= this.startedAt;
    const intervals = byOrigin(liveIntervals().filter(since)).map(({ item: _item, ...rest }) => rest);
    const listeners = byOrigin(liveListeners().filter(since), (l) => `${l.target} ${l.type}`).map(({ item, ...rest }) => ({
      target: item.target,
      type: item.type,
      ...rest,
    }));
    const kinded = (items: ReturnType<typeof liveObservers>) =>
      byOrigin(items.filter(since), (o) => `${o.kind} ${o.url ?? ''}`).map(({ item, ...rest }) => ({
        kind: item.kind,
        ...(item.url ? { url: item.url } : {}),
        ...rest,
      }));
    const observers = kinded(liveObservers());
    const connections = kinded(liveConnections());
    const styles = this.styles.stop();
    const retained = this.retain.stop(collected);
    return {
      samples: this.samples,
      metrics,
      ...(intervals.length ? { intervals } : {}),
      ...(listeners.length ? { listeners } : {}),
      ...(styles.length ? { styles } : {}),
      ...(observers.length ? { observers } : {}),
      ...(connections.length ? { connections } : {}),
      ...(retained ? { retained } : {}),
    };
  }
}
