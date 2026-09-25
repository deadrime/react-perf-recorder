import { definePlugin, type SessionContext } from '../../runtime';
import { changedKeys, receiveStores, REDUX_GLOBAL, StoreNames, storeOrigin } from '../store-shared';

interface Store {
  getState(): unknown;
  dispatch(action: unknown): unknown;
}

type Dispatch = (action: unknown) => unknown;

// By `getState`: an enhancer's store is another object around the same state, and useSelector hands getState over.
// Weak both ways: a store a page let go of is not kept alive by the recorder.
const byGetState = new WeakMap<Function, WeakRef<Store>>();
const stores = new Set<WeakRef<Store>>();
const names = new StoreNames(['redux', '@reduxjs/toolkit']);

/** The package that made a store, from the stack of redux's createStore; RTK's configureStore is passed over. */
export const packageOfStack = (stack: string | undefined) => storeOrigin(stack, ['redux', '@reduxjs/toolkit']);

const isStore = (value: unknown): value is Store =>
  Boolean(value) && typeof (value as Store).getState === 'function' && typeof (value as Store).dispatch === 'function';

function register(store: unknown, made?: Error) {
  if (!isStore(store) || byGetState.has(store.getState)) return;
  const ref = new WeakRef(store);
  byGetState.set(store.getState, ref);
  stores.add(ref);
  names.madeAt(store.getState, made);
}

export function nameStore(store: unknown, name: string) {
  if (isStore(store)) names.set(store.getState, name);
}

const storeName = (getState: Function) => names.get(getState);

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

// Filled by redux itself (`registerStores` in ./index.ts): its dispatch is routed here while a recording runs.
const hook = receiveStores(REDUX_GLOBAL, register);
hook.dispatch = dispatchOf;

// Told by react-redux as it renders (`followSelectors` in ./index.ts): the app's selector behind useSelector's
// wrapper, and the store and mapStateToProps behind a `connect`'s getSnapshot.
const appSelectors = new WeakMap<Function, Function>();
const connected = new WeakMap<Function, { getState: Function; mapState: Function | null }>();
hook.selector = (wrapped: Function, selector: Function) => appSelectors.set(wrapped, selector);
hook.snapshot = (fn: Function, store: Store, mapState: unknown) => {
  if (!connected.has(fn)) connected.set(fn, { getState: store.getState, mapState: typeof mapState === 'function' ? mapState : null });
};

export default definePlugin(() => ({
  name: 'redux',
  describe(fn, kind, next) {
    if (kind === 'selector') {
      const selector = appSelectors.get(fn);
      return selector ? next(selector) : null;
    }
    const connection = connected.get(fn);
    if (kind === 'snapshot') return connection ? `connect(${connection.mapState ? next(connection.mapState) : ''})` : null;
    const getState = connection?.getState ?? fn;
    return byGetState.has(getState) ? storeName(getState) : null;
  },
  start(context) {
    counts.clear();
    session = context;
  },
  stop() {
    session = null;
    for (const ref of stores) if (!ref.deref()) stores.delete(ref);
    const active = stores.size > 0;
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
