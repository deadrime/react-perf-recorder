import type { HookInfo } from '../shared/schema';
import { Tag, renderer, type Fiber, type Hook } from './fiber';
import { hookTypeAt } from './reasons';

interface Frame {
  fn: string;
  url: string;
  line: number;
  column: number;
}

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

const V8_FRAME = /^\s*at (?:(?:async )?(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

export function parseStack(stack: string): Frame[] {
  const frames: Frame[] = [];
  for (const line of stack.split('\n')) {
    const m = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (!m) continue;
    frames.push({ fn: (m[1] ?? '').replace(/^Object\./, '').replace(/ \[as .+\]$/, ''), url: m[2], line: Number(m[3]), column: Number(m[4]) });
  }
  return frames;
}

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
    const custom = frames
      .slice(start, component)
      .map((f) => f.fn.split('.').pop() || '')
      .filter(Boolean)
      .reverse();
    const site = frames[component];
    const info: HookInfo = {
      ...(entry.index !== null ? { type: hookTypeAt(fiber, entry.index) } : {}),
      path: [...custom, entry.primitive],
      ...(site ? { generated: { url: site.url, line: site.line, column: site.column } } : {}),
    };
    if (entry.index !== null) hooks.set(entry.index, info);
    else if (entry.context && !contexts.has(entry.context)) contexts.set(entry.context, info);
  }
  return { hooks, contexts };
}
