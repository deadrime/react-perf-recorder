import { nameOf, sourceOf, type Fiber } from './fiber';
import { isConsumerTag, isProviderTag } from './react-compat';

export interface ScopeHandle {
  kind: 'scope';
  /** Every fiber from the HostRoot down to the scope component; either object of an alternate pair. */
  chain: Fiber[];
  name: string;
  source: string;
}

export function scopeFromFiber(target: Fiber, projectRoot = ''): ScopeHandle {
  const chain: Fiber[] = [];
  for (let node: Fiber | null = target; node; node = node.return) chain.push(node);
  chain.reverse();
  return { kind: 'scope', chain, name: nameOf(target) ?? String(target.type ?? 'root'), source: sourceOf(target, projectRoot) };
}

/**
 * The component path of a scope, e.g. ['OrdersPanel', 'PositionTable'], found again after a reload. Unnamed
 * components are left out: `Anonymous` and `Memo` would match anything.
 */
export function scopeNames(scope: ScopeHandle, depth = 6): string[] {
  return (
    scope.chain
      // On React 19 a provider is the context object and has a name; in the path it would match nothing after a reload.
      .filter((f) => !isProviderTag(f.tag) && !isConsumerTag(f.tag))
      .map((f) => {
        const t = f.type;
        if (typeof t === 'function') return t.displayName || t.name;
        if (t && typeof t === 'object') return t.displayName || t.render?.displayName || t.render?.name || t.type?.displayName || t.type?.name;
        return null;
      })
      .filter((n): n is string => Boolean(n))
      .slice(-depth)
  );
}

export interface ChainVisit {
  rendered: boolean;
}

export type ScopeResolution =
  | { status: 'untouched' }
  | { status: 'lost' }
  | { status: 'found'; fibers: Fiber[]; rendered: boolean[]; remounted: boolean };

const sameKind = (a: Fiber, b: Fiber) =>
  a.key === b.key && a.index === b.index && (a.elementType === b.elementType || (nameOf(a) ?? a.type) === (nameOf(b) ?? b.type));

/**
 * Follows the scope component across commits. Fibers come in pairs (current and alternate) that React reuses forever,
 * so each level is found by identity; after a remount the new fibers are matched by type, key and position.
 */
export class ScopeTracker {
  state: 'attached' | 'lost' = 'attached';
  remounts = 0;
  lostAtMs: number[] = [];
  readonly name: string;
  readonly source: string;
  private anchors: Fiber[];

  constructor(handle: ScopeHandle) {
    this.anchors = handle.chain.slice();
    this.name = handle.name;
    this.source = handle.source;
  }

  get target(): Fiber {
    return this.anchors[this.anchors.length - 1];
  }

  /** Names of the composite ancestors above the scope, nearest last. */
  ancestorNames(): string[] {
    return this.anchors
      .slice(0, -1)
      .map((f) => nameOf(f))
      .filter((n): n is string => Boolean(n));
  }

  /** Walks the chain in a committed tree; `visit` snapshots each chain fiber and reports whether it rendered. */
  resolve(committedRoot: Fiber, visit: (f: Fiber) => ChainVisit, atMs: number): ScopeResolution {
    const first = this.anchors[0];
    if (committedRoot !== first && committedRoot.alternate !== first) return { status: 'untouched' };
    const fibers: Fiber[] = [];
    const rendered: boolean[] = [];
    let structural = false;
    let node = committedRoot;
    for (let i = 0; i < this.anchors.length; i++) {
      if (i > 0) {
        const parent = fibers[i - 1];
        // The parent kept its child list: nothing below it was rendered in this commit.
        if (!structural && this.state === 'attached' && parent.alternate && parent.child === parent.alternate.child) return { status: 'untouched' };
        const anchor = this.anchors[i];
        let found: Fiber | null = null;
        if (!structural) for (let c = parent.child; c && !found; c = c.sibling) if (c === anchor || c.alternate === anchor) found = c;
        if (!found) {
          for (let c = parent.child; c && !found; c = c.sibling) if (sameKind(c, anchor)) found = c;
          if (found) structural = true;
        }
        if (!found) return this.markLost(atMs);
        node = found;
      }
      fibers.push(node);
      rendered.push(visit(node).rendered);
    }
    this.anchors = fibers;
    const remounted = structural || this.state === 'lost';
    if (remounted) this.remounts++;
    this.state = 'attached';
    return { status: 'found', fibers, rendered, remounted };
  }

  private markLost(atMs: number): ScopeResolution {
    if (this.state === 'attached') this.lostAtMs.push(Math.round(atMs));
    this.state = 'lost';
    return { status: 'lost' };
  }
}
