import type { LatencyEntry, LayoutShift, ShiftCause, ShiftCulprit, ShiftNode, ShiftRect, ShiftStats } from '../shared/schema';
import { clsOf } from '../shared/shifts';
import { ownerOf } from './dom';
import { fiberFromNode, generatedSourceOf, isLibraryFiber, isProvider, nameOf, sourceOf, wrapsProvider, type Fiber } from './fiber';

interface ShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
  sources?: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }>;
}

/** Something that changed on the page, kept for a moment in case the next frame shifts. */
interface Change {
  t: number;
  /** When the rendering update that painted it started (a rAF of ours); NaN until that frame comes. */
  frame: number;
  kind: 'commit' | 'dom' | 'load' | 'sheet' | 'font';
  records?: MutationRecord[];
  node?: Node;
  commit?: number | null;
}

type How = ShiftCulprit['change'];
type Where = ShiftCulprit['where'];

interface Candidate {
  change: Change;
  node: Node;
  how: How;
  name?: string;
  /** A removal at the end of `node`: it moves what follows the element, not what is in it. */
  atEnd?: boolean;
  /** What was removed, named while React may still know it; `node` only marks where it was. */
  removed?: Node;
}

export interface ShiftOptions {
  t0: number;
  projectRoot: string;
  wrapperPattern: RegExp;
  ownHost: Element | null;
  onShift(shift: LayoutShift): void;
}

const MAX_SHIFTS = 1000;
/** A change older than this has been painted long before any shift the observer can still report. */
const KEEP_MS = 2000;
// Attributes that change what an element looks like but never where anything is.
const NO_LAYOUT_ATTR =
  /^(value|name|id|title|tabindex|for|role|placeholder|autocomplete|checked|selected|href|target|rel|alt|aria-(?!expanded|hidden))/;
const LAYOUT_PROP =
  /^(height|width|min-|max-|top|left|right|bottom|inset|margin|padding|flex|grid|font-size|line-height|border(-\w+)?-width|gap|row-gap|column-gap|all$)/;

export const shiftsSupported = () =>
  typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('layout-shift');

const isSheet = (n: Node) =>
  n.nodeName === 'STYLE' ||
  (n.nodeName === 'LINK' && /stylesheet/i.test((n as Element).getAttribute('rel') ?? '')) ||
  n.parentNode?.nodeName === 'STYLE';
const isMedia = (n: Node) => /^(IMG|IFRAME|VIDEO|EMBED|OBJECT|IMAGE)$/i.test(n.nodeName);
/** An image with its size in its attributes takes its space before it loads. */
const sized = (el: Element) => el.hasAttribute('width') && el.hasAttribute('height');

const rect = (r: DOMRectReadOnly): ShiftRect => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
const elementOf = (node: Node): Element | null => (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);

/** `main > ul.list > li`: a tag with an id, a test id or a readable class; hashed names say nothing. */
export function nodePath(node: Node | null): string {
  const one = (e: Element) => {
    const tag = e.tagName.toLowerCase();
    const testId = e.getAttribute('data-testid');
    if (testId) return `${tag}[data-testid="${testId}"]`;
    if (e.id && /^[a-zA-Z][\w-]{0,30}$/.test(e.id)) return `${tag}#${e.id}`;
    const cls = [...e.classList].find((c) => /^[a-zA-Z][a-zA-Z-]{1,23}$/.test(c) && !/^(css|sc|jsx|emotion)-/.test(c));
    return cls ? `${tag}.${cls}` : tag;
  };
  const parts: string[] = [];
  for (let e = node && elementOf(node); e && parts.length < 3 && e !== document.body && e !== document.documentElement; e = e.parentElement)
    parts.unshift(one(e));
  return parts.join(' > ') || (node && elementOf(node)?.tagName.toLowerCase()) || '?';
}

/**
 * Where a change is from the element that moved: the element itself, an ancestor, before it in the document, inside
 * it; null when it cannot have moved it (after it, or a node no longer on the page).
 */
export function whereOf(c: Pick<Candidate, 'node' | 'how' | 'atEnd'>, moved: Node): Where | null {
  const { node, how } = c;
  if (!node.isConnected || !moved.isConnected) return null;
  if (c.atEnd) {
    if (node === moved || node.contains(moved)) return null;
    if (moved.contains(node)) return 'inside';
    return node.compareDocumentPosition(moved) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : null;
  }
  // A node removed right before the moved one leaves `node` pointing at what came after it.
  if (how === 'removed' && (node === moved || node.contains(moved))) return 'before';
  if (node === moved) return how === 'added' ? null : 'self';
  if (node.contains(moved)) return how === 'added' ? null : 'ancestor';
  if (moved.contains(node)) return 'inside';
  return node.compareDocumentPosition(moved) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : null;
}

const depthBelow = (a: Node, b: Node) => {
  // How deep the two share a parent: the deeper, the nearer the change is to what moved.
  const up = new Set<Node>();
  for (let n: Node | null = b; n; n = n.parentNode) up.add(n);
  let depth = 0;
  let common: Node | null = a;
  while (common && !up.has(common)) common = common.parentNode;
  for (let n = common; n; n = n.parentNode) depth++;
  return depth;
};

const RANK: Record<Where, number> = { self: 4, ancestor: 3, before: 2, inside: 1 };

/** The change nearest to the moved element: itself, then an ancestor, then the closest before it, then inside it. */
export function nearest<T extends Pick<Candidate, 'node' | 'how' | 'atEnd'>>(candidates: T[], moved: Node): { candidate: T; where: Where } | null {
  let best: { candidate: T; where: Where; depth: number } | null = null;
  for (const candidate of candidates) {
    const where = whereOf(candidate, moved);
    if (!where) continue;
    const depth = where === 'before' ? depthBelow(candidate.node, moved) : 0;
    if (
      !best ||
      RANK[where] > RANK[best.where] ||
      (where === best.where && where === 'before' && depth > best.depth) ||
      // Of two as near, the later in the document is the one right above the moved element.
      (where === best.where &&
        where === 'before' &&
        depth === best.depth &&
        best.candidate.node.compareDocumentPosition(candidate.node) & Node.DOCUMENT_POSITION_FOLLOWING)
    )
      best = { candidate, where, depth };
  }
  return best && { candidate: best.candidate, where: best.where };
}

/** The property an animation moves that takes space: `height`, `margin-top`; transform and opacity do not. */
function layoutPropertyOf(animation: Animation): string | null {
  const transition = (animation as Animation & { transitionProperty?: string }).transitionProperty;
  if (transition) return LAYOUT_PROP.test(transition) ? transition : null;
  const effect = animation.effect as KeyframeEffect | null;
  const frames = effect?.getKeyframes?.() ?? [];
  for (const frame of frames)
    for (const key of Object.keys(frame)) {
      if (key === 'offset' || key === 'easing' || key === 'composite' || key === 'computedOffset') continue;
      const property = key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
      if (LAYOUT_PROP.test(property)) return property;
    }
  return null;
}

/**
 * Layout shifts with what moved them. The browser names the elements that moved; what moved them is looked for among
 * what changed in the same frame: a React commit (with the component whose elements it changed), a style written from
 * script, a running animation, an image or stylesheet or font that arrived.
 */
export class ShiftWatcher {
  readonly list: LayoutShift[] = [];
  private truncated = false;
  private changes: Change[] = [];
  private pending: Change[] = [];
  private framePending = false;
  private openCommit: Change | null = null;
  private lastInput: number | null = null;
  private lastShiftAt = -Infinity;
  private observer: PerformanceObserver | null = null;
  private head: MutationObserver | null = null;
  private off: Array<() => void> = [];

  constructor(private options: ShiftOptions) {}

  start() {
    const listen = (target: EventTarget | undefined, type: string, fn: (e: Event) => void) => {
      if (!target) return;
      target.addEventListener(type, fn, true);
      this.off.push(() => target.removeEventListener(type, fn, true));
    };
    // The entry says an input came, not how long before; the browser counts pointerdown and keydown.
    const input = (e: Event) => {
      if (!this.isOwn(e.target as Node | null)) this.lastInput = e.timeStamp;
    };
    listen(window, 'pointerdown', input);
    listen(window, 'keydown', input);
    const loaded = (e: Event) => {
      const el = e.target as Element | null;
      if (!el || !el.tagName) return;
      if (el.tagName === 'LINK') {
        if (/stylesheet/i.test(el.getAttribute('rel') ?? '')) this.add({ t: performance.now(), frame: NaN, kind: 'sheet', node: el });
      } else if (isMedia(el) && !sized(el)) {
        this.add({ t: performance.now(), frame: NaN, kind: 'load', node: el });
      }
    };
    // Neither bubbles: caught on the way down.
    listen(document, 'load', loaded);
    listen(document, 'loadedmetadata', loaded);
    listen(document.fonts as unknown as EventTarget | undefined, 'loadingdone', () => this.add({ t: performance.now(), frame: NaN, kind: 'font' }));
    if (document.head) {
      // A new <title> or <meta> moves nothing; a stylesheet may move everything.
      this.head = new MutationObserver((records) => {
        const sheet = records.map((m) => [m.target, ...m.addedNodes].find(isSheet)).find(Boolean);
        if (sheet) this.add({ t: performance.now(), frame: NaN, kind: 'sheet', node: sheet });
      });
      this.head.observe(document.head, { childList: true, subtree: true, characterData: true });
    }
    try {
      this.observer = new PerformanceObserver((list) => list.getEntries().forEach((entry) => this.onEntry(entry as ShiftEntry)));
      this.observer.observe({ type: 'layout-shift', buffered: false });
    } catch {
      this.observer = null;
    }
  }

  stop() {
    this.observer?.takeRecords().forEach((entry) => this.onEntry(entry as ShiftEntry));
    this.observer?.disconnect();
    this.observer = null;
    this.head?.disconnect();
    this.head = null;
    this.off.forEach((off) => off());
    this.off = [];
    this.changes = [];
    this.pending = [];
  }

  /** What the DOM watcher saw change: in a commit, or between commits. */
  noteRecords(records: MutationRecord[], commit: boolean) {
    if (!records.length) return;
    const change: Change = { t: performance.now(), frame: NaN, kind: commit ? 'commit' : 'dom', records };
    if (commit) this.openCommit = change;
    this.add(change);
  }

  /** The id the commit just noted got; null when it rendered nothing in the area and was not kept. */
  commitDone(id: number | null) {
    if (this.openCommit) this.openCommit.commit = id;
    this.openCommit = null;
  }

  result(latency: LatencyEntry[]): ShiftStats {
    for (const shift of this.list) {
      let follows: LatencyEntry | undefined;
      for (const entry of latency)
        if (entry.atMs <= shift.atMs && shift.atMs - entry.atMs <= 5000 && (!follows || entry.atMs > follows.atMs)) follows = entry;
      if (follows) shift.interactionId = follows.interactionId;
    }
    return { list: this.list, ...(this.truncated ? { truncated: true as const } : {}), cls: clsOf(this.list) };
  }

  private add(change: Change) {
    const { changes } = this;
    let stale = 0;
    while (stale < changes.length && changes[stale].t < change.t - KEEP_MS) stale++;
    if (stale) changes.splice(0, stale);
    changes.push(change);
    this.pending.push(change);
    if (this.framePending) return;
    this.framePending = true;
    // Called before the rendering update that paints the change; the shift's time is that update's layout.
    requestAnimationFrame(() => {
      const now = performance.now();
      for (const c of this.pending) c.frame = now;
      this.pending = [];
      this.framePending = false;
    });
  }

  private isOwn(node: Node | null): boolean {
    const host = this.options.ownHost;
    // The panel lives in a shadow root: its nodes are found by the hosts above them.
    for (let n = node; host && n; ) {
      if (n === host || host.contains(n)) return true;
      const root = n.getRootNode();
      n = root instanceof ShadowRoot ? root.host : null;
    }
    return false;
  }

  /**
   * What changed before this frame's layout and after the last frame that shifted: the changes stamped with the
   * frame's rAF, and those made after it (an animation library writing styles in its own rAF).
   */
  private changesOfFrame(at: number): Change[] {
    let frame = -Infinity;
    for (const c of this.changes) if (c.frame <= at && c.frame > frame) frame = c.frame;
    const fresh = frame >= at - 100;
    return this.changes.filter((c) => c.t > this.lastShiftAt && c.t <= at && (fresh ? c.frame === frame || c.t > frame : c.t > at - 50));
  }

  private onEntry(entry: ShiftEntry) {
    const { t0 } = this.options;
    if (entry.startTime < t0) return;
    if (this.list.length >= MAX_SHIFTS) {
      this.truncated = true;
      return;
    }
    const raw = (entry.sources ?? []).filter((s) => !this.isOwn(s.node));
    // Only the recorder's own panel moved.
    if (entry.sources?.length && !raw.length) return;
    const moved = raw.map((s) => s.node).filter((n): n is Node => n !== null);
    const at = entry.startTime;
    const frame = this.changesOfFrame(at);
    this.lastShiftAt = at;
    const shift: LayoutShift = {
      atMs: Math.round(at - t0),
      value: +entry.value.toFixed(4),
      hadRecentInput: entry.hadRecentInput,
      ...(this.lastInput !== null && this.lastInput <= at ? { sinceInputMs: Math.round(at - this.lastInput) } : {}),
      cause: this.blame(moved, frame),
      // A node already gone when the entry came has no name left to give.
      sources: raw.map((s) => ({ ...(s.node ? this.named(s.node) : { node: '(removed)' }), from: rect(s.previousRect), to: rect(s.currentRect) })),
    };
    this.list.push(shift);
    this.options.onShift(shift);
  }

  private blame(moved: Node[], frame: Change[]): ShiftCause {
    const candidates: Candidate[] = [];
    const global: Change[] = [];
    // Loads first: an image mounted and loaded in the same frame is blamed on the missing size, not on the mount.
    for (const change of frame) if (change.kind === 'load') candidates.push({ change, node: change.node!, how: 'loaded' });
    for (const change of frame) {
      if (change.kind === 'load') continue;
      else if (change.kind === 'sheet' || change.kind === 'font') global.push(change);
      else
        for (const m of change.records!) {
          if (this.isOwn(m.target)) continue;
          if (m.type === 'attributes') {
            if (m.attributeName && !NO_LAYOUT_ATTR.test(m.attributeName))
              candidates.push({ change, node: m.target, how: 'attribute', name: m.attributeName });
          } else if (m.type === 'characterData') {
            if (m.target.parentNode) candidates.push({ change, node: m.target.parentNode, how: 'text' });
          } else {
            m.addedNodes.forEach((node) => {
              // A stylesheet put into the page moves everything; it is no one's neighbour.
              if (node.nodeName === 'STYLE' || node.nodeName === 'LINK') global.push({ ...change, kind: 'sheet', node });
              else candidates.push({ change, node, how: 'added' });
            });
            const removed = m.removedNodes[0];
            if (removed)
              candidates.push(
                m.nextSibling
                  ? { change, node: m.nextSibling, how: 'removed', removed }
                  : { change, node: m.target, how: 'removed', atEnd: true, removed }
              );
          }
        }
    }
    let inside: { candidate: Candidate; where: Where } | null = null;
    for (const node of moved) {
      const found = nearest(candidates, node);
      if (found && found.where !== 'inside') return this.causeOf(found.candidate, found.where);
      inside ??= found;
    }
    const animated = moved.length ? this.animation(moved) : null;
    if (animated) return animated;
    const sheet = global.find((c) => c.kind === 'sheet');
    if (sheet) return { resource: 'css', ...(sheet.node ? { by: { node: nodePath(sheet.node), where: 'before', change: 'added' } } : {}) };
    if (global.some((c) => c.kind === 'font')) return { resource: 'font' };
    if (inside) return this.causeOf(inside.candidate, inside.where);
    return { unknown: true };
  }

  private causeOf(candidate: Candidate, where: Where): ShiftCause {
    const { change, how, name, removed } = candidate;
    const gone = removed && this.named(removed);
    const media = how === 'added' && isMedia(candidate.node) && !sized(candidate.node as Element);
    const by: ShiftCulprit = {
      ...(gone?.component ? gone : this.named(candidate.node)),
      where,
      change: how,
      ...(name ? { name } : {}),
      ...(media ? { unsized: true as const } : {}),
    };
    const atMs = Math.round(change.t - this.options.t0);
    if (change.kind === 'commit') return { commit: change.commit ?? null, atMs, by };
    // Mounted by React all the same: a root the recording does not follow, outside the recorded area.
    if (how === 'added' && fiberFromNode(candidate.node)) return { commit: null, atMs, by };
    if (change.kind === 'load') return { resource: 'image', by };
    if (how === 'attribute' && name === 'style') return { animation: 'inline-style', by };
    return { dom: true, by };
  }

  /** A running animation of a property that takes space, on the moved element, above it, or around it. */
  private animation(moved: Node[]): ShiftCause | null {
    const all = typeof document.getAnimations === 'function' ? document.getAnimations() : [];
    const running = all
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        const property = target && animation.playState === 'running' ? layoutPropertyOf(animation) : null;
        return target && property ? { animation, node: target as Node, how: 'animated' as How, property } : null;
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    if (!running.length) return null;
    for (const node of moved) {
      const found = nearest(running, node);
      if (!found) continue;
      const { animation, property } = found.candidate;
      const css = typeof CSSTransition !== 'undefined' && (animation instanceof CSSTransition || animation instanceof CSSAnimation);
      return {
        animation: css ? 'css' : 'web-animations',
        by: { ...this.named(found.candidate.node), where: found.where, change: 'animated', name: property },
      };
    }
    return null;
  }

  /** The nearest app component that rendered the node, skipping wrappers, providers and packages. */
  private named(node: Node): ShiftNode {
    const element = elementOf(node);
    let app: Fiber | null = null;
    for (let f = element ? ownerOf(element) : null; f; f = f.return) {
      const name = nameOf(f);
      if (name && !isProvider(name) && !this.options.wrapperPattern.test(name) && !isLibraryFiber(f) && !wrapsProvider(f)) {
        app = f;
        break;
      }
    }
    const path = nodePath(node);
    if (!app) return { node: path };
    const file = sourceOf(app, this.options.projectRoot);
    const generated = generatedSourceOf(app);
    return { component: nameOf(app)!, ...(file ? { file } : {}), ...(generated ? { generated } : {}), node: path };
  }
}
