import { definePlugin, type PluginContext } from '../../runtime';
import { libraryOf } from '../../core/stack';
import { installDevtoolsShim } from './devtools-shim';

interface StoreApi {
  getState(): unknown;
  subscribe(listener: (state: unknown, prev: unknown) => void): () => void;
}

const stores = new Set<WeakRef<StoreApi>>();
const apiByGetState = new WeakMap<Function, StoreApi>();
// By `getState`: `create` hands out a hook and zustand/vanilla the api it wraps, two objects for one store.
const names = new WeakMap<Function, string>();
const shallowInner = new WeakMap<Function, Function>();
const eventByState = new WeakMap<object, { type: string }>();
let anonymous = 0;
/** Set while a recording runs: a store made from now on — a lazy module, one per component — is followed at once. */
let follow: ((api: StoreApi) => void) | null = null;

const apiOf = (value: unknown): StoreApi | null => {
  const candidate = value as Partial<StoreApi> | null;
  return candidate && typeof candidate.getState === 'function' && typeof candidate.subscribe === 'function' ? (candidate as StoreApi) : null;
};

function register(result: unknown) {
  const api = apiOf(result);
  if (api && !apiByGetState.has(api.getState)) {
    apiByGetState.set(api.getState, api);
    stores.add(new WeakRef(api));
    follow?.(api);
  }
  return result;
}

const origins = new WeakMap<Function, string>();

/** The package that made a store, from the stack of `createStoreImpl`: `@xyflow/react` for `.vite/deps/@xyflow_react.js`. */
export function packageOfStack(stack: string | undefined): string | null {
  for (const line of (stack ?? '').split('\n').slice(1)) {
    const url = /(?:(?:https?|file):\/\/|\/)[^\s()]+/
      .exec(line)?.[0]
      .replace(/[?#].*$/, '')
      .replace(/(:\d+)+$/, '');
    if (!url) continue;
    const pkg = libraryOf(url);
    // The app's code, or a linked package served by its path: the store is theirs, and the declaration names it.
    if (pkg === null) return null;
    if (pkg && pkg !== 'zustand' && pkg !== 'react-perf-recorder') return pkg;
  }
  return null;
}

// Filled by zustand/vanilla itself (`registerStores` in ./index.ts): the stores of the app and of its libraries.
const made = ((globalThis as Record<string, any>).__REACT_PERF_RECORDER_ZUSTAND__ ??= { made: [] }) as {
  made: Array<[unknown, string | undefined]>;
  register?: (api: unknown, stack?: string) => unknown;
};
made.register = (result, stack) => {
  const api = apiOf(result);
  const origin = api && packageOfStack(stack);
  if (api && origin) origins.set(api.getState, origin);
  return register(result);
};
made.made.splice(0).forEach(([api, stack]) => made.register!(api, stack));

/** `create(fn)` and the curried `create<T>()(fn)` of zustand, `createStore` of zustand/vanilla. */
export function wrapCreate<F extends (...args: any[]) => any>(factory: F): F {
  if (typeof factory !== 'function') return factory;
  return function (this: unknown, ...args: unknown[]) {
    // The curried `create<T>()(init, equalityFn)`: the store is made by the second call, with all of its arguments.
    if (args[0] === undefined) {
      const curried = factory.apply(this, args) as (...inner: unknown[]) => unknown;
      return (...inner: unknown[]) => register(curried(...inner));
    }
    return register(factory.apply(this, args));
  } as F;
}

export function wrapUseShallow<F extends (...args: any[]) => any>(useShallow: F): F {
  if (typeof useShallow !== 'function') return useShallow;
  return ((selector: Function) => {
    const fn = useShallow(selector);
    shallowInner.set(fn, selector);
    return fn;
  }) as unknown as F;
}

export function nameStore(store: unknown, name: string) {
  const api = apiOf(store);
  if (api) names.set(api.getState, name);
}

const storeName = (api: StoreApi) => {
  let name = names.get(api.getState);
  if (!name) {
    const origin = origins.get(api.getState);
    names.set(api.getState, (name = origin ? `${origin}#${++anonymous}` : `store${++anonymous}`));
  }
  return name;
};

const MAX_KEYS = 40;

function changedKeys(prev: unknown, next: unknown) {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return [{ key: '(state)', prev, next }];
  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const out: Array<{ key: string; prev: unknown; next: unknown }> = [];
  for (const key of Object.keys(b)) if (a[key] !== b[key] && out.length < MAX_KEYS) out.push({ key, prev: a[key], next: b[key] });
  return out;
}

export default definePlugin((options: { devtools?: boolean } | null) => {
  const unsubscribes: Array<() => void> = [];
  const counts = new Map<string, number>();
  let ctx: PluginContext | null = null;
  let actions = 0;
  return {
    name: 'zustand',
    setup(context) {
      ctx = context;
      if (options?.devtools === false) return;
      installDevtoolsShim((action, state) => {
        if (!ctx?.recording || !state || typeof state !== 'object') return;
        const event = eventByState.get(state as object);
        const type = typeof action === 'string' ? action : (action as { type?: string } | null)?.type;
        // `set()` without a name reaches devtools as `anonymous`: keep `<store>.setState`, its keys say more.
        if (event && type && type !== 'anonymous') {
          event.type = type;
          actions++;
        }
      });
    },
    describe(fn, kind, next) {
      if (kind === 'selector') {
        const inner = shallowInner.get(fn);
        return inner ? `useShallow(${next(inner)})` : null;
      }
      const api = apiByGetState.get(fn);
      return api ? storeName(api) : null;
    },
    start(session) {
      counts.clear();
      actions = 0;
      follow = (api) => {
        // The name is read when the store changes: `nameStore` runs after `create`, at the end of its module.
        unsubscribes.push(
          api.subscribe((state, prev) => {
            const name = storeName(api);
            counts.set(name, (counts.get(name) ?? 0) + 1);
            const event = session.emitCause({ type: `${name}.setState`, changes: changedKeys(prev, state), data: { store: name }, aim: true });
            if (event && state && typeof state === 'object') eventByState.set(state as object, event);
          })
        );
      };
      for (const ref of stores) {
        const api = ref.deref();
        if (api) follow(api);
        else stores.delete(ref);
      }
    },
    stop() {
      follow = null;
      unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
      const list = [...counts].sort((a, b) => b[1] - a[1]);
      let active = false;
      for (const ref of stores) if (ref.deref()) active = true;
      return {
        version: 1,
        active,
        highlights: list.length ? list.slice(0, 3).map(([name, n]) => `${name}: ${n} updates`) : ['no store updates during the recording'],
        metrics: {
          'actions.named': { value: actions, kind: 'count' },
          ...Object.fromEntries(list.map(([name, n]) => [`${name}.updates`, { value: n, kind: 'count' as const }])),
        },
        data: { stores: list.map(([name, updates]) => ({ name, updates })) },
      };
    },
  };
});
