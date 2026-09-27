import { originOf, type Origin } from '../stack';
import { scheduledByRecorder } from './timers';

interface Entry {
  kind: string;
  /** Weak: an observer the page dropped is garbage, not a leak, and the list must not keep it alive. */
  ref: WeakRef<object>;
  origin: Error;
  atMs: number;
  /** Observers only: targets observed now; one garbage collected no longer counts. */
  targets?: Array<WeakRef<object>>;
  closed?: boolean;
  url?: string;
}

const MAX_ENTRIES = 5000;
const MAX_TARGETS = 100;
const entries = new Set<Entry>();
const byObject = new WeakMap<object, Entry>();
const own = new WeakMap<Error, boolean>();
const origins = new WeakMap<Error, Origin>();
let installed = false;

/** `origin` is made by the wrapper itself: its caller, one frame up, is the page's line. */
function add(object: object, kind: string, origin: Error, url?: string): Entry | null {
  if (entries.size >= MAX_ENTRIES) for (const e of entries) if (!isLive(e)) entries.delete(e);
  if (entries.size >= MAX_ENTRIES) return null;
  const entry: Entry = { kind, ref: new WeakRef(object), origin, atMs: performance.now(), ...(url ? { url } : {}) };
  entries.add(entry);
  byObject.set(object, entry);
  return entry;
}

function isLive(e: Entry): boolean {
  const object = e.ref.deref() as { readyState?: number } | undefined;
  if (!object || e.closed) return false;
  if (e.targets) return e.targets.some((t) => t.deref());
  // WebSocket CLOSED is 3, EventSource CLOSED is 2; a BroadcastChannel says nothing and is closed by close().
  if (e.kind === 'WebSocket') return object.readyState !== 3;
  if (e.kind === 'EventSource') return object.readyState !== 2;
  return true;
}

/** `wss://host/path`: the query can carry a token, and the report goes to files and to a model. */
function safeUrl(url: unknown): string | undefined {
  try {
    const u = new URL(String(url), location.href);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return undefined;
  }
}

export interface LiveHandle {
  kind: string;
  url?: string;
  atMs: number;
  origin: () => Origin;
}

function live(filter: (e: Entry) => boolean): LiveHandle[] {
  const out: LiveHandle[] = [];
  for (const e of entries) {
    if (!filter(e)) continue;
    if (!isLive(e)) {
      if (!e.ref.deref()) entries.delete(e);
      continue;
    }
    let ours = own.get(e.origin);
    if (ours === undefined) own.set(e.origin, (ours = scheduledByRecorder(e.origin.stack ?? '')));
    if (ours) continue;
    let origin = origins.get(e.origin);
    if (!origin) origins.set(e.origin, (origin = originOf(e.origin)));
    if (!origin.text) continue;
    const found = origin;
    out.push({ kind: e.kind, ...(e.url ? { url: e.url } : {}), atMs: e.atMs, origin: () => found });
  }
  return out;
}

/** Observers observing something and never disconnected; the recorder's own are left out. */
export const liveObservers = () => live((e) => Boolean(e.targets));
/** Sockets and channels opened and not closed. */
export const liveConnections = () => live((e) => !e.targets);

function wrapObserver(kind: string) {
  const Native = (window as any)[kind] as { prototype: any } | undefined;
  if (typeof Native !== 'function') return;
  const proto = Native.prototype;
  const { observe, unobserve, disconnect } = proto;
  proto.observe = function (this: object, target: object, ...rest: unknown[]) {
    // Where the first observe was called is the line to look at: the constructor is often a module away.
    let entry = byObject.get(this);
    if (!entry) {
      entry = add(this, kind, new Error()) ?? undefined;
      if (entry) entry.targets = [];
    }
    const targets = entry?.targets;
    if (targets && target && typeof target === 'object' && targets.length < MAX_TARGETS && !targets.some((t) => t.deref() === target))
      targets.push(new WeakRef(target));
    return observe.call(this, target, ...rest);
  };
  if (typeof unobserve === 'function')
    proto.unobserve = function (this: object, target: object) {
      const entry = byObject.get(this);
      if (entry?.targets) entry.targets = entry.targets.filter((t) => t.deref() !== target);
      return unobserve.call(this, target);
    };
  proto.disconnect = function (this: object) {
    const entry = byObject.get(this);
    if (entry?.targets) entry.targets = [];
    return disconnect.call(this);
  };
}

function wrapConnection(kind: string) {
  const Native = (window as any)[kind];
  if (typeof Native !== 'function') return;
  // A proxy, not a subclass: statics, `prototype` and instanceof stay the native ones.
  (window as any)[kind] = new Proxy(Native, {
    construct(target, args, newTarget) {
      const origin = new Error();
      const object = Reflect.construct(target, args, newTarget);
      add(object, kind, origin, kind === 'BroadcastChannel' ? String(args[0]) : safeUrl(args[0]));
      return object;
    },
  });
  if (kind === 'BroadcastChannel') {
    const close = Native.prototype.close;
    Native.prototype.close = function (this: object) {
      const entry = byObject.get(this);
      if (entry) entry.closed = true;
      return close.call(this);
    };
  }
}

/** Wraps observers and connections at boot, so the ones started on mount are known before a recording asks. */
export function installObservers() {
  if (installed || typeof window === 'undefined' || typeof WeakRef === 'undefined') return;
  installed = true;
  ['ResizeObserver', 'IntersectionObserver', 'MutationObserver'].forEach(wrapObserver);
  ['WebSocket', 'EventSource', 'BroadcastChannel'].forEach(wrapConnection);
}
