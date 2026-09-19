import { definePlugin, type PluginContext } from '../../runtime';
import { installDevtoolsShim } from './devtools-shim';

interface StoreApi {
  getState(): unknown;
  subscribe(listener: (state: unknown, prev: unknown) => void): () => void;
}

const stores = new Set<WeakRef<StoreApi>>();
const apiByGetState = new WeakMap<Function, StoreApi>();
const names = new WeakMap<StoreApi, string>();
const shallowInner = new WeakMap<Function, Function>();
const eventByState = new WeakMap<object, { type: string }>();
let anonymous = 0;

const apiOf = (value: unknown): StoreApi | null => {
  const candidate = value as Partial<StoreApi> | null;
  return candidate && typeof candidate.getState === 'function' && typeof candidate.subscribe === 'function' ? (candidate as StoreApi) : null;
};

function register(result: unknown) {
  const api = apiOf(result);
  if (api && !apiByGetState.has(api.getState)) {
    apiByGetState.set(api.getState, api);
    stores.add(new WeakRef(api));
  }
  return result;
}

/** `create(fn)` and the curried `create<T>()(fn)` of zustand, `createStore` of zustand/vanilla. */
export function wrapCreate<F extends (...args: any[]) => any>(factory: F): F {
  if (typeof factory !== 'function') return factory;
  return function (this: unknown, ...args: unknown[]) {
    if (args[0] === undefined) return (initializer: unknown) => register(factory.call(this, initializer));
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
  if (api) names.set(api, name);
}

const storeName = (api: StoreApi) => {
  let name = names.get(api);
  if (!name) names.set(api, (name = `store${++anonymous}`));
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
      for (const ref of stores) {
        const api = ref.deref();
        if (!api) {
          stores.delete(ref);
          continue;
        }
        const name = storeName(api);
        unsubscribes.push(
          api.subscribe((state, prev) => {
            counts.set(name, (counts.get(name) ?? 0) + 1);
            const event = session.emitCause({ type: `${name}.setState`, changes: changedKeys(prev, state), data: { store: name } });
            if (event && state && typeof state === 'object') eventByState.set(state as object, event);
          })
        );
      }
    },
    stop() {
      unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
      const list = [...counts].sort((a, b) => b[1] - a[1]);
      return {
        version: 1,
        highlights: list.slice(0, 3).map(([name, n]) => `${name}: ${n} updates`),
        metrics: {
          'actions.named': { value: actions, kind: 'count' },
          ...Object.fromEntries(list.map(([name, n]) => [`${name}.updates`, { value: n, kind: 'count' as const }])),
        },
        data: { stores: list.map(([name, updates]) => ({ name, updates })) },
      };
    },
  };
});
