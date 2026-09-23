import { contextOf, isConsumerTag, isProviderTag, siteOf } from './react-compat';
import { mappedSite } from './sites';
import { libraryOf } from './stack';

export { captureRenderers, laneLabel, reactVersion, renderer, sourcesUnavailable, type Renderer } from './react-compat';
export { onSitesMapped, setSiteMapper, type Position, type SiteMapper } from './sites';

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
  /** React 18 only: where the element was written. React 19.1 replaced it with `_debugStack`. */
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
  /** React 19.1+: an owner stack whose second frame is where the element was written. */
  _debugStack?: unknown;
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

/**
 * The top of a subtree mounted into a tree that was already there — a row added, a modal opened, or a component
 * thrown away and mounted again. The page's own first mount, straight under the root, is not one.
 */
export const mountedInPlace = (f: Fiber) =>
  f.alternate === null && isComposite(f) && f.return !== null && f.return.alternate !== null && f.return.tag !== Tag.HostRoot;

/** Components that read hooks: functions, forwardRef and memo, but not classes. */
export const hasHooks = (f: Fiber) =>
  f.tag === Tag.FunctionComponent || f.tag === Tag.ForwardRef || f.tag === Tag.SimpleMemoComponent || f.tag === Tag.IndeterminateComponent;

export const hasProfileTimings = (f: Fiber) => (f.mode & ProfileMode) !== 0 && typeof f.actualDuration === 'number';

export function nameOf(f: Fiber): string | null {
  // Told by the tag: React 18 hangs the context off the provider's type, React 19 made the context its own
  // provider and gave the consumer the `_context` the provider used to have.
  if (isProviderTag(f.tag)) return `Provider(${contextOf(f)?.displayName || 'context'})`;
  if (isConsumerTag(f.tag)) return `Consumer(${contextOf(f)?.displayName || 'context'})`;
  const t = f.type;
  if (t == null || typeof t === 'string') return null;
  if (typeof t === 'function') return t.displayName || f.elementType?.displayName || t.name || 'Anonymous';
  if (typeof t === 'object') {
    if (t.displayName) return t.displayName;
    if (t.render) return t.render.displayName || t.render.name || 'ForwardRef';
    if (t.type) return t.type.displayName || t.type.name || 'Memo';
  }
  return null;
}

export const isProvider = (name: string) => name.startsWith('Provider(');

/**
 * A component whose whole job is to hand a context down — `const Settings = ({children}) => <Ctx.Provider …>`.
 * Told by what it renders rather than by its name: the path to an area is about where it is, not what wraps it.
 */
export function wrapsProvider(f: Fiber): boolean {
  const child = currentOf(f).child;
  return Boolean(child && !child.sibling && isProvider(nameOf(child) ?? ''));
}

/** `src/pages/Trade/Row.tsx:42`: relative to the project root when known, else from the last `/src/`. */
const libraryByType = new WeakMap<object, boolean>();

/**
 * A component of the app or of a package. The site of a fiber says where the component was *used*, so a UI-kit
 * component written in app JSX looks like the app's own; where it is *defined* shows in the element it returns.
 * The file comes from `_debugSource` on React 18 and from the owner stack on React 19.1+; either way it is the
 * file that answers, so a package's own components are found without listing their names.
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
  const site = siteOf(f.child ?? f);
  return !site || libraryOf(site.url) !== null;
}

/**
 * `src/components/Row.tsx:42`. React 19 answers with a position in the module the dev server built, which only a
 * source map turns back into a line of the file, so until that happens the line is left off rather than guessed;
 * `generatedSourceOf` carries the position the server maps when the recording is saved.
 */
export function sourceOf(f: Fiber, root = ''): string {
  const site = siteOf(f);
  if (!site) return '';
  const file = relativeFile(site.url, root);
  if (site.exact) return `${file}:${site.line}`;
  // The dev server maps the built position; asking puts it in the next batch, and the file alone does for now.
  return mappedSite(site) || file;
}

/** The built position to map through the dev server, when the fiber's own is not the file's. */
export function generatedSourceOf(f: Fiber): { url: string; line: number; column: number } | undefined {
  const site = siteOf(f);
  return site && !site.exact ? { url: site.url, line: site.line, column: site.column } : undefined;
}

/** What tells two call sites apart in a root's key, whether or not the position can be shown yet. */
export function siteKeyOf(f: Fiber, root = ''): string {
  const site = siteOf(f);
  return site ? `${relativeFile(site.url, root)}:${site.line}:${site.column}` : '';
}

export function relativeFile(fileName: string, root = ''): string {
  // A React 19 site is a URL the dev server served: `http://localhost:5173/src/App.tsx?t=1`.
  const file = fileName.replace(/^[a-z]+:\/\/[^/]+/, '').replace(/[?#].*$/, '');
  if (root && file.startsWith(root)) return file.slice(root.length).replace(/^\/+/, '');
  const i = file.lastIndexOf('/src/');
  return i >= 0 ? file.slice(i + 1) : file.replace(/^\/+/, '').split('/').slice(-3).join('/');
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

/** Roots the app created, as the proxy of `react-dom/client` reports them: found wherever they are mounted. */
const created = new Set<WeakRef<FiberRoot>>();

export function registerRoot(root: FiberRoot) {
  created.add(new WeakRef(root));
}

/** React roots mounted in the page: the ones the app created, then `#root`, children of body and their children. */
export function findRoots(doc: Document = document): FiberRoot[] {
  const roots = new Set<FiberRoot>();
  for (const ref of created) {
    const root = ref.deref();
    if (!root) created.delete(ref);
    else if (root.containerInfo?.isConnected && root.current) roots.add(root);
  }
  const candidates = [doc.getElementById('root'), ...Array.from(doc.body?.children ?? [])];
  for (const el of Array.from(doc.body?.children ?? [])) candidates.push(...Array.from(el.children));
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
