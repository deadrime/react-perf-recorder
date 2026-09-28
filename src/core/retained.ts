import type { RetainedComponent, RetainedStats } from '../shared/schema';
import { generatedSourceOf, isComposite, isHost, isLibraryFiber, nameOf, sourceOf, Tag, type Fiber, type Hook } from './fiber';

/** ChildDeletion, the same bit in React 18 and 19. */
const CHILD_DELETION = 16;
const MAX_TRACKED = 5000;
const MAX_COMPONENTS = 20;

interface Tracked {
  key: string;
  /** What only the component's own closures reach once React detached it: its setters' queues, its refs, its instance. */
  refs: Array<WeakRef<object>>;
  /** A fiber tracked for want of those: its parent keeps it in `deletions` for two commits, which is not a leak. */
  parent?: WeakRef<Fiber>;
}

const isObject = (v: unknown): v is object => (typeof v === 'object' && v !== null) || typeof v === 'function';

/**
 * Not the fiber: the parent's `deletions` and its alternate's hold it after the unmount. A setter is bound to its queue,
 * a closure keeps the ref it reads, a memoized callback is what gets passed to addEventListener.
 */
function probesOf(f: Fiber): object[] {
  if (f.tag === Tag.ClassComponent) return isObject(f.stateNode) ? [f.stateNode] : [];
  const out: object[] = [];
  for (let hook = f.memoizedState as Hook | null; isObject(hook) && 'next' in hook && out.length < 10; hook = hook.next) {
    const state = hook.memoizedState as unknown;
    if (isObject(hook.queue)) out.push(hook.queue);
    else if (isObject(state) && !Array.isArray(state) && Object.keys(state).length === 1 && 'current' in state) out.push(state);
    else if (Array.isArray(state) && state.length === 2 && typeof state[0] === 'function') out.push(state[0]);
  }
  return out;
}

type Kind = Omit<RetainedComponent, 'retained'>;

const flagsOf = (f: Fiber) => (f.flags ?? 0) | (f.subtreeFlags ?? 0);

/**
 * Components unmounted while recording, held by weak references: after a garbage collection, one still in memory is
 * held by something outside React — a listener, a timer or a store that kept a setter of it.
 */
export class RetainWatcher {
  private readonly seen = new WeakSet<Fiber>();
  private readonly tracked: Tracked[] = [];
  private readonly kinds = new Map<string, Kind>();
  private readonly nodes: Array<{ ref: WeakRef<Element>; count: number }> = [];
  private unmounted = 0;

  /** `forget`: the recorder's snapshot of a deleted fiber holds its hooks, and the parent's `deletions` holds the fiber. */
  constructor(private readonly projectRoot = '', private readonly forget: (f: Fiber) => void = () => {}) {}

  /** Called with the root's fiber on every commit, before React detaches what it deleted. */
  commit(root: Fiber) {
    if (typeof WeakRef === 'undefined') return;
    const stack = [root];
    while (stack.length) {
      const f = stack.pop()!;
      if (f.deletions?.length) for (const d of f.deletions) this.deleted(d, f);
      for (let c = f.child; c; c = c.sibling) if (flagsOf(c) & CHILD_DELETION) stack.push(c);
    }
  }

  private deleted(top: Fiber, parent: Fiber) {
    // A subtree React bailed out of keeps last commit's flags: the same deletion again.
    if (this.seen.has(top)) return;
    this.seen.add(top);
    const stack: Array<[Fiber, boolean]> = [[top, false]];
    while (stack.length) {
      const [f, underHost] = stack.pop()!;
      this.forget(f);
      let below = underHost;
      if (isHost(f)) {
        if (!underHost && f.stateNode instanceof Element && this.nodes.length < MAX_TRACKED) {
          this.nodes.push({ ref: new WeakRef(f.stateNode), count: f.stateNode.getElementsByTagName('*').length + 1 });
        }
        below = true;
      } else if (f.tag === Tag.HostPortal) below = false;
      else if (isComposite(f)) this.component(f, f === top ? parent : null);
      if (f !== top && f.sibling) stack.push([f.sibling, underHost]);
      if (f.child) stack.push([f.child, below]);
    }
  }

  private component(f: Fiber, parent: Fiber | null) {
    const name = nameOf(f);
    if (!name) return;
    this.unmounted++;
    const site = sourceOf(f, this.projectRoot);
    const generated = generatedSourceOf(f);
    // By the built position where there is one: the shown site gains its line once the dev server maps it.
    const key = `${name}\u0000${generated ? `${generated.url}:${generated.line}:${generated.column}` : site}`;
    const kind = this.kinds.get(key);
    if (kind) {
      kind.unmounted++;
      if (site) kind.site = site;
    } else {
      this.kinds.set(key, {
        name,
        ...(site ? { site } : {}),
        ...(generated ? { generated } : {}),
        ...(isLibraryFiber(f) ? { library: true as const } : {}),
        unmounted: 1,
      });
    }
    if (this.tracked.length >= MAX_TRACKED) return;
    const probes = probesOf(f);
    // Without hooks or an instance nothing of it outlives the fiber but the fiber, the pair of it.
    if (probes.length) this.tracked.push({ key, refs: probes.map((p) => new WeakRef(p)) });
    else
      this.tracked.push({
        key,
        refs: [new WeakRef(f), ...(f.alternate ? [new WeakRef(f.alternate)] : [])],
        ...(parent ? { parent: new WeakRef(parent) } : {}),
      });
  }

  /** `collected`: a garbage collection ran just before; without one, only what was unmounted is told. */
  stop(collected: boolean): RetainedStats | null {
    // Plain elements removed with no component among them still count as removed DOM.
    if (!this.unmounted && !this.nodes.length) return null;
    const retained = new Map<string, number>();
    let total = 0;
    if (collected)
      for (const t of this.tracked) {
        const alive = t.refs.map((r) => r.deref()).filter((o): o is object => Boolean(o));
        if (!alive.length) continue;
        const parent = t.parent?.deref();
        if (parent && [parent, parent.alternate].some((p) => p?.deletions?.some((d) => alive.includes(d)))) continue;
        retained.set(t.key, (retained.get(t.key) ?? 0) + 1);
        total++;
      }
    const components = [...this.kinds]
      .map(([key, kind]) => ({ ...kind, ...(collected ? { retained: retained.get(key) ?? 0 } : {}) }))
      .sort((a, b) => (b.retained ?? 0) - (a.retained ?? 0) || b.unmounted - a.unmounted)
      .slice(0, MAX_COMPONENTS);
    let roots = 0;
    let nodes = 0;
    if (collected)
      for (const n of this.nodes) {
        const el = n.ref.deref();
        if (el && !el.isConnected) {
          roots++;
          nodes += n.count;
        }
      }
    return {
      collected,
      unmounted: this.unmounted,
      ...(collected ? { retained: total, detached: { roots, nodes } } : {}),
      components,
    };
  }
}
