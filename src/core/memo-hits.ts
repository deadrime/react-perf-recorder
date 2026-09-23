import type { HookInfo, MemoHookStat } from '../shared/schema';
import { Tag, type Fiber, type Hook } from './fiber';
import { hookCells } from './react-compat';
import { sameCheap } from './reasons';

type Kind = 'useMemo' | 'useCallback';

interface MemoAgg {
  kind: Kind;
  renders: number;
  recomputed: number;
  noDeps: boolean;
  deps: Map<number, { changed: number; sameContent: number }>;
}

interface ComponentMemos {
  source: string;
  hooks: Map<number, MemoAgg>;
  latest: WeakRef<Fiber> | null;
}

/** Only these keep hooks in `memoizedState`; a class keeps its state object there. */
const HOOK_TAGS = new Set<number>([Tag.FunctionComponent, Tag.ForwardRef, Tag.SimpleMemoComponent]);
const MAX_LISTED = 30;
const MAX_INSPECTED = 15;

/** The cells of a component type's memo hooks, from the hook types React lists in dev; kept per type. */
const cellsByType = new WeakMap<object, Array<[number, Kind]> | null>();

function memoCells(f: Fiber): Array<[number, Kind]> | null {
  const type = f.type as object | null;
  if (!type || (typeof type !== 'function' && typeof type !== 'object')) return null;
  const known = cellsByType.get(type);
  if (known !== undefined) return known;
  const types = f._debugHookTypes;
  if (!types) return null;
  const cells: Array<[number, Kind]> = [];
  let cell = 0;
  for (const t of types) {
    const n = hookCells(t);
    if (!n) continue;
    if (t === 'useMemo' || t === 'useCallback') cells.push([cell, t]);
    cell += n;
  }
  const result = cells.length ? cells : null;
  cellsByType.set(type, result);
  return result;
}

/**
 * Whether each useMemo and useCallback kept its value through a render: React keeps the `[value, deps]` array when
 * the deps are equal and makes a new one when they are not, so the array's identity is the answer.
 */
export class MemoHits {
  private readonly components = new Map<string, ComponentMemos>();

  constructor(private readonly sourceOf: (f: Fiber) => string) {}

  track(name: string, f: Fiber, previousHooks: unknown) {
    if (!HOOK_TAGS.has(f.tag)) return;
    const cells = memoCells(f);
    if (!cells) return;
    let entry = this.components.get(name);
    if (!entry) this.components.set(name, (entry = { source: this.sourceOf(f), hooks: new Map(), latest: null }));
    let before = previousHooks as Hook | null;
    let after = f.memoizedState as Hook | null;
    let at = 0;
    let missed = false;
    for (const [cell, kind] of cells) {
      for (; at < cell && before && after; at++) {
        before = before.next;
        after = after.next;
      }
      if (!before || !after) break;
      const old = before.memoizedState;
      const now = after.memoizedState;
      if (!Array.isArray(old) || !Array.isArray(now)) continue;
      let hook = entry.hooks.get(cell);
      if (!hook) entry.hooks.set(cell, (hook = { kind, renders: 0, recomputed: 0, noDeps: false, deps: new Map() }));
      hook.renders++;
      if (old === now) continue;
      hook.recomputed++;
      missed = true;
      const oldDeps = old[1] as unknown[] | null;
      const newDeps = now[1] as unknown[] | null;
      if (!oldDeps || !newDeps) {
        hook.noDeps = true;
        continue;
      }
      for (let i = 0; i < Math.max(oldDeps.length, newDeps.length); i++) {
        if (Object.is(oldDeps[i], newDeps[i])) continue;
        let dep = hook.deps.get(i);
        if (!dep) hook.deps.set(i, (dep = { changed: 0, sameContent: 0 }));
        dep.changed++;
        if (sameCheap(oldDeps[i], newDeps[i])) dep.sameContent++;
      }
    }
    if (missed) entry.latest = new WeakRef(f);
  }

  /** The hooks that recomputed on half their renders or more, worst first; the worst are named by `inspect`. */
  result(inspect: (fiber: Fiber) => Map<number, HookInfo> | null): MemoHookStat[] {
    const listed: Array<MemoHookStat & { fiber?: Fiber }> = [];
    for (const [component, entry] of this.components) {
      for (const [hook, agg] of entry.hooks) {
        if (agg.renders < 2 || agg.recomputed * 2 < agg.renders) continue;
        listed.push({
          component,
          ...(entry.source ? { source: entry.source } : {}),
          hook,
          kind: agg.kind,
          renders: agg.renders,
          recomputed: agg.recomputed,
          ...(agg.noDeps ? { noDeps: true as const } : {}),
          deps: [...agg.deps].map(([index, d]) => ({ index, ...d })).sort((a, b) => b.changed - a.changed),
          fiber: entry.latest?.deref(),
        });
      }
    }
    listed.sort((a, b) => b.recomputed - a.recomputed || b.renders - a.renders);
    const top = listed.slice(0, MAX_LISTED);
    const named = new Map<Fiber, Map<number, HookInfo> | null>();
    for (const stat of top) {
      const fiber = stat.fiber;
      delete stat.fiber;
      if (!fiber) continue;
      if (!named.has(fiber) && named.size < MAX_INSPECTED) named.set(fiber, inspect(fiber));
      const info = named.get(fiber)?.get(stat.hook);
      if (info) stat.info = info;
    }
    return top;
  }
}
