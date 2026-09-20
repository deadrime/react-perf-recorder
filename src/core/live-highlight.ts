import { hookCommits, hookOwner, type CommitHook, type CommitInfo } from './commit-hook';
import { DomWatcher } from './dom';
import { findRoots, hostRootOf, isComposite, isHost, nameOf, Tag, type Fiber, type FiberRoot } from './fiber';
import type { HighlightSink } from './recorder';
import { ScopeTracker, type ScopeHandle } from './scope';

const PERFORMED_WORK = 1;

/** React sets PerformedWork on a fiber whose component ran in this render; bailouts start from a cleared flag. */
const ranNow = (f: Fiber) => f.alternate !== null && isComposite(f) && (f.flags & PERFORMED_WORK) !== 0;

/**
 * Outlines renders while nothing is being recorded: no snapshots, reasons or aggregates, only the PerformedWork
 * flag and a subtree walk that skips untouched children. A recording takes the commit hook over; the engine
 * restarts this after it.
 */
export class LiveHighlight {
  private hook: CommitHook | null = null;
  private readonly dom = new DomWatcher();
  private readonly scope: ScopeTracker | null;

  constructor(private readonly sink: HighlightSink, scope: ScopeHandle | null) {
    this.scope = scope ? new ScopeTracker(scope) : null;
  }

  /** False when there is no React root or another script holds its commit hook. */
  start(): boolean {
    const roots = this.scope ? [hostRootOf(this.scope.target)].filter((r): r is FiberRoot => Boolean(r)) : findRoots();
    if (!roots.length || roots.some((root) => hookOwner(root))) return false;
    this.dom.start();
    this.hook = hookCommits(roots, 'live-highlight', (info) => this.onCommit(info));
    return true;
  }

  stop() {
    this.hook?.stop();
    this.hook = null;
    this.dom.stop();
  }

  private onCommit({ fiber }: CommitInfo) {
    const touched = this.dom.takeForCommit();
    let start = fiber;
    if (this.scope) {
      const res = this.scope.resolve(fiber, (f) => ({ rendered: ranNow(f) }), 0);
      if (res.status !== 'found') return;
      start = res.fibers[res.fibers.length - 1];
    }
    const pairs: Array<[Element, string, Fiber]> = [];
    const withoutDom = new Set<Fiber>();
    const stack: Array<[Fiber, [string, Fiber] | null]> = [[start, null]];
    while (stack.length) {
      const [f, pending] = stack.pop()!;
      let next = pending;
      if (!pending && ranNow(f)) {
        next = [nameOf(f) ?? 'Anonymous', f];
        if (!touched.has(f)) withoutDom.add(f);
      }
      if (next && (isHost(f) || f.tag === Tag.HostText)) {
        const el = isHost(f) ? (f.stateNode as Element) : (f.stateNode as Text).parentElement;
        if (el) pairs.push([el, next[0], next[1]]);
        next = null;
      }
      if (f !== start && f.sibling) stack.push([f.sibling, pending]);
      if (f.child && !(f.alternate && f.child === f.alternate.child)) stack.push([f.child, next]);
    }
    if (pairs.length) this.sink.flash(pairs, withoutDom);
  }
}
