import { libraryOf } from './stack';
export interface Hook {
  memoizedState: unknown;
  queue: { getSnapshot?: unknown; lastRenderedReducer?: unknown } | null;
  next: Hook | null;
}

export interface ContextDependency {
  context: { displayName?: string };
  memoizedValue: unknown;
  next: ContextDependency | null;
}

export interface Fiber {
  tag: number;
  key: string | null;
  type: any;
  elementType: any;
  stateNode: any;
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  index: number;
  alternate: Fiber | null;
  memoizedProps: any;
  memoizedState: any;
  dependencies: { firstContext: ContextDependency | null } | null;
  mode: number;
  flags: number;
  lanes?: number;
  childLanes?: number;
  actualDuration?: number;
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
  _debugOwner?: Fiber | null;
  _debugHookTypes?: string[] | null;
}

export interface FiberRoot {
  current: Fiber;
  containerInfo: Element;
  finishedLanes?: number;
  pendingLanes?: number;
}

export const Tag = {
  FunctionComponent: 0,
  ClassComponent: 1,
  IndeterminateComponent: 2,
  HostRoot: 3,
  HostPortal: 4,
  HostComponent: 5,
  HostText: 6,
  ForwardRef: 11,
  MemoComponent: 14,
  SimpleMemoComponent: 15,
  HostHoistable: 26,
  HostSingleton: 27,
} as const;

const ProfileMode = 0b000010;

export const isHost = (f: Fiber) => f.tag === Tag.HostComponent || f.tag === Tag.HostHoistable || f.tag === Tag.HostSingleton;

export const isComposite = (f: Fiber) => typeof f.type === 'function' || Boolean(f.type?.render || f.type?.type);

/** Components that read hooks: functions, forwardRef and memo, but not classes. */
export const hasHooks = (f: Fiber) =>
  f.tag === Tag.FunctionComponent || f.tag === Tag.ForwardRef || f.tag === Tag.SimpleMemoComponent || f.tag === Tag.IndeterminateComponent;

export const hasProfileTimings = (f: Fiber) => (f.mode & ProfileMode) !== 0 && typeof f.actualDuration === 'number';

export function nameOf(f: Fiber): string | null {
  const t = f.type;
  if (t == null || typeof t === 'string') return null;
  if (typeof t === 'function') return t.displayName || f.elementType?.displayName || t.name || 'Anonymous';
  if (typeof t === 'object') {
    if (t.displayName) return t.displayName;
    if (t.render) return t.render.displayName || t.render.name || 'ForwardRef';
    if (t.type) return t.type.displayName || t.type.name || 'Memo';
    if (t._context) return `Provider(${t._context.displayName || 'context'})`;
  }
  return null;
}

export const isProvider = (name: string) => name.startsWith('Provider(');

/** `src/pages/Trade/Row.tsx:42`: relative to the project root when known, else from the last `/src/`. */
const libraryByType = new WeakMap<object, boolean>();

/**
 * A component of the app or of a package. `_debugSource` on a fiber says where the component was *used*, so a
 * UI-kit component written in app JSX looks like the app's own; where it is *defined* shows in the element it
 * returns. App code is built with the dev JSX transform and its elements carry a source and an owner, packages
 * ship compiled and theirs carry neither.
 */
export function isLibraryFiber(f: Fiber): boolean {
  const type = (typeof f.type === 'function' || (f.type && typeof f.type === 'object') ? f.type : null) as object | null;
  const known = type ? libraryByType.get(type) : undefined;
  if (known !== undefined) return known;
  const library = definedInPackage(f);
  if (type) libraryByType.set(type, library);
  return library;
}

function definedInPackage(f: Fiber): boolean {
  // The element under the component — the one it returned, or the children it passed through. App code is built
  // with the dev transform and its elements carry the file they were written in; a package's do not.
  const child = f.child;
  const file = (child ?? f)._debugSource?.fileName;
  return !file || libraryOf(file) !== null;
}

export function sourceOf(f: Fiber, root = ''): string {
  const s = f._debugSource;
  if (!s) return '';
  return `${relativeFile(s.fileName, root)}:${s.lineNumber}`;
}

export function relativeFile(fileName: string, root = ''): string {
  const file = fileName.replace(/[?#].*$/, '');
  if (root && file.startsWith(root)) return file.slice(root.length).replace(/^\/+/, '');
  const i = file.lastIndexOf('/src/');
  return i >= 0 ? file.slice(i + 1) : file.split('/').slice(-3).join('/');
}

let fiberKey: string | null = null;

export function fiberFromNode(node: Node | null): Fiber | null {
  for (let el: Node | null = node; el; el = el.parentNode) {
    if (!fiberKey) fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$')) ?? null;
    const fiber = fiberKey ? (el as unknown as Record<string, Fiber | undefined>)[fiberKey] : undefined;
    if (fiber) return fiber;
  }
  return null;
}

export function hostRootOf(f: Fiber): FiberRoot | null {
  let node: Fiber | null = f;
  while (node?.return) node = node.return;
  return node?.tag === Tag.HostRoot ? (node.stateNode as FiberRoot) : null;
}

/** React roots mounted in the page: `#root`, children of body and their children. */
export function findRoots(doc: Document = document): FiberRoot[] {
  const candidates = [doc.getElementById('root'), ...Array.from(doc.body?.children ?? [])];
  for (const el of Array.from(doc.body?.children ?? [])) candidates.push(...Array.from(el.children));
  const roots = new Set<FiberRoot>();
  for (const el of candidates) {
    if (!el) continue;
    const key = Object.keys(el).find((k) => k.startsWith('__reactContainer$'));
    const container = key ? (el as unknown as Record<string, Fiber | undefined>)[key] : undefined;
    if (container?.stateNode) roots.add(container.stateNode as FiberRoot);
  }
  return [...roots];
}

/** First host elements under a fiber along every branch; portals are followed, so modals count as inside. */
export function nearestHosts(f: Fiber, limit = 500): Element[] {
  const out: Element[] = [];
  const stack: Fiber[] = f.child ? [f.child] : [];
  if (isHost(f)) return [f.stateNode];
  while (stack.length && out.length < limit) {
    const node = stack.pop()!;
    if (node.sibling) stack.push(node.sibling);
    if (isHost(node)) {
      out.push(node.stateNode);
    } else if (node.tag === Tag.HostText) {
      const parent = (node.stateNode as Text).parentElement;
      if (parent && !out.includes(parent)) out.push(parent);
    } else if (node.child) {
      stack.push(node.child);
    }
  }
  return out;
}

/** Composite ancestors from the root down to the element's owner component. */
export function compositeChain(f: Fiber): Fiber[] {
  const chain: Fiber[] = [];
  for (let node: Fiber | null = f; node; node = node.return) if (isComposite(node)) chain.push(node);
  return chain.reverse();
}

export interface Renderer {
  version?: string;
  currentDispatcherRef?: { current: unknown } | { H: unknown };
  getLaneLabelMap?: () => Map<number, string>;
}

type InjectFn = ((renderer: Renderer) => number) & { rprCaptured?: boolean };

interface DevtoolsHook {
  renderers?: Map<number, Renderer>;
  inject?: InjectFn;
}

const captured = new Set<Renderer>();

/**
 * Remembers every renderer React injects into the DevTools hook. The hook's own `renderers` map is not reliable: the
 * React Refresh hook (Vite's react plugins) counts injections without storing them. Must run before react-dom loads;
 * installs a minimal hook when there is none, otherwise wraps the existing `inject` and keeps its behaviour.
 */
export function captureRenderers() {
  const target = globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook & Record<string, unknown> };
  let hook = target.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) {
    const renderers = new Map<number, Renderer>();
    const noop = () => {};
    hook = {
      renderers,
      supportsFiber: true,
      isDisabled: false,
      inject(renderer: Renderer) {
        const id = renderers.size + 1;
        renderers.set(id, renderer);
        return id;
      },
      onCommitFiberRoot: noop,
      onCommitFiberUnmount: noop,
      onPostCommitFiberRoot: noop,
      onScheduleFiberRoot: noop,
      checkDCE: noop,
      on: noop,
      off: noop,
      emit: noop,
      sub: () => noop,
    };
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
  }
  for (const renderer of hook.renderers?.values() ?? []) captured.add(renderer);
  const original = hook.inject;
  if (typeof original === 'function' && !original.rprCaptured) {
    const inject: InjectFn = function (this: unknown, renderer: Renderer) {
      captured.add(renderer);
      return original.call(this, renderer);
    };
    inject.rprCaptured = true;
    hook.inject = inject;
  }
}

function knownRenderers(): Renderer[] {
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  return [...captured, ...(hook?.renderers?.values() ?? [])];
}

export function reactVersion(): string | null {
  return knownRenderers().find((r) => r.version)?.version ?? null;
}

export function renderer(): Renderer | null {
  return knownRenderers().find((r) => r.currentDispatcherRef) ?? null;
}

/**
 * The committed fiber of an alternate pair. A stale half still points up to the HostRoot fiber of its own render;
 * only the committed tree ends at `root.current`.
 */
export function currentOf(f: Fiber): Fiber {
  let top = f;
  while (top.return) top = top.return;
  if (top.tag !== Tag.HostRoot || (top.stateNode as FiberRoot | null)?.current === top) return f;
  return f.alternate ?? f;
}

/** Nearest composite descendants on every branch; `skip` lets the walk pass through wrappers. */
export function compositeChildren(f: Fiber, skip: (f: Fiber) => boolean, limit = 100): Fiber[] {
  const out: Fiber[] = [];
  const stack: Fiber[] = [];
  const first = currentOf(f).child;
  if (first) stack.push(first);
  while (stack.length && out.length < limit) {
    const node = stack.pop()!;
    if (node.sibling) stack.push(node.sibling);
    if (isComposite(node) && !skip(node)) out.push(node);
    else if (node.child) stack.push(node.child);
  }
  return out;
}
