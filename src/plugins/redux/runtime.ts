import { definePlugin, type SessionContext } from '../../runtime';
import { changedKeys, packageOfStack as packageOfStackOf } from '../store-shared';

interface Store {
  getState(): unknown;
  dispatch(action: unknown): unknown;
}

type Dispatch = (action: unknown) => unknown;

// By `getState`: an enhancer's store is another object around the same state, and useSelector hands getState over.
const stores = new Map<Function, WeakRef<Store>>();
const names = new WeakMap<Function, string>();
const origins = new WeakMap<Function, string>();
let anonymous = 0;

/** The package that made a store, from the stack of redux's createStore; RTK's configureStore is passed over. */
export const packageOfStack = (stack: string | undefined) => packageOfStackOf(stack, ['redux', '@reduxjs/toolkit']);

const isStore = (value: unknown): value is Store =>
  Boolean(value) && typeof (value as Store).getState === 'function' && typeof (value as Store).dispatch === 'function';

function register(store: unknown, stack?: string) {
  if (!isStore(store) || stores.has(store.getState)) return;
  stores.set(store.getState, new WeakRef(store));
  const origin = packageOfStack(stack);
  if (origin) origins.set(store.getState, origin);
}

export function nameStore(store: unknown, name: string) {
  if (isStore(store)) names.set(store.getState, name);
}

const storeName = (getState: Function) => {
  let name = names.get(getState);
  if (!name) {
    const origin = origins.get(getState);
    names.set(getState, (name = origin ? `${origin}#${++anonymous}` : `store${++anonymous}`));
  }
  return name;
};

let session: SessionContext | null = null;
// Per store, per action type: a page with a chart library's store and the app's keeps them apart.
const counts = new Map<string, Map<string, number>>();

/**
 * Called by redux's own dispatch (see `registerStores` in ./index.ts), under every middleware: the action a reducer
 * ran for, and the slices it changed. An action that changed nothing is no cause of a commit.
 */
function dispatchOf(store: Store, dispatch: Dispatch, action: unknown) {
  if (!session) return dispatch(action);
  const prev = store.getState();
  const out = dispatch(action);
  const next = store.getState();
  if (prev !== next) {
    const type = String((action as { type?: unknown } | null)?.type ?? '(action)');
    const name = storeName(store.getState);
    const byType = counts.get(name) ?? new Map<string, number>();
    byType.set(type, (byType.get(type) ?? 0) + 1);
    counts.set(name, byType);
    session.emitCause({ type, changes: changedKeys(prev, next), data: { store: name }, aim: true });
  }
  return out;
}

// Filled by redux itself: the stores made before this module loaded wait in `made`.
const hook = ((globalThis as Record<string, any>).__REACT_PERF_RECORDER_REDUX__ ??= { made: [], seen: new WeakSet() }) as {
  made: Array<[unknown, string | undefined]>;
  seen: WeakSet<Function>;
  register?: (store: unknown, stack?: string) => void;
  dispatch?: (store: Store, dispatch: Dispatch, action: unknown) => unknown;
};
hook.register = register;
hook.dispatch = dispatchOf;
hook.made.splice(0).forEach(([store, stack]) => register(store, stack));

export default definePlugin(() => ({
  name: 'redux',
  describe(fn, kind) {
    return kind === 'store' && stores.has(fn) ? storeName(fn) : null;
  },
  start(context) {
    counts.clear();
    session = context;
  },
  stop() {
    session = null;
    let active = false;
    for (const [getState, ref] of stores) {
      if (ref.deref()) active = true;
      else stores.delete(getState);
    }
    const perStore = [...counts]
      .map(([store, byType]) => {
        const actions = [...byType].sort((a, b) => b[1] - a[1]);
        return { store, total: actions.reduce((sum, [, n]) => sum + n, 0), actions };
      })
      .sort((a, b) => b.total - a.total);
    const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;
    return {
      version: 1,
      active,
      highlights: perStore.length
        ? perStore.slice(0, 3).map(({ store, total, actions: [[type, n]] }) => `${store}: ${changes(total)}, most by ${type} ×${n}`)
        : ['no action changed a store during the recording'],
      metrics: {
        actions: { value: perStore.reduce((sum, s) => sum + s.total, 0), kind: 'count' },
        ...Object.fromEntries(
          perStore.flatMap(({ store, actions }) => actions.map(([type, n]) => [`${store} ${type}`, { value: n, kind: 'count' as const }]))
        ),
      },
      data: { stores: perStore.map(({ store, total, actions }) => ({ store, total, actions: actions.map(([type, n]) => ({ type, n })) })) },
    };
  },
}));
