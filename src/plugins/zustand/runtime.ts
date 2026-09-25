import { definePlugin, type PluginContext } from '../../runtime';
import { changedKeys, receiveStores, StoreNames, storeOrigin, ZUSTAND_GLOBAL } from '../store-shared';
import { installDevtoolsShim } from './devtools-shim';

interface StoreApi {
  getState(): unknown;
  subscribe(listener: (state: unknown, prev: unknown) => void): () => void;
}

const stores = new Set<WeakRef<StoreApi>>();
const apiByGetState = new WeakMap<Function, StoreApi>();
// By `getState`: `create` hands out a hook and zustand/vanilla the api it wraps, two objects for one store.
const names = new StoreNames(['zustand']);
const shallowInner = new WeakMap<Function, Function>();
const eventByState = new WeakMap<object, { type: string }>();
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

/** The package that made a store, from the stack of `createStoreImpl`. */
export const packageOfStack = (stack: string | undefined) => storeOrigin(stack, ['zustand']);

// Filled by zustand/vanilla itself (`registerStores` in ./index.ts): the stores of the app and of its libraries.
const hook = receiveStores(ZUSTAND_GLOBAL, (result, made) => {
  const api = apiOf(result);
  if (api) names.madeAt(api.getState, made);
  register(result);
});

// zustand 5's own getSnapshot of each `useStore` (`followSnapshots` in ./index.ts): its store and selector.
const snapshots = new WeakMap<Function, { api: StoreApi; selector: Function }>();
hook.snapshot = (fn: Function, api: StoreApi, selector: Function) => {
  if (!snapshots.has(fn)) snapshots.set(fn, { api, selector });
};

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

const storeName = (api: StoreApi) => names.get(api.getState);

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
      const snapshot = snapshots.get(fn);
      // `useStore(api)` without a selector reads the whole state through zustand's own `identity`.
      if (kind === 'snapshot') return snapshot ? (snapshot.selector.name === 'identity' ? 'whole state' : next(snapshot.selector)) : null;
      const api = apiByGetState.get(fn) ?? snapshot?.api;
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
      const active = [...stores].some((ref) => ref.deref());
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
