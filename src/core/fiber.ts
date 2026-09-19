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
  actualDuration?: number;
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
  _debugHookTypes?: string[] | null;
}

export interface FiberRoot {
  current: Fiber;
  containerInfo: Element;
  finishedLanes?: number;
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

export function reactVersion(): string | null {
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { renderers?: Map<number, { version?: string }> } }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  for (const renderer of hook?.renderers?.values() ?? []) if (renderer.version) return renderer.version;
  return null;
}

export interface Renderer {
  version?: string;
  currentDispatcherRef?: { current: unknown } | { H: unknown };
  getLaneLabelMap?: () => Map<number, string>;
}

export function renderer(): Renderer | null {
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { renderers?: Map<number, Renderer> } }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  for (const r of hook?.renderers?.values() ?? []) if (r.currentDispatcherRef) return r;
  return null;
}
