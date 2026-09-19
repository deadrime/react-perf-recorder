import { fiberFromNode, type Fiber } from './fiber';

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
    this.observer.observe(target, { subtree: true, characterData: true, attributes: true, childList: true });
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

  private consume(records: MutationRecord[], touched: Set<Fiber> | null) {
    for (const m of records) {
      if (touched) {
        for (let f = fiberFromNode(m.target); f && !touched.has(f); f = f.return) {
          touched.add(f);
          if (f.alternate) touched.add(f.alternate);
        }
      }
      if (!this.inScope(m.target)) continue;
      if (m.type === 'characterData') this.counts.text++;
      else if (m.type === 'attributes') this.counts.attr++;
      else this.counts.child++;
    }
  }
}
