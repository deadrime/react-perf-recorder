import { originOf, type Origin } from '../stack';
import { scheduledByRecorder } from './timers';

/**
 * Listeners on what lives as long as the page: window, document, <html>, <body>, visualViewport. A listener on an
 * element goes with the element, and a leak of elements shows in the DOM count instead.
 */
function labelOf(target: unknown): string | null {
  if (typeof window === 'undefined') return null;
  if (target === window) return 'window';
  if (target === document) return 'document';
  if (target === document.documentElement) return 'html';
  if (target === document.body) return 'body';
  if (target === window.visualViewport) return 'visualViewport';
  return null;
}

interface Entry {
  origin: Error;
  atMs: number;
}

type Listener = EventListenerOrEventListenerObject;

/** Per target, per `type|capture`: the same listener added twice is one, as the browser keeps it. */
const live = new Map<EventTarget, Map<string, Map<Listener, Entry>>>();
const own = new WeakMap<Error, boolean>();
const origins = new WeakMap<Error, Origin>();
let installed = false;

const captureOf = (options: unknown) => (typeof options === 'boolean' ? options : Boolean((options as AddEventListenerOptions | undefined)?.capture));

function remove(target: EventTarget, key: string, listener: Listener) {
  live.get(target)?.get(key)?.delete(listener);
}

export interface LiveListener {
  target: string;
  type: string;
  atMs: number;
  origin: () => Origin;
}

/** The app's listeners on the page's long-lived targets; the recorder's own panel and hooks are left out. */
export function liveListeners(): LiveListener[] {
  const out: LiveListener[] = [];
  for (const [target, byKey] of live) {
    const label = labelOf(target);
    if (!label) continue;
    for (const [key, listeners] of byKey)
      for (const entry of listeners.values()) {
        let ours = own.get(entry.origin);
        if (ours === undefined) own.set(entry.origin, (ours = scheduledByRecorder(entry.origin.stack ?? '')));
        if (ours) continue;
        let origin = origins.get(entry.origin);
        if (!origin) origins.set(entry.origin, (origin = originOf(entry.origin)));
        // Nothing of the page's own on the stack: a test driver's or an extension's listener.
        if (!origin.text) continue;
        const found = origin;
        out.push({ target: label, type: key.slice(0, key.lastIndexOf('|')), atMs: entry.atMs, origin: () => found });
      }
  }
  return out;
}

/** Wraps addEventListener at boot, so listeners added on mount are known before a recording asks. */
export function installListeners() {
  if (installed || typeof EventTarget === 'undefined' || typeof window === 'undefined') return;
  installed = true;
  // Where each target gets its methods from: EventTarget.prototype in a browser, a class of its own in a test DOM.
  const owners = new Set<object>([EventTarget.prototype]);
  for (const target of [window, document]) {
    let proto: object | null = target;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'addEventListener')) proto = Object.getPrototypeOf(proto);
    if (proto) owners.add(proto);
  }
  owners.forEach(wrap);
}

function wrap(proto: any) {
  const add = proto.addEventListener as EventTarget['addEventListener'];
  const del = proto.removeEventListener as EventTarget['removeEventListener'];
  if (typeof add !== 'function' || typeof del !== 'function') return;
  proto.addEventListener = function (this: EventTarget, type: string, listener: Listener | null, options?: boolean | AddEventListenerOptions) {
    const result = add.call(this, type, listener, options);
    // `once` removes itself, and an aborted signal removes it too — unseen by removeEventListener.
    const opts = typeof options === 'object' ? options : undefined;
    if (listener && labelOf(this) && !opts?.once && !opts?.signal?.aborted) {
      const key = `${type}|${captureOf(options)}`;
      let byKey = live.get(this);
      if (!byKey) live.set(this, (byKey = new Map()));
      let listeners = byKey.get(key);
      if (!listeners) byKey.set(key, (listeners = new Map()));
      if (!listeners.has(listener) && listeners.size < MAX_PER_KEY) {
        listeners.set(listener, { origin: new Error(), atMs: performance.now() });
        const target = this;
        opts?.signal?.addEventListener('abort', () => remove(target, key, listener), { once: true });
      }
    }
    return result;
  };
  proto.removeEventListener = function (this: EventTarget, type: string, listener: Listener | null, options?: boolean | EventListenerOptions) {
    if (listener && live.has(this)) remove(this, `${type}|${captureOf(options)}`, listener);
    return del.call(this, type, listener, options);
  };
}

/** Past this many on one target and type the leak is plain, and the list stops growing with it. */
const MAX_PER_KEY = 5000;
