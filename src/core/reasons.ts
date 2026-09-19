import { sameContent } from '../shared/same-content';
import { hasHooks, Tag, type ContextDependency, type Fiber, type Hook } from './fiber';

export interface Snapshot {
  props: unknown;
  state: unknown;
  /** Head of the context dependency list: React builds a new list on every render, the old one stays intact. */
  ctx: ContextDependency | null;
}

export interface Reason {
  text: string;
  /** Index `#N` in the hook list, for external store and state reasons. */
  hook?: number;
}

export interface Describer {
  selector(fn: Function): string;
  store(getSnapshot: Function): string | null;
}

const same = (a: unknown, b: unknown) => sameContent(a, b, 20_000) === true;
// Runs for every render caused by a parent, so the budget is smaller than for cascade roots.
const sameCheap = (a: unknown, b: unknown) => sameContent(a, b, 2_000) === true;

export function snapshotOf(f: Fiber): Snapshot {
  return { props: f.memoizedProps, state: f.memoizedState, ctx: f.dependencies?.firstContext ?? null };
}

/**
 * A render gives a function with hooks a new hook list and any context reader a new dependency list; a memo component
 * that only reads a context keeps its props and state objects, so the context list is what shows its render.
 * Bailouts copy the list pointer, so skipped fibers compare equal.
 */
export function didRender(prev: Snapshot | undefined, f: Fiber): boolean {
  return Boolean(prev) && (prev!.props !== f.memoizedProps || prev!.state !== f.memoizedState || prev!.ctx !== (f.dependencies?.firstContext ?? null));
}

function propsReason(before: unknown, after: unknown): Reason {
  const a = (before || {}) as Record<string, unknown>;
  const b = (after || {}) as Record<string, unknown>;
  const changed: string[] = [];
  const sameShape: string[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === 'children' && a[key] === b[key]) continue;
    if (a[key] === b[key]) continue;
    (key in a && key in b && same(a[key], b[key]) ? sameShape : changed).push(key);
  }
  const parts = [changed.length ? changed.slice(0, 5).join(', ') : ''];
  if (sameShape.length) parts.push(`same: ${sameShape.slice(0, 5).join(', ')}`);
  return { text: `props: ${parts.filter(Boolean).join(' | ') || '(new object)'}` };
}

/** Why a rendered fiber rendered, compared with its snapshot from the previous commit it was seen in. */
export function reasonsOf(prev: Snapshot, f: Fiber, describe: Describer): Reason[] {
  if (prev.props !== f.memoizedProps) return [propsReason(prev.props, f.memoizedProps)];
  const out: Reason[] = [];
  if (hasHooks(f)) {
    let a = prev.state as Hook | null;
    let b = f.memoizedState as Hook | null;
    let before: Hook | null = null;
    for (let i = 0; a && b && i < 1000; i++) {
      if (b.queue && a.memoizedState !== b.memoizedState) {
        const mark = same(a.memoizedState, b.memoizedState) ? ' SAME-CONTENT' : '';
        if (b.queue.getSnapshot) {
          // use-sync-external-store/with-selector (zustand v4, react-redux) keeps [getSnapshot, getServerSnapshot, selector, isEqual]
          // in the deps of the useMemo right before the store hook.
          const deps = Array.isArray(before?.memoizedState) ? (before!.memoizedState as unknown[])[1] : null;
          const selector = Array.isArray(deps) && typeof deps[2] === 'function' ? describe.selector(deps[2] as Function) : '';
          const store = Array.isArray(deps) && typeof deps[0] === 'function' ? describe.store(deps[0] as Function) : null;
          out.push({ text: `external store #${i}${mark}${store ? ` [${store}]` : ''} ${selector}`.trim(), hook: i });
        } else if (b.queue.lastRenderedReducer) {
          out.push({ text: `state #${i}${mark}`, hook: i });
        }
      }
      before = b;
      a = a.next;
      b = b.next;
    }
  } else if (f.tag === Tag.ClassComponent && prev.state !== f.memoizedState) {
    out.push({ text: `class state${same(prev.state, f.memoizedState) ? ' SAME-CONTENT' : ''}` });
  }
  const current = f.dependencies?.firstContext ?? null;
  if (current && prev.ctx !== current) {
    const old = new Map<unknown, unknown>();
    for (let d = prev.ctx; d; d = d.next) old.set(d.context, d.memoizedValue);
    for (let d: ContextDependency | null = current; d; d = d.next) {
      if (!old.has(d.context) || old.get(d.context) === d.memoizedValue) continue;
      const mark = same(old.get(d.context), d.memoizedValue) ? ' SAME-CONTENT' : '';
      out.push({ text: `context ${d.context.displayName || '(unnamed)'}${mark}` });
    }
  }
  return out.length ? out : [{ text: 'unknown' }];
}

/**
 * Why a component rendered together with its parent: which props really changed, which are new references with the
 * same content (inline objects and callbacks), or none at all — then `memo` would have skipped the render.
 */
export function parentReason(prev: Snapshot, f: Fiber, describe: Describer): Reason[] {
  if (prev.props === f.memoizedProps) return reasonsOf(prev, f, describe);
  const a = (prev.props || {}) as Record<string, unknown>;
  const b = (f.memoizedProps || {}) as Record<string, unknown>;
  const changed: string[] = [];
  const sameShape: string[] = [];
  let children = false;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[key] === b[key]) continue;
    // Element trees are too costly to compare deeply on every render: children count by reference.
    if (key === 'children') children = true;
    else (key in a && key in b && sameCheap(a[key], b[key]) ? sameShape : changed).push(key);
  }
  if (!changed.length && !sameShape.length) return [{ text: children ? 'parent: children' : 'parent: props equal' }];
  const parts = [changed.length ? changed.slice(0, 5).join(', ') : '', sameShape.length ? `same: ${sameShape.slice(0, 5).join(', ')}` : ''];
  return [{ text: `parent: props ${parts.filter(Boolean).join(' | ')}${children ? ' +children' : ''}` }];
}

/** `_debugHookTypes` lists every hook call, `useContext` and `useDebugValue` included; the hook list skips those two. */
export function hookTypeAt(f: Fiber, index: number): string | undefined {
  const types = f._debugHookTypes;
  if (!types) return undefined;
  let n = -1;
  for (const type of types) {
    if (type === 'useContext' || type === 'useDebugValue') continue;
    if (++n === index) return type;
  }
  return undefined;
}

const GENERIC_NAMES = new Set(['', 'anonymous', 'selector', 'select', 'fn', 'memoized', 'memoizedFn']);

/** Without a plugin label: a meaningful function name, else the source text — inline `(s) => selectX(s, id)` reads best. */
export function fallbackSelectorLabel(fn: Function): string {
  const name = fn.name.replace(/^bound /, '');
  if (!GENERIC_NAMES.has(name)) return name;
  return String(fn).replace(/\s+/g, ' ').slice(0, 100);
}
