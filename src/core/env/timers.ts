import { libraryOf, parseStack } from '../stack';

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
  after(text: () => string, ours: () => boolean): void;
}

let sink: TimerSink | null = null;
let running: Scheduled | null = null;
let installed = false;
const texts = new WeakMap<Error, string>();
const own = new WeakMap<Error, boolean>();

export function setTimerSink(next: TimerSink | null) {
  sink = next;
}

/** The timer callback on the stack, when a commit happens inside it (flushSync, a sync lane flushed in place). */
export function runningTimer(): string | null {
  return running ? timerText(running) : null;
}

/** `timer setInterval useCountdown @ src/hooks/useCountdown.ts`, or the package that scheduled it. */
function timerText(t: Scheduled): string {
  let text = texts.get(t.origin);
  if (text) return text;
  // The first frame is the wrapper itself, wherever the recorder was loaded from (a script tag has no file URL).
  const frames = parseStack(t.origin.stack ?? '')
    .slice(1)
    .filter((f) => libraryOf(f.url) !== 'react-perf-recorder');
  const app = frames.find((f) => libraryOf(f.url) === null);
  const name = (app?.fn.split('.').pop() || t.fn.name || '').replace(/^bound /, '');
  if (app) {
    const file = app.url
      .replace(/^[a-z]+:\/\/[^/]+/, '')
      .split(/[?#]/)[0]
      .replace(/^\//, '');
    text = `timer ${t.kind}${name ? ` ${name}` : ''} @ ${file}`;
  } else {
    const library = frames.map((f) => libraryOf(f.url)).find(Boolean);
    text = `timer ${t.kind}${library ? ` (${library})` : ''}`;
  }
  texts.set(t.origin, text);
  return text;
}

/** The code that called the timer is the recorder's own — the panel, its outlines, a replay — whoever called it. */
export function scheduledByRecorder(stack: string): boolean {
  const caller = parseStack(stack)[1];
  return caller !== undefined && libraryOf(caller.url) === 'react-perf-recorder';
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
    return original.call(
      window,
      function (this: unknown, ...args: unknown[]) {
        const s = sink;
        if (!s) return callback.apply(this, args);
        const outer = running;
        running = scheduled;
        try {
          return callback.apply(this, args);
        } finally {
          running = outer;
          s.after(
            () => timerText(scheduled),
            () => ours(scheduled)
          );
        }
      },
      ...rest
    );
  };
  Object.defineProperty(wrapped, 'name', { value: kind });
  target[kind] = wrapped;
}

/**
 * Wraps the page's timers once, at boot: intervals set up on mount must be wrapped before a recording starts to be
 * seen at all. Outside a recording a wrapped callback costs one check; the scheduling call keeps an Error whose
 * stack is read only for a callback that scheduled a React update.
 */
export function installTimers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  wrap('setTimeout');
  wrap('setInterval');
  wrap('requestAnimationFrame');
}
