import { libraryOf, originOf, originText, parseStack, type Origin } from '../stack';

type Kind = 'setTimeout' | 'setInterval' | 'requestAnimationFrame';

interface Scheduled {
  kind: Kind;
  fn: Function;
  /** Stack of the scheduling call; formatted only when the callback leads to a render. */
  origin: Error;
}

export interface TimerSink {
  /**
   * Called after every timer callback; `text` names the timer and `ours` says the recorder scheduled it — both are
   * worked out only if there are updates to give it.
   */
  /** `startedAt` is the timer's place in `nextOrder`. */
  after(text: () => string, ours: () => boolean, library: () => string | null, startedAt: number): void;
}

let sink: TimerSink | null = null;
let running: Scheduled | null = null;
let installed = false;
const texts = new WeakMap<Error, string>();
const own = new WeakMap<Error, boolean>();

let order = 0;

/** Intervals set since boot and not cleared yet, by id: an interval nobody clears is a leak that keeps its closure. */
const intervals = new Map<unknown, Scheduled & { atMs: number }>();

const origins = new WeakMap<Error, Origin>();

/** The app's live intervals: where each was set, and when (`performance.now()`); a test driver's are left out. */
export function liveIntervals(): Array<{ origin: () => Origin; atMs: number }> {
  const out: Array<{ origin: () => Origin; atMs: number }> = [];
  for (const t of intervals.values()) {
    if (ours(t)) continue;
    let origin = origins.get(t.origin);
    if (!origin) origins.set(t.origin, (origin = originOf(t.origin, t.fn.name)));
    const found = origin;
    if (found.text) out.push({ origin: () => found, atMs: t.atMs });
  }
  return out;
}

/**
 * A number that only grows: what happened before a timer started, told apart from what happened in it. The clock
 * cannot say: it is coarsened to 0.1 ms, and a timeout of 0 runs within that of the code that set it.
 */
export const nextOrder = () => ++order;

export function setTimerSink(next: TimerSink | null) {
  sink = next;
}

/** The timer callback on the stack, when a commit happens inside it (flushSync, a sync lane flushed in place). */
export function runningTimer(): string | null {
  return running ? timerText(running) : null;
}

/** The package that called the running timer; null for app code or no timer. */
export function runningTimerLibrary(): string | null {
  return running ? libraryOfCaller(running) : null;
}

const callers = new WeakMap<Error, string | null>();

/** Who called `setTimeout`, not whose code is further down: a query notified from an app's handler is still the library's. */
function libraryOfCaller(t: Scheduled): string | null {
  let library = callers.get(t.origin);
  if (library === undefined) {
    const caller = parseStack(t.origin.stack ?? '')
      .slice(1)
      .find((f) => libraryOf(f.url, f.line) !== 'react-perf-recorder');
    callers.set(t.origin, (library = caller ? libraryOf(caller.url, caller.line) : null));
  }
  return library;
}

/** `timer setInterval useCountdown @ src/hooks/useCountdown.ts`, or the package that scheduled it. */
function timerText(t: Scheduled): string {
  let text = texts.get(t.origin);
  if (text) return text;
  const caller = originText(t.origin, t.fn.name);
  text = `timer ${t.kind}${caller ? ` ${caller}` : ''}`;
  texts.set(t.origin, text);
  return text;
}

/** The code that called the timer is the recorder's own — the panel, its outlines, a replay — whoever called it. */
export function scheduledByRecorder(stack: string): boolean {
  const caller = parseStack(stack)[1];
  return caller !== undefined && libraryOf(caller.url, caller.line) === 'react-perf-recorder';
}

function ours(t: Scheduled): boolean {
  let result = own.get(t.origin);
  if (result === undefined) own.set(t.origin, (result = scheduledByRecorder(t.origin.stack ?? '')));
  return result;
}

function wrap(kind: Kind) {
  const target = window as unknown as Record<Kind, (...args: unknown[]) => unknown>;
  const original = target[kind];
  if (typeof original !== 'function') return;
  const wrapped = function (callback: unknown, ...rest: unknown[]) {
    if (typeof callback !== 'function') return original.call(window, callback, ...rest);
    const scheduled: Scheduled = { kind, fn: callback, origin: new Error() };
    const id = original.call(
      window,
      function (this: unknown, ...args: unknown[]) {
        const s = sink;
        if (!s) return callback.apply(this, args);
        const outer = running;
        const startedAt = nextOrder();
        running = scheduled;
        try {
          return callback.apply(this, args);
        } finally {
          running = outer;
          s.after(
            () => timerText(scheduled),
            () => ours(scheduled),
            () => libraryOfCaller(scheduled),
            startedAt
          );
        }
      },
      ...rest
    );
    if (kind === 'setInterval' && intervals.size < MAX_INTERVALS) intervals.set(id, { ...scheduled, atMs: performance.now() });
    return id;
  };
  Object.defineProperty(wrapped, 'name', { value: kind });
  target[kind] = wrapped;
}

/** More than this many live intervals are counted no further: the leak is already plain. */
const MAX_INTERVALS = 10_000;

/** Browsers share one id pool for both: `clearTimeout` clears an interval too. */
function wrapClear(name: 'clearInterval' | 'clearTimeout') {
  const target = window as unknown as Record<string, (id: unknown) => void>;
  const original = target[name];
  if (typeof original !== 'function') return;
  const wrapped = function (id: unknown) {
    intervals.delete(id);
    return original.call(window, id);
  };
  Object.defineProperty(wrapped, 'name', { value: name });
  target[name] = wrapped;
}

/** Wraps the page's timers once, at boot: intervals set up on mount are not seen unless wrapped before recording. */
export function installTimers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  wrap('setTimeout');
  wrap('setInterval');
  wrap('requestAnimationFrame');
  wrapClear('clearInterval');
  wrapClear('clearTimeout');
}
