import type { LcpCandidate, LcpElement, LcpMount, LcpStats, ShiftNode } from '../shared/schema';
import { inOwn, nodeName, rect } from './shifts';

interface LcpEntry extends PerformanceEntry {
  renderTime: number;
  loadTime: number;
  size: number;
  element: Element | null;
  url: string;
}

/** When a batch of DOM changes came, and the commit that made it, once the recorder gave the commit its id. */
interface Batch {
  t: number;
  /** Set by the rAF of the frame that painted it; NaN while it waits for that frame. */
  frame: number;
  commit: boolean;
  id?: number | null;
  first?: boolean;
}

/** A node's last insertion, and its last source, style or text written: one does not overwrite the other. */
interface Marks {
  added?: Batch;
  content?: { batch: Batch; how: 'attribute' | 'text'; name?: string };
}

interface Stamp {
  batch: Batch;
  how: 'added' | 'attribute' | 'text';
  name?: string;
}

export interface LcpOptions {
  t0: number;
  projectRoot: string;
  wrapperPattern: RegExp;
  ownHost: Element | null;
  /** The recording began with the page load: an element on the page at the start came in the HTML. */
  fromLoad: boolean;
  onLcp(lcp: LcpStats): void;
}

/** Candidates kept before the final one: a page paints a few, a feed that keeps growing paints many. */
const MAX_CANDIDATES = 10;
// Attributes that change what an element paints: an image's source, a background in its style.
const CONTENT_ATTR = /^(src|srcset|poster|style|href|xlink:href)$/;
const FONT_URL = /\.(woff2?|ttf|otf|eot)([?#]|$)/i;
// Requests that never paint: a dev server's modules would crowd out the images.
const NOT_PAINTED = /^(script|fetch|xmlhttprequest|beacon)$/;
const MAX_RESOURCES = 2000;

export const lcpSupported = () =>
  typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('largest-contentful-paint');

const round = Math.round;

/** Same origin loses its origin, a data: URL its data: the rest is cut to something a line can hold. */
export function shortUrl(url: string): string {
  if (url.startsWith('data:')) {
    const cut = url.search(/[;,]/);
    return `${url.slice(0, cut > 0 ? cut : 20)},…`;
  }
  let out = url;
  try {
    const parsed = new URL(url, location.href);
    if (parsed.origin === location.origin) out = parsed.pathname + parsed.search;
  } catch {
    // Kept as the browser gave it.
  }
  return out.length > 120 ? `${out.slice(0, 117)}…` : out;
}

/** The largest contentful paint, its element's component, and what put that element on the page when. */
export class LcpWatcher {
  private candidates: Array<{ candidate: LcpCandidate; el: WeakRef<Element> | null; stats: LcpStats }> = [];
  private marks = new WeakMap<Node, Marks>();
  /** Noting changes pays only in a recording that began before React's first commit, and only until an input. */
  private stamping = false;
  /** Seen as they come: the page's own buffer stops at 250 entries, which a dev server's modules fill first. */
  private resources: PerformanceResourceTiming[] = [];
  private resourceObserver: PerformanceObserver | null = null;
  private open: Batch | null = null;
  private commits = 0;
  /** What the page held when a recording from the load started: the HTML, before React's first commit. */
  private initial: WeakSet<Element> | null = null;
  private pending: Batch[] = [];
  private inputAt: number | null = null;
  private observer: PerformanceObserver | null = null;
  private off: Array<() => void> = [];

  constructor(private options: LcpOptions) {}

  /** `fresh`: React has committed nothing yet, so what is on the page came in the HTML. */
  start(fresh: boolean) {
    this.stamping = this.options.fromLoad && fresh;
    if (this.stamping) this.initial = new WeakSet(document.body ? document.body.getElementsByTagName('*') : []);
    // The browser looks for no larger paint after a person's input: a scroll by script or a synthetic key stops nothing.
    const input = (e: Event) => {
      if (this.inputAt !== null || !e.isTrusted) return;
      this.inputAt = e.timeStamp;
      this.stamping = false;
      this.resourceObserver?.disconnect();
      this.resourceObserver = null;
      this.off.forEach((off) => off());
      this.off = [];
    };
    for (const type of ['pointerdown', 'keydown', 'wheel']) {
      window.addEventListener(type, input, true);
      this.off.push(() => window.removeEventListener(type, input, true));
    }
    try {
      this.resourceObserver = new PerformanceObserver((list) => {
        for (const r of list.getEntries() as PerformanceResourceTiming[])
          if (!NOT_PAINTED.test(r.initiatorType) && this.resources.length < MAX_RESOURCES) this.resources.push(r);
      });
      this.resourceObserver.observe({ type: 'resource', buffered: true });
    } catch {
      this.resourceObserver = null;
    }
    try {
      this.observer = new PerformanceObserver((list) => list.getEntries().forEach((entry) => this.onEntry(entry as LcpEntry)));
      // Buffered: a recording from the load starts after the first paint of the HTML.
      this.observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      this.observer = null;
    }
  }

  flush() {
    this.resourceObserver?.takeRecords().forEach((r) => this.resources.push(r as PerformanceResourceTiming));
    this.observer?.takeRecords().forEach((entry) => this.onEntry(entry as LcpEntry));
  }

  stop() {
    this.flush();
    this.observer?.disconnect();
    this.observer = null;
    this.resourceObserver?.disconnect();
    this.resourceObserver = null;
    this.stamping = false;
    this.off.forEach((off) => off());
    this.off = [];
    this.open = null;
    this.pending = [];
  }

  /** What the DOM watcher saw change: nodes put in, sources and styles written, text changed. */
  noteRecords(records: MutationRecord[], commit: boolean) {
    if (!this.stamping || !records.length) return;
    const batch: Batch = { t: performance.now(), frame: NaN, commit };
    this.pending.push(batch);
    if (this.pending.length === 1)
      requestAnimationFrame((ts) => {
        for (const b of this.pending) b.frame = ts;
        this.pending = [];
      });
    const marksOf = (node: Node) => {
      let marks = this.marks.get(node);
      if (!marks) this.marks.set(node, (marks = {}));
      return marks;
    };
    for (const m of records) {
      if (m.type === 'childList')
        m.addedNodes.forEach((node) => {
          marksOf(node).added = batch;
          // New text in an element is that element's content changing.
          if (node.nodeType === Node.TEXT_NODE) marksOf(m.target).content = { batch, how: 'text' };
        });
      else if (m.type === 'attributes') {
        if (m.attributeName && CONTENT_ATTR.test(m.attributeName)) marksOf(m.target).content = { batch, how: 'attribute', name: m.attributeName };
      } else if (m.target.parentNode) marksOf(m.target.parentNode).content = { batch, how: 'text' };
    }
    if (commit) this.open = batch;
  }

  /** The id the commit just noted got; null when it was not kept. */
  commitDone(id: number | null) {
    if (this.open) {
      this.open.id = id;
      // React's first only when the recording began before it.
      this.open.first = Boolean(this.initial) && this.commits === 0;
    }
    this.open = null;
    this.commits++;
  }

  /** Absent unless the recording began with the load or the largest paint changed during it. */
  result(): LcpStats | undefined {
    const last = this.candidates.at(-1);
    if (!last || !this.shown()) return undefined;
    // Painted from the server's HTML before React hydrated it: named now, when the element has its fiber.
    for (const c of this.candidates) {
      const el = c.el?.deref();
      if (el?.isConnected && !c.candidate.element.component) {
        const { kind, url, rect: box } = c.candidate.element;
        c.candidate.element = { ...this.named(el), kind, ...(url ? { url } : {}), ...(box ? { rect: box } : {}) };
      }
    }
    return this.statsOf();
  }

  private shown() {
    return this.options.fromLoad || this.candidates.some((c) => c.candidate.atMs >= 0);
  }

  /** The final candidate's stats with the ones before it. */
  private statsOf(): LcpStats {
    const final = this.candidates.at(-1)!;
    return {
      ...final.stats,
      ...final.candidate,
      candidates: this.candidates.slice(0, -1).map((c) => c.candidate),
      ...(this.inputAt !== null ? { inputAtMs: round(this.inputAt - this.options.t0) } : {}),
    };
  }

  private named(node: Node): ShiftNode {
    return nodeName(node, this.options.projectRoot, this.options.wrapperPattern);
  }

  private onEntry(entry: LcpEntry) {
    const el = entry.element;
    // The panel's own text is not the page's paint. The browser names no element in its shadow tree, so with the panel
    // on the page a paint of no element is taken for the panel's: a removed skeleton goes with it.
    if (el ? inOwn(this.options.ownHost, el) : this.options.ownHost?.isConnected) return;
    const nav = performance.getEntriesByType?.('navigation')[0] as (PerformanceNavigationTiming & { activationStart?: number }) | undefined;
    const since = (t: number) => round(Math.max(0, t - (nav?.activationStart ?? 0)));
    const kind: LcpElement['kind'] =
      el && /^(IMG|IMAGE)$/i.test(el.nodeName) ? 'image' : el?.nodeName === 'VIDEO' ? 'video' : entry.url ? 'background' : 'text';
    const element: LcpElement = {
      // The browser names no element in a shadow tree, the panel's included, nor one removed since.
      ...(el ? this.named(el) : { node: '(removed or in a shadow tree)' }),
      kind,
      ...(entry.url ? { url: shortUrl(entry.url) } : {}),
      ...(el?.isConnected ? { rect: rect(el.getBoundingClientRect()) } : {}),
    };
    const candidate: LcpCandidate = { ms: since(entry.startTime), atMs: round(entry.startTime - this.options.t0), size: entry.size, element };
    const stats = this.statsFor(entry, candidate, el, since, since(nav?.responseStart ?? 0));
    this.candidates.push({ candidate, el: el && typeof WeakRef === 'function' ? new WeakRef(el) : null, stats });
    // The first ones are kept: the skeleton or the text that was the largest before the content came.
    if (this.candidates.length > MAX_CANDIDATES + 1) this.candidates.splice(MAX_CANDIDATES, 1);
    if (this.shown()) this.options.onLcp(this.statsOf());
  }

  private statsFor(entry: LcpEntry, candidate: LcpCandidate, el: Element | null, since: (t: number) => number, ttfb: number): LcpStats {
    const resource = entry.url ? this.resourceOf(entry.url, entry.startTime) : null;
    // As web-vitals splits it: https://web.dev/articles/optimize-lcp
    const requestAt = resource ? Math.max(ttfb, since(resource.requestStart || resource.startTime)) : ttfb;
    const responseEnd = resource ? Math.max(requestAt, since(resource.responseEnd)) : requestAt;
    const paint = Math.max(responseEnd, candidate.ms);
    const mount = el ? this.mountOf(el, since) : undefined;
    const lazy = el?.getAttribute('loading') === 'lazy';
    const priority = el?.getAttribute('fetchpriority');
    const font = candidate.element.kind === 'text' ? this.fontBefore(mount && 'ms' in mount ? mount.ms : 0, candidate.ms, since) : null;
    return {
      ...candidate,
      phases: { ttfb, loadDelay: requestAt - ttfb, loadDuration: responseEnd - requestAt, renderDelay: paint - responseEnd },
      ...(mount ? { mount } : {}),
      ...(entry.url
        ? {
            image: {
              ...(lazy ? { lazy: true as const } : {}),
              ...(priority ? { fetchPriority: priority } : {}),
              ...(resource ? { initiator: resource.initiatorType, requestMs: requestAt, responseEndMs: responseEnd } : {}),
            },
          }
        : {}),
      ...(font ? { font } : {}),
      candidates: [],
    };
  }

  /** The latest change up the element's ancestors that put it in, or its own source, style or text written. */
  private mountOf(el: Element, since: (t: number) => number): LcpMount | undefined {
    let best: { stamp: Stamp; node: Node } | null = null;
    for (let n: Node | null = el; n; n = n.parentNode) {
      const marks = this.marks.get(n);
      if (!marks) continue;
      // An ancestor's style or text is not the element's content.
      const stamps: Stamp[] = [
        ...(marks.added ? [{ batch: marks.added, how: 'added' as const }] : []),
        ...(marks.content && n === el ? [marks.content] : []),
      ];
      for (const stamp of stamps) {
        // A change not painted yet is not this paint's; the paint's own time cannot tell, as after a long task it can
        // be earlier than the change it painted (by 100 ms).
        if (Number.isNaN(stamp.batch.frame)) continue;
        if (!best || stamp.batch.t > best.stamp.batch.t) best = { stamp, node: n };
      }
    }
    // Nothing seen put it in: in the HTML only if it was there at the start, else the recorder came after its commit.
    if (!best) return this.initial?.has(el) ? { before: true } : undefined;
    const { stamp, node } = best;
    const common = {
      atMs: round(stamp.batch.t - this.options.t0),
      ms: since(stamp.batch.t),
      change: stamp.how,
      ...(stamp.name ? { name: stamp.name } : {}),
      // The first commit puts in the whole app: the node it inserted says nothing.
      ...(node !== el && !stamp.batch.first ? { by: this.named(node) } : {}),
    };
    return stamp.batch.commit
      ? { commit: stamp.batch.id ?? null, ...(stamp.batch.first ? { first: true as const } : {}), ...common }
      : { dom: true, ...common };
  }

  /** Seen by the observer, and the page's buffer for a recording that did not see them come. */
  private allResources(): PerformanceResourceTiming[] {
    const buffered = (performance.getEntriesByType?.('resource') ?? []) as PerformanceResourceTiming[];
    return this.resources.length ? [...this.resources, ...buffered] : buffered;
  }

  private resourceOf(url: string, before: number): PerformanceResourceTiming | null {
    let found: PerformanceResourceTiming | null = null;
    for (const r of this.allResources()) if (r.name === url && r.startTime <= before && (!found || r.startTime > found.startTime)) found = r;
    return found;
  }

  /** A font that arrived between the text's mount and its paint: the text waited for it or was painted again with it. */
  private fontBefore(from: number, paint: number, since: (t: number) => number): { url: string; ms: number } | null {
    let found: { url: string; ms: number } | null = null;
    for (const res of this.allResources()) {
      if (!FONT_URL.test(res.name)) continue;
      const end = since(res.responseEnd);
      if (end >= from && end <= paint && (!found || end > found.ms)) found = { url: shortUrl(res.name), ms: end };
    }
    return found;
  }
}
