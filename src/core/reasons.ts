import { sameContent } from '../shared/same-content';
import type { ReasonKind } from '../shared/schema';
import { hasHooks, Tag, type ContextDependency, type Fiber, type Hook } from './fiber';
import { hookCells } from './react-compat';

export interface Snapshot {
  props: unknown;
  state: unknown;
  /** Head of the context dependency list: React builds a new list on every render, the old one stays intact. */
  ctx: ContextDependency | null;
}

/**
 * Why a component rendered, in fields. The sentence a person reads is built from these by `reasonText`, so nothing
 * downstream — the panel, the MCP server, an agent — has to parse it back.
 */
export interface Reason {
  kind: ReasonKind;
  /** Index `#N` in the hook list, for external store and state reasons; absent for a class. */
  hook?: number;
  store?: string;
  selector?: string;
  /** The context object itself, to name the hooks that read it; the recording keeps its name. */
  contextObject?: object;
  context?: string;
  /** Props that changed, and props that are a new reference with the same content. */
  changed?: string[];
  sameRef?: string[];
  children?: true;
  /** Every prop was equal: `memo` would have skipped this render. */
  equal?: true;
  sameContent?: true;
}

const MAX_PROPS = 10;

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
  return (
    Boolean(prev) && (prev!.props !== f.memoizedProps || prev!.state !== f.memoizedState || prev!.ctx !== (f.dependencies?.firstContext ?? null))
  );
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
  return {
    kind: 'props',
    ...(changed.length ? { changed: changed.slice(0, MAX_PROPS) } : {}),
    ...(sameShape.length ? { sameRef: sameShape.slice(0, MAX_PROPS) } : {}),
  };
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
        const mark = same(a.memoizedState, b.memoizedState) ? ({ sameContent: true } as const) : null;
        if (b.queue.getSnapshot) {
          // use-sync-external-store/with-selector (zustand v4, react-redux) keeps [getSnapshot, getServerSnapshot, selector, isEqual]
          // in the deps of the useMemo right before the store hook.
          const deps = Array.isArray(before?.memoizedState) ? (before!.memoizedState as unknown[])[1] : null;
          const selector = Array.isArray(deps) && typeof deps[2] === 'function' ? describe.selector(deps[2] as Function) : '';
          const store = Array.isArray(deps) && typeof deps[0] === 'function' ? describe.store(deps[0] as Function) : null;
          out.push({ kind: 'store', hook: i, ...(store ? { store } : {}), ...(selector ? { selector } : {}), ...mark });
        } else if (b.queue.lastRenderedReducer) {
          out.push({ kind: 'state', hook: i, ...mark });
        }
      }
      before = b;
      a = a.next;
      b = b.next;
    }
  } else if (f.tag === Tag.ClassComponent && prev.state !== f.memoizedState) {
    out.push({ kind: 'state', ...(same(prev.state, f.memoizedState) ? { sameContent: true } : {}) });
  }
  const current = f.dependencies?.firstContext ?? null;
  if (current && prev.ctx !== current) {
    const old = new Map<unknown, unknown>();
    for (let d = prev.ctx; d; d = d.next) old.set(d.context, d.memoizedValue);
    for (let d: ContextDependency | null = current; d; d = d.next) {
      if (!old.has(d.context) || old.get(d.context) === d.memoizedValue) continue;
      out.push({
        kind: 'context',
        context: d.context.displayName || '(unnamed)',
        contextObject: d.context,
        ...(same(old.get(d.context), d.memoizedValue) ? { sameContent: true } : {}),
      });
    }
  }
  // The function ran (new hook list) yet no state, store value, prop or context differs: React rendered it for an
  // update that set a value it already had, then bailed out.
  if (!out.length && hasHooks(f) && prev.state !== f.memoizedState) return [{ kind: 'bailout' }];
  return out.length ? out : [{ kind: 'unknown' }];
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
  if (!changed.length && !sameShape.length) return [{ kind: 'parent', ...(children ? { children: true } : { equal: true }) }];
  return [
    {
      kind: 'parent',
      ...(changed.length ? { changed: changed.slice(0, MAX_PROPS) } : {}),
      ...(sameShape.length ? { sameRef: sameShape.slice(0, MAX_PROPS) } : {}),
      ...(children ? { children: true } : {}),
    },
  ];
}

/**
 * `_debugHookTypes` lists the hook calls a component made, the ones that take no cell of the hook list included,
 * and some take more than one cell — `useSyncExternalStore` takes the store and its effect, `useActionState` three.
 * So the cells are counted off as the list is read, and the hook holding cell `index` is the answer.
 */
export function hookTypeAt(f: Fiber, index: number): string | undefined {
  const types = f._debugHookTypes;
  if (!types) return undefined;
  let cell = 0;
  for (const type of types) {
    const cells = hookCells(type);
    if (!cells) continue;
    if (index < cell + cells) return type;
    cell += cells;
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
