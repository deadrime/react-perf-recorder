import { fiberFromNode, isComposite, isHost, Tag, type Fiber } from './fiber';

/** Whether a component changed something on the screen: the set holds one half of each fiber pair. */
export const touchedHas = (touched: Set<Fiber>, f: Fiber) => touched.has(f) || (f.alternate !== null && touched.has(f.alternate));

/**
 * The component whose render made a node's element — its owner in a development build, whatever wraps the element
 * where it is mounted (a provider, a Card) — else the nearest component above it. A text node goes by its element.
 */
export function ownerOf(node: Node): Fiber | null {
  let f = fiberFromNode(node);
  while (f && f.tag === Tag.HostText) f = f.return;
  // React 19 can put a server component's info here instead of a fiber.
  const owner = f && isHost(f) ? f._debugOwner : null;
  if (owner && typeof owner.tag === 'number') return owner;
  for (; f; f = f.return) if (isComposite(f)) return f;
  return null;
}

const isElement = (v: unknown) => typeof v === 'object' && v !== null && '$$typeof' in v;

/**
 * Whether a component that rendered got a new value in its props: a function, `children` or an element made anew
 * each render is not one. Its two halves hold the props before and after.
 */
function gotNewValue(f: Fiber): boolean {
  const next = f.memoizedProps as Record<string, unknown> | null;
  const prev = f.alternate?.memoizedProps as Record<string, unknown> | null | undefined;
  if (!next || !prev || next === prev) return false;
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const [a, b] = [prev[key], next[key]];
    if (key === 'children' || Object.is(a, b) || typeof a === 'function' || typeof b === 'function') continue;
    if (!isElement(a) && !isElement(b)) return true;
  }
  return false;
}

/** The component that passed `f` its props, when they carried a new value: its render made the change too. */
function passerOf(f: Fiber): Fiber | null {
  const owner = f._debugOwner;
  return owner && typeof owner.tag === 'number' && gotNewValue(f) ? owner : null;
}

export interface DomCounts {
  text: number;
  attr: number;
  child: number;
}

/**
 * `takeForCommit()` marks every fiber above a node changed in this commit's mutation phase. Mutations between
 * commits (layout effects, imperative updates) are only counted.
 */
export class DomWatcher {
  readonly counts: DomCounts = { text: 0, attr: 0, child: 0 };
  private observer: MutationObserver | null = null;
  private scopeHosts: Element[] | null = null;
  /** Handed every batch as it is taken: `commit` when a commit took it, else it came between commits. */
  onRecords: ((records: MutationRecord[], commit: boolean) => void) | null = null;

  setScopeHosts(hosts: Element[] | null) {
    this.scopeHosts = hosts;
  }

  start(target: Node = document.body) {
    this.observer = new MutationObserver((records) => this.consume(records, null));
    // The old values are what tells a real change from a value written over itself, which React 19 does to the
    // attributes of form fields on every render of them.
    this.observer.observe(target, {
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeOldValue: true,
      childList: true,
    });
  }

  /**
   * The components whose own elements changed in the last `takeForCommit`, and the ones that passed them the new
   * value in props.
   */
  own = new Set<Fiber>();

  takeForCommit(): Set<Fiber> {
    const touched = new Set<Fiber>();
    this.own = new Set<Fiber>();
    if (this.observer) this.consume(this.observer.takeRecords(), touched);
    return touched;
  }

  stop() {
    if (this.observer) this.consume(this.observer.takeRecords(), null);
    this.observer?.disconnect();
    this.observer = null;
  }

  private inScope(node: Node) {
    const hosts = this.scopeHosts;
    if (!hosts) return true;
    for (const host of hosts) if (host.contains(node)) return true;
    return false;
  }

  private valueNow(m: MutationRecord): string | null {
    if (m.type !== 'attributes') return (m.target as CharacterData).data ?? null;
    const element = m.target as Element;
    return m.attributeName && typeof element.getAttribute === 'function' ? element.getAttribute(m.attributeName) : null;
  }

  private recordKey(m: MutationRecord): string {
    return m.type === 'attributes' ? `a:${m.attributeName}` : 't';
  }

  /**
   * Compares the oldest overwritten value with the current one: React 19 blanks a form field's `name` and writes
   * it straight back on every render, two writes that change nothing.
   */
  private changedSomething(m: MutationRecord, before: Map<Node, Map<string, string | null>>): boolean {
    if (m.type === 'childList') return true;
    const oldest = before.get(m.target)?.get(this.recordKey(m));
    return (oldest === undefined ? m.oldValue : oldest) !== this.valueNow(m);
  }

  /** One half of each fiber pair is enough, as readers check both; host fibers are skipped, nobody asks about them. */
  private mark(node: Node, touched: Set<Fiber>) {
    for (let owner = ownerOf(node); owner && !touchedHas(this.own, owner); owner = passerOf(owner)) this.own.add(owner);
    for (let f = fiberFromNode(node); f; f = f.return) {
      if (isHost(f) || f.tag === Tag.HostText) continue;
      if (touchedHas(touched, f)) return;
      touched.add(f);
    }
  }

  private consume(records: MutationRecord[], touched: Set<Fiber> | null) {
    // What each node held before this batch touched it: the old value of the first write to reach it.
    const before = new Map<Node, Map<string, string | null>>();
    for (const m of records) {
      if (m.type === 'childList') continue;
      let perNode = before.get(m.target);
      if (!perNode) before.set(m.target, (perNode = new Map()));
      const key = this.recordKey(m);
      if (!perNode.has(key)) perNode.set(key, m.oldValue);
    }
    const changed = records.filter((m) => this.changedSomething(m, before));
    // A write of the value already there moves nothing, and must not outrank the change that did.
    if (records.length) this.onRecords?.(changed, touched !== null);
    for (const m of changed) {
      if (touched) {
        this.mark(m.target, touched);
        if (m.type === 'childList') {
          // The node's parent belongs to whoever renders the element around it; the nodes added belong to the
          // component that added them. A removed node's fiber is already cut loose, so its sibling stands in.
          m.addedNodes.forEach((node) => this.mark(node, touched));
          if (m.removedNodes.length) {
            const sibling = m.previousSibling ?? m.nextSibling;
            if (sibling) this.mark(sibling, touched);
          }
        }
      }
      if (!this.inScope(m.target)) continue;
      if (m.type === 'characterData') this.counts.text++;
      else if (m.type === 'attributes') this.counts.attr++;
      else this.counts.child++;
    }
  }
}
