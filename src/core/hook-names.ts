import type { HookInfo } from '../shared/schema';
import { Tag, renderer, type Fiber, type Hook } from './fiber';
import { hookTypeAt } from './reasons';
import { libraryOf, parseStack } from './stack';

export { parseStack } from './stack';

interface LoggedHook {
  primitive: string;
  /** The context a `useContext` call read: context reasons get the same custom-hook path. */
  context?: object;
  /** Index of the first hook object the call consumed: the same `#N` the reasons use. */
  index: number | null;
  stack: string;
}

const RENDER_MARK = '__rprInspectRender';
const DISPATCHER_MARK = '__rpr_';
/** What React fills a fresh compiler cache with, and what says "nothing in a form is pending". */
const MEMO_CACHE_SENTINEL = Symbol.for('react.memo_cache_sentinel');
const NOT_PENDING = Object.freeze({ pending: false, data: null, method: null, action: null });

/**
 * Re-runs a function component with a stand-in dispatcher, like React DevTools does when a component is selected, and
 * reads which custom hooks each primitive hook was called from. Never call it inside a commit.
 */
export interface InspectedHooks {
  hooks: Map<number, HookInfo>;
  contexts: Map<object, HookInfo>;
}

export function inspectHooks(fiber: Fiber): InspectedHooks | null {
  const render = renderFunctionOf(fiber);
  const ref = renderer()?.currentDispatcherRef as { current?: unknown; H?: unknown } | undefined;
  if (!render || !ref) return null;
  const log: LoggedHook[] = [];
  let hook = fiber.memoizedState as Hook | null;
  let index = 0;
  const next = () => {
    const current = hook;
    if (hook) hook = hook.next;
    index++;
    return current;
  };
  const logged = (primitive: string, first: number | null, context?: object) =>
    log.push({ primitive, index: first, context, stack: new Error().stack ?? '' });
  const stateHook = (primitive: string, count = 1) => {
    const first = index;
    const current = next();
    for (let i = 1; i < count; i++) next();
    logged(primitive, first);
    return current;
  };
  const noop = () => {};
  const readContext = (context: { _currentValue?: unknown }) => context._currentValue;

  // Method names carry a marker so their own stack frame is recognised and skipped.
  const dispatcher: Record<string, Function> = {
    readContext,
    useContext: function __rpr_useContext(context: { _currentValue?: unknown }) {
      logged('Context', null, context);
      return readContext(context);
    },
    useState: function __rpr_useState() {
      const h = stateHook('State');
      return [h?.memoizedState, noop];
    },
    useReducer: function __rpr_useReducer() {
      const h = stateHook('Reducer');
      return [h?.memoizedState, noop];
    },
    useRef: function __rpr_useRef() {
      return stateHook('Ref')?.memoizedState ?? { current: undefined };
    },
    useEffect: function __rpr_useEffect() {
      stateHook('Effect');
    },
    useLayoutEffect: function __rpr_useLayoutEffect() {
      stateHook('LayoutEffect');
    },
    useInsertionEffect: function __rpr_useInsertionEffect() {
      stateHook('InsertionEffect');
    },
    useImperativeHandle: function __rpr_useImperativeHandle() {
      stateHook('ImperativeHandle');
    },
    useCallback: function __rpr_useCallback(callback: unknown) {
      const h = stateHook('Callback');
      return Array.isArray(h?.memoizedState) ? h!.memoizedState[0] : callback;
    },
    useMemo: function __rpr_useMemo(create: () => unknown) {
      const h = stateHook('Memo');
      return Array.isArray(h?.memoizedState) ? h!.memoizedState[0] : create();
    },
    useDebugValue: function __rpr_useDebugValue() {},
    useDeferredValue: function __rpr_useDeferredValue(value: unknown) {
      const h = stateHook('DeferredValue');
      return h ? h.memoizedState : value;
    },
    // React keeps an isPending state hook and the start function hook.
    useTransition: function __rpr_useTransition() {
      const h = stateHook('Transition', 2);
      return [Boolean(h?.memoizedState), noop];
    },
    // The store hook plus the effect that subscribes to it.
    useSyncExternalStore: function __rpr_useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) {
      const h = stateHook('SyncExternalStore', 2);
      return h ? h.memoizedState : getSnapshot();
    },
    useId: function __rpr_useId() {
      return stateHook('Id')?.memoizedState ?? '';
    },
    useMutableSource: function __rpr_useMutableSource() {
      stateHook('MutableSource');
    },
    useCacheRefresh: function __rpr_useCacheRefresh() {
      stateHook('CacheRefresh');
      return noop;
    },

    // ---- React 19 ------------------------------------------------------------------------------------------------
    // Without these the stand-in throws at the first one and the component's hooks are named only up to it.

    /** A context is read like `useContext`; a promise gives up its value only if it already has one. */
    use: function __rpr_use(usable: unknown) {
      if (usable && typeof usable === 'object') {
        if ('_currentValue' in usable) {
          const context = usable as { _currentValue?: unknown };
          logged('Context', null, context);
          return readContext(context);
        }
        const thenable = usable as { then?: unknown; status?: string; value?: unknown; reason?: unknown };
        if (typeof thenable.then === 'function') {
          if (thenable.status === 'fulfilled') return thenable.value;
          if (thenable.status === 'rejected') throw thenable.reason;
          // Pending: React would suspend here, and so does the inspection — the hooks before it are still named.
          throw new Error('use() is still pending');
        }
      }
      return undefined;
    },
    // The state, the pending flag and the action queue.
    useActionState: function __rpr_useActionState(_action: unknown, initialState: unknown) {
      const h = stateHook('ActionState', 3);
      return [h ? h.memoizedState : initialState, noop, false];
    },
    useFormState: function __rpr_useFormState(_action: unknown, initialState: unknown) {
      const h = stateHook('FormState', 3);
      return [h ? h.memoizedState : initialState, noop, false];
    },
    useOptimistic: function __rpr_useOptimistic(passthrough: unknown) {
      const h = stateHook('Optimistic');
      return [h ? h.memoizedState : passthrough, noop];
    },
    useEffectEvent: function __rpr_useEffectEvent(callback: unknown) {
      stateHook('EffectEvent');
      return typeof callback === 'function' ? callback : noop;
    },
    // The compiler's cache lives on the fiber's update queue, not in the hook list, so it takes no cell. The
    // sentinel is what React fills a fresh cache with, and it makes the compiled body recompute rather than read.
    useMemoCache: function __rpr_useMemoCache(size: number) {
      return new Array(typeof size === 'number' ? size : 0).fill(MEMO_CACHE_SENTINEL);
    },
    // What `useFormStatus` reads; outside a form action there is nothing pending.
    useHostTransitionStatus: function __rpr_useHostTransitionStatus() {
      return NOT_PENDING;
    },
  };

  const restoreContexts = setupContexts(fiber);
  // V8 keeps 10 frames by default: a chain like useSelector › useStore › useSyncExternalStoreWithSelector would lose the marker.
  const errorCtor = Error as ErrorConstructor & { stackTraceLimit?: number };
  const stackLimit = errorCtor.stackTraceLimit;
  errorCtor.stackTraceLimit = 100;
  const useH = ref.H !== undefined || !('current' in ref);
  const previous = useH ? ref.H : ref.current;
  if (useH) ref.H = dispatcher;
  else ref.current = dispatcher;
  const props = fiber.memoizedProps;
  const second = fiber.tag === Tag.ForwardRef ? (fiber as Fiber & { ref?: unknown }).ref ?? null : undefined;
  const marker = {
    [RENDER_MARK](): void {
      render(props, second);
    },
  };
  try {
    marker[RENDER_MARK]();
  } catch {
    // The stand-in values can make a component throw halfway; hooks logged so far are still valid.
  } finally {
    if (useH) ref.H = previous;
    else ref.current = previous;
    restoreContexts();
    errorCtor.stackTraceLimit = stackLimit;
  }
  return buildInfo(fiber, log);
}

function renderFunctionOf(fiber: Fiber): ((props: unknown, second?: unknown) => unknown) | null {
  if (fiber.tag === Tag.ForwardRef) return typeof fiber.type?.render === 'function' ? fiber.type.render : null;
  if (fiber.tag === Tag.FunctionComponent || fiber.tag === Tag.SimpleMemoComponent || fiber.tag === Tag.IndeterminateComponent) {
    return typeof fiber.type === 'function' && !fiber.type.prototype?.isReactComponent ? fiber.type : null;
  }
  return null;
}

/** Providers above the fiber put their values into the contexts for the duration of the call. */
function setupContexts(fiber: Fiber): () => void {
  const saved = new Map<{ _currentValue?: unknown }, unknown>();
  for (let node = fiber.return; node; node = node.return) {
    if (node.tag !== 10) continue;
    const context = node.type?._context ?? node.type;
    if (context && !saved.has(context)) {
      saved.set(context, context._currentValue);
      context._currentValue = node.memoizedProps?.value;
    }
  }
  return () => saved.forEach((value, context) => (context._currentValue = value));
}

const reactExport = (primitive: string) => `use${primitive}`;

function buildInfo(fiber: Fiber, log: LoggedHook[]): InspectedHooks {
  const hooks = new Map<number, HookInfo>();
  const contexts = new Map<object, HookInfo>();
  for (const entry of log) {
    if (entry.index === null && !entry.context) continue;
    const frames = parseStack(entry.stack);
    const renderAt = frames.findIndex((f) => f.fn.includes(RENDER_MARK));
    const dispatcherAt = frames.findIndex((f) => f.fn.includes(DISPATCHER_MARK));
    if (renderAt < 1 || dispatcherAt < 0 || dispatcherAt >= renderAt) continue;
    let start = dispatcherAt + 1;
    // React's export (`useState` in react.development.js) only forwards to the dispatcher.
    if (start < renderAt && frames[start].fn.split('.').pop() === reactExport(entry.primitive)) start++;
    const component = renderAt - 1;
    const steps = frames
      .slice(start, component)
      .map((f) => ({ name: f.fn.split('.').pop() || '', library: libraryOf(f.url) }))
      // The recorder's own wrappers (zustand, proxy-memoize) are not part of the app's chain.
      .filter((step) => step.name && step.library !== 'react-perf-recorder')
      .reverse();
    const site = frames[component];
    // Where the app hands over to a package: the edit is on the app side of it, the rest is how the package works.
    const at = steps.findIndex((step) => step.library !== null);
    const library = at >= 0 ? steps.slice(at).find((step) => step.library)?.library || 'deps' : undefined;
    const info: HookInfo = {
      ...(entry.index !== null ? { type: hookTypeAt(fiber, entry.index) } : {}),
      path: [...steps.map((step) => step.name), entry.primitive],
      ...(library ? { library, libraryAt: at } : {}),
      ...(site ? { generated: { url: site.url, line: site.line, column: site.column } } : {}),
    };
    if (entry.index !== null) hooks.set(entry.index, info);
    else if (entry.context && !contexts.has(entry.context)) contexts.set(entry.context, info);
  }
  return { hooks, contexts };
}
