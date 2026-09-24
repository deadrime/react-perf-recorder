import { libraryOf, parseStack, servedPath } from '../core/stack';
export interface MemoStat {
  name: string;
  file: string;
  kind: string;
  size: number;
  calls: number;
  recomputes: number;
  hitRate: number;
  nestedCalls: number;
  recomputesOnArgSwitch: number;
  distinctArgs: number;
  /**
   * Recomputes for arguments whose answer was already pushed out: `size` other answers were stored since theirs.
   * The cache is a ring, so this happens even with more slots than argument sets.
   */
  evictions: number;
  /** A size-limited cache that keeps pushing out answers still in use: rows, cells or two forms sharing one selector. */
  evicting: boolean;
}

interface MemoRecord {
  name: string;
  file: string;
  kind: string;
  size: number;
  /** Where an unnamed one was created: a stack, formatted only if it gets into a report. */
  created?: Error;
  calls: number;
  recomputes: number;
  nestedCalls: number;
  recomputesOnArgSwitch: number;
  distinct: Set<string>;
  lastKey: string | null;
  evictions: number;
  /** For each argument set, how many recomputes there had been when its answer was stored. */
  storedAt: Map<string, number>;
}

export interface MemoInstrumentation {
  /** Wraps a memoizer factory (`memoize`, `memoizeWithArgs`, `createSelector`) so every memoized function it creates is counted. */
  instrument<F extends (...args: any[]) => any>(factory: F, kind: string, fnArg: number | 'lastFunction'): F;
  /** Names a memoized function; the build transform calls it after `const selectX = memoize(...)`. */
  name(fn: unknown, name: string, file: string): void;
  label(fn: Function): string | null;
  /** Whether any memoized function made through `instrument` is still alive: the library is in use on the page. */
  readonly used: boolean;
  start(): void;
  stop(): MemoStat[];
  readonly recording: boolean;
}

const MAX_DISTINCT = 64;

/** An unnamed memoized function goes by the first app frame that created it: `memoize in Row · Messages.tsx`. */
function createdAt(rec: MemoRecord): { name: string; file: string } {
  const frame = parseStack(rec.created?.stack ?? '')
    .slice(1)
    .find((f) => libraryOf(f.url) === null);
  if (!frame) return { name: rec.kind, file: '' };
  const file = servedPath(frame.url).replace(/^src\//, '');
  const fn = /^[A-Za-z_$][\w$]*$/.test(frame.fn) ? frame.fn : '';
  return { name: `${rec.kind} in ${fn ? `${fn} · ` : ''}${file.split('/').pop()}`, file };
}

/**
 * Counting must not change memoization: arguments inside nested selector calls are proxy-compare proxies, and any
 * property read would be recorded as a dependency. Only `typeof`, WeakMap lookups and `String()` of primitives touch them.
 */
export function createMemoInstrumentation(): MemoInstrumentation {
  const state = { on: false, depth: 0 };
  const byFn = new WeakMap<Function, MemoRecord>();
  const live = new Set<WeakRef<Function>>();
  const objectIds = new WeakMap<object, number>();
  let nextId = 1;

  const keyOf = (value: unknown): string => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      const text = String(value);
      return typeof value === 'bigint' ? `${text}n` : text.slice(0, 40);
    }
    let id = objectIds.get(value as object);
    if (!id) objectIds.set(value as object, (id = nextId++));
    return `#${id}`;
  };
  const argsKey = (args: unknown[]) => {
    let key = '';
    for (let i = 1; i < args.length; i++) key += `${i > 1 ? '|' : ''}${keyOf(args[i])}`;
    return key;
  };

  const instrument: MemoInstrumentation['instrument'] = (factory, kind, fnArg) =>
    function (this: unknown, ...args: any[]) {
      let index = typeof fnArg === 'number' ? fnArg : -1;
      if (fnArg === 'lastFunction') for (let i = args.length - 1; i >= 0 && index < 0; i--) if (typeof args[i] === 'function') index = i;
      const fn = args[index];
      if (typeof fn !== 'function') return factory.apply(this, args);
      const options = args[index + 1];
      const size = options && typeof options === 'object' && typeof options.size === 'number' ? options.size : 1;
      const rec: MemoRecord = {
        name: '',
        file: '',
        kind,
        size,
        calls: 0,
        recomputes: 0,
        nestedCalls: 0,
        recomputesOnArgSwitch: 0,
        distinct: new Set(),
        lastKey: null,
        evictions: 0,
        storedAt: new Map(),
        created: new Error(),
      };
      const inner = function (this: unknown, ...innerArgs: unknown[]) {
        if (state.on) rec.recomputes++;
        return fn.apply(this, innerArgs);
      };
      const wrappedArgs = args.slice();
      wrappedArgs[index] = inner;
      const memo = factory.apply(this, wrappedArgs);
      if (typeof memo !== 'function') return memo;
      const outer = function (this: unknown, ...callArgs: unknown[]) {
        if (!state.on) return memo.apply(this, callArgs);
        rec.calls++;
        const nested = state.depth > 0;
        if (nested) rec.nestedCalls++;
        const before = rec.recomputes;
        state.depth++;
        try {
          return memo.apply(this, callArgs);
        } finally {
          state.depth--;
          if (!nested) {
            const key = argsKey(callArgs);
            if (rec.recomputes > before) {
              if (rec.lastKey !== null && key !== rec.lastKey) rec.recomputesOnArgSwitch++;
              const stored = rec.storedAt.get(key);
              if (stored !== undefined && before - stored >= rec.size) rec.evictions++;
              if (rec.storedAt.size < MAX_DISTINCT || rec.storedAt.has(key)) rec.storedAt.set(key, rec.recomputes);
            }
            rec.lastKey = key;
            if (rec.distinct.size < MAX_DISTINCT) rec.distinct.add(key);
          }
        }
      };
      Object.assign(outer, memo);
      byFn.set(outer, rec);
      live.add(new WeakRef(outer));
      return outer;
    } as unknown as typeof factory;

  const records = () => {
    const out: MemoRecord[] = [];
    for (const ref of live) {
      const fn = ref.deref();
      if (!fn) live.delete(ref);
      else out.push(byFn.get(fn)!);
    }
    return out;
  };

  return {
    instrument,
    get recording() {
      return state.on;
    },
    get used() {
      return records().length > 0;
    },
    name(fn, name, file) {
      const rec = typeof fn === 'function' ? byFn.get(fn) : undefined;
      if (rec) Object.assign(rec, { name, file });
    },
    label(fn) {
      return byFn.get(fn)?.name || null;
    },
    start() {
      for (const rec of records())
        Object.assign(rec, {
          calls: 0,
          recomputes: 0,
          nestedCalls: 0,
          recomputesOnArgSwitch: 0,
          distinct: new Set(),
          lastKey: null,
          evictions: 0,
          storedAt: new Map(),
        });
      state.on = true;
      state.depth = 0;
    },
    stop() {
      state.on = false;
      // Re-executed modules (HMR) create a second function with the same name: sum them.
      const merged = new Map<string, MemoStat>();
      for (const rec of records()) {
        if (!rec.calls) continue;
        const { name, file } = rec.name ? rec : createdAt(rec);
        const key = `${name}|${file}`;
        const stat = merged.get(key) ?? {
          name,
          file,
          kind: rec.kind,
          size: rec.size,
          calls: 0,
          recomputes: 0,
          hitRate: 0,
          nestedCalls: 0,
          recomputesOnArgSwitch: 0,
          distinctArgs: 0,
          evictions: 0,
          evicting: false,
        };
        stat.calls += rec.calls;
        stat.recomputes += rec.recomputes;
        stat.nestedCalls += rec.nestedCalls;
        stat.recomputesOnArgSwitch += rec.recomputesOnArgSwitch;
        stat.evictions += rec.evictions;
        stat.distinctArgs = Math.max(stat.distinctArgs, rec.distinct.size);
        merged.set(key, stat);
      }
      return [...merged.values()]
        .map((stat) => ({
          ...stat,
          hitRate: stat.calls ? +(1 - stat.recomputes / stat.calls).toFixed(3) : 0,
          // More argument sets than slots, recomputing as they alternate; or answers pushed out while still in use,
          // which a ring with room for every argument set does too.
          evicting:
            stat.recomputes >= 10 &&
            ((stat.recomputesOnArgSwitch / stat.recomputes >= 0.5 && stat.distinctArgs > stat.size) || stat.evictions / stat.recomputes >= 0.25),
        }))
        .sort((a, b) => b.recomputes - a.recomputes);
    },
  };
}
