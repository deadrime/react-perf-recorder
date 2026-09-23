import { fiberFromNode, isHost, Tag, type Fiber } from './fiber';

/** Whether a component changed something on the screen: the set holds one half of each fiber pair. */
export const touchedHas = (touched: Set<Fiber>, f: Fiber) => touched.has(f) || (f.alternate !== null && touched.has(f.alternate));

export interface DomCounts {
  text: number;
  attr: number;
  child: number;
}

/**
 * One MutationObserver on body. In a commit, `takeForCommit()` drains the mutations of its mutation phase and marks
 * every fiber above a changed node: a rendered component outside that set changed nothing in the DOM. Mutations
 * between commits (layout effects, imperative updates) reach the async callback and are only counted.
 */
export class DomWatcher {
  readonly counts: DomCounts = { text: 0, attr: 0, child: 0 };
  private observer: MutationObserver | null = null;
  private scopeHosts: Element[] | null = null;

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

  takeForCommit(): Set<Fiber> {
    const touched = new Set<Fiber>();
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
   * Whether the writes to a node left it different from how the batch found it: the oldest value they overwrote
   * against the one it holds now. React 19 blanks a form field's `name` and writes it straight back on every render
   * of it, two writes that end where they started, and a component whose render only did that changed nothing.
   */
  private changedSomething(m: MutationRecord, before: Map<Node, Map<string, string | null>>): boolean {
    if (m.type === 'childList') return true;
    const oldest = before.get(m.target)?.get(this.recordKey(m));
    return (oldest === undefined ? m.oldValue : oldest) !== this.valueNow(m);
  }

  /**
   * Every component above a node changed something on the screen. One half of each pair is enough, since readers
   * look at both; host fibers are skipped, as nobody asks about them — they are most of the walk.
   */
  private mark(node: Node, touched: Set<Fiber>) {
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
    for (const m of records) {
      if (!this.changedSomething(m, before)) continue;
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
