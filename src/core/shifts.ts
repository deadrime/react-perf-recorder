import type { LatencyEntry, LayoutShift, ShiftCause, ShiftCulprit, ShiftNode, ShiftRect, ShiftStats } from '../shared/schema';
import { clsOf, linkInteractions, MAX_SHIFTS } from '../shared/shifts';
import { ownerOf } from './dom';
import { generatedSourceOf, isLibraryFiber, isProvider, nameOf, sourceOf, wrapsProvider, type Fiber } from './fiber';

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
  kind: 'commit' | 'dom' | 'load' | 'sheet' | 'font' | 'transition';
  /** What the DOM change did, read when it came: no MutationRecord is kept, so nothing removed stays in memory. */
  items?: Item[];
  node?: Node;
  /** A transition that ended: the property it moved. */
  property?: string;
  commit?: number | null;
}

/** One thing a DOM change did: where, and how; a removal keeps the name of what went, not the node. */
interface Item {
  node: Node;
  how: 'added' | 'removed' | 'attribute' | 'text';
  name?: string;
  atEnd?: true;
  removed?: ShiftNode;
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
  /** What was removed, named when the change came, while React still knew it; `node` only marks where it was. */
  removed?: ShiftNode;
}

export interface ShiftOptions {
  t0: number;
  projectRoot: string;
  wrapperPattern: RegExp;
  ownHost: Element | null;
  onShift(shift: LayoutShift): void;
}

/** Removals named per DOM change: a list replaced at once is one culprit, not a thousand names. */
const MAX_NAMED = 50;
/** A change older than this has been painted long before any shift the observer can still report. */
const KEEP_MS = 2000;
// Attributes that change what an element looks like but never where anything is.
const NO_LAYOUT_ATTR =
  /^(value|name|id|title|tabindex|for|role|placeholder|autocomplete|checked|selected|href|target|rel|alt|aria-(?!expanded|hidden))/;
const LAYOUT_PROP =
  /^(height|width|min-|max-|top|left|right|bottom|inset|margin|padding|flex|grid|font-size|line-height|border(-\w+)?-width|gap|row-gap|column-gap|all$)/;

export const shiftsSupported = () =>
  typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('layout-shift');

/** A <style> applies when put in; a <link> only when it loads, which its load event reports. */
const isSheet = (n: Node) => n.nodeName === 'STYLE' || n.parentNode?.nodeName === 'STYLE';
// An iframe or an embed has a 300×150 box before it loads, and keeps it.
const isMedia = (n: Node) => /^(IMG|VIDEO|IMAGE)$/i.test(n.nodeName);
/**
 * An image that takes its space before it loads: its size in attributes, a height or an aspect ratio in its style. A
 * height from a stylesheet class is not seen here.
 */
const sized = (el: Element) => {
  if (el.hasAttribute('width') && el.hasAttribute('height')) return true;
  const style = (el as HTMLElement).style;
  if ((style?.height && style.height !== 'auto') || (style?.aspectRatio && style.aspectRatio !== 'auto')) return true;
  const ratio = typeof getComputedStyle === 'function' ? getComputedStyle(el).aspectRatio : '';
  return Boolean(ratio) && !/^auto$/.test(ratio);
};
/** React keeps its fiber on the node it made; a node put into a React element by hand has none of its own. */
const madeByReact = (node: Node) => Object.keys(node).some((k) => k.startsWith('__reactFiber$'));

const area = (r: DOMRectReadOnly) => Math.max(0, r.width) * Math.max(0, r.height);
const rect = (r: DOMRectReadOnly): ShiftRect => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
const elementOf = (node: Node): Element | null => (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);

/** `main > ul.list > li`: a tag with an id, a test id or a readable class; hashed names say nothing. */
export function nodePath(node: Node | null): string {
  const one = (e: Element) => {
    // localName keeps `foreignObject` as a selector matches it.
    const tag = e.localName;
    const testId = e.getAttribute('data-testid');
    if (testId) return `${tag}[data-testid="${testId.replace(/["\\]/g, '\\$&')}"]`;
    if (e.id && /^[a-zA-Z][\w-]{0,30}$/.test(e.id)) return `${tag}#${e.id}`;
    const cls = [...e.classList].find((c) => /^[a-zA-Z][a-zA-Z-]{1,23}$/.test(c) && !/^(css|sc|jsx|emotion)-/.test(c));
    return cls ? `${tag}.${cls}` : tag;
  };
  const parts: string[] = [];
  for (let e = node && elementOf(node); e && parts.length < 3 && e !== document.body && e !== document.documentElement; e = e.parentElement)
    parts.unshift(one(e));
  return parts.join(' > ') || (node && elementOf(node)?.localName) || '?';
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

/** document, html, body and the app's root element: a parent every element of the page shares. */
const TOP_DEPTH = 4;

const RANK: Record<Where, number> = { self: 4, ancestor: 3, before: 2, inside: 1 };

/** The change nearest to the moved element: itself, then an ancestor, then the closest before it, then inside it. */
export function nearest<T extends Pick<Candidate, 'node' | 'how' | 'atEnd'>>(candidates: T[], moved: Node): { candidate: T; where: Where } | null {
  let best: { candidate: T; where: Where; depth: number } | null = null;
  for (const candidate of candidates) {
    const where = whereOf(candidate, moved);
    if (!where) continue;
    // The deeper shared parent for a change above it; for an ancestor, the one nearest the moved element.
    const depth = where === 'before' || where === 'ancestor' ? depthBelow(candidate.node, moved) : 0;
    if (
      !best ||
      RANK[where] > RANK[best.where] ||
      (where === best.where && (where === 'before' || where === 'ancestor') && depth > best.depth) ||
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

/** Layout shifts with what moved them: a commit, a style written from script, an animation, or a resource that arrived. */
export class ShiftWatcher {
  readonly list: LayoutShift[] = [];
  private truncated = false;
  private changes: Change[] = [];
  private pending: Change[] = [];
  private framePending = false;
  private openCommit: Change | null = null;
  private lastInput: number | null = null;
  /** Window scroll positions with when they began, the last few: an entry arrives after the page may have scrolled on. */
  private scrolls: Array<[number, number, number]> = [];
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
    this.scrolls = [[-Infinity, Math.round(scrollX), Math.round(scrollY)]];
    listen(window, 'scroll', (e) => {
      if (e.target !== document && e.target !== window) return;
      this.scrolls.push([e.timeStamp, Math.round(scrollX), Math.round(scrollY)]);
      if (this.scrolls.length > 16) this.scrolls.shift();
    });
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
    // A transition that ended in the frame that shifted is no longer among the running animations when the entry comes.
    listen(document, 'transitionend', (e) => {
      const { propertyName, target } = e as TransitionEvent;
      if (target instanceof Element && LAYOUT_PROP.test(propertyName) && !this.isOwn(target))
        this.add({ t: performance.now(), frame: NaN, kind: 'transition', node: target, property: propertyName });
    });
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

  /** The entries the observer has not handed over yet: taken before the recorder stops streaming. */
  flush() {
    this.observer?.takeRecords().forEach((entry) => this.onEntry(entry as ShiftEntry));
  }

  stop() {
    this.flush();
    this.observer?.disconnect();
    this.observer = null;
    this.head?.disconnect();
    this.head = null;
    this.off.forEach((off) => off());
    this.off = [];
    this.changes = [];
    this.pending = [];
    if (this.pruneTimer) clearTimeout(this.pruneTimer);
    this.pruneTimer = null;
  }

  /** What the DOM watcher saw change: in a commit, or between commits. */
  noteRecords(records: MutationRecord[], commit: boolean) {
    if (!records.length) return;
    const t = performance.now();
    const items: Item[] = [];
    let named = 0;
    for (const m of records) {
      if (this.isOwn(m.target)) continue;
      if (m.type === 'attributes') {
        if (m.attributeName && !NO_LAYOUT_ATTR.test(m.attributeName)) items.push({ node: m.target, how: 'attribute', name: m.attributeName });
      } else if (m.type === 'characterData') {
        if (m.target.parentNode) items.push({ node: m.target.parentNode, how: 'text' });
      } else {
        m.addedNodes.forEach((node) => {
          // A stylesheet put into the page moves everything; it is no one's neighbour. Other links move nothing.
          if (isSheet(node)) this.add({ t, frame: NaN, kind: 'sheet', node });
          else if (node.nodeName !== 'LINK') items.push({ node, how: 'added' });
        });
        const gone = m.removedNodes[0];
        if (!gone) continue;
        // Named now: by the time the shift is reported React has let go of the removed nodes' fibers.
        // Past the cap it is named later by where it was, which still has its component.
        const removed = named++ < MAX_NAMED ? { removed: this.removedName(gone, m.target) } : {};
        items.push(m.nextSibling ? { node: m.nextSibling, how: 'removed', ...removed } : { node: m.target, how: 'removed', atEnd: true, ...removed });
      }
    }
    const change: Change = { t, frame: NaN, kind: commit ? 'commit' : 'dom', items };
    if (commit) this.openCommit = change;
    this.add(change);
  }

  /** The id the commit just noted got; null when it rendered nothing in the area and was not kept. */
  commitDone(id: number | null) {
    if (this.openCommit) this.openCommit.commit = id;
    this.openCommit = null;
  }

  result(latency: LatencyEntry[]): ShiftStats {
    linkInteractions(this.list, latency);
    return { list: this.list, ...(this.truncated ? { truncated: true as const } : {}), cls: clsOf(this.list) };
  }

  private pruneTimer: ReturnType<typeof setTimeout> | null = null;

  private prune(now: number) {
    const { changes } = this;
    let stale = 0;
    while (stale < changes.length && changes[stale].t < now - KEEP_MS) stale++;
    if (stale) changes.splice(0, stale);
    // A hidden tab runs no rAF to stamp them: what waits for a frame must not pile up either.
    if (this.pending.length && this.pending[0].t < now - KEEP_MS) this.pending = this.pending.filter((c) => c.t >= now - KEEP_MS);
  }

  /** One timer at a time, armed again while changes remain: not a timer per DOM batch. */
  private armPrune() {
    this.pruneTimer = setTimeout(() => {
      this.pruneTimer = null;
      this.prune(performance.now());
      if (this.changes.length) this.armPrune();
    }, KEEP_MS + 100);
  }

  private add(change: Change) {
    this.prune(change.t);
    this.changes.push(change);
    // An idle page gets no next change to prune on: what was added stays reachable no longer than it is useful.
    if (!this.pruneTimer) this.armPrune();
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
   * The browser gives no node for an element in a shadow tree, the panel's included: a box with no node that the
   * panel covers now is taken for the panel's.
   */
  private underOwn(now: DOMRectReadOnly, before: DOMRectReadOnly): boolean {
    const box = now.width && now.height ? now : before;
    if (!this.options.ownHost || !box.width || !box.height) return false;
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === this.options.ownHost;
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
    const all = entry.sources ?? [];
    const raw = all.filter((s) => !this.isOwn(s.node) && (s.node || !this.underOwn(s.currentRect, s.previousRect)));
    // Only the recorder's own panel moved.
    if (all.length && !raw.length) return;
    // The panel's share out of the value, by the area its boxes covered: the page's own CLS has no panel in it.
    const covered = (list: typeof all) => list.reduce((sum, s) => sum + area(s.previousRect) + area(s.currentRect), 0);
    const share = raw.length < all.length && covered(all) ? covered(raw) / covered(all) : 1;
    const moved = raw.map((s) => s.node).filter((n): n is Node => n !== null);
    const at = entry.startTime;
    const frame = this.changesOfFrame(at);
    this.lastShiftAt = at;
    const shift: LayoutShift = {
      atMs: Math.round(at - t0),
      value: +(entry.value * share).toFixed(4),
      hadRecentInput: entry.hadRecentInput,
      ...(this.lastInput !== null && this.lastInput <= at ? { sinceInputMs: Math.round(at - this.lastInput) } : {}),
      cause: this.blame(moved, frame),
      sources: raw.map((s) => ({ ...this.sourceName(s.node, s.currentRect), from: rect(s.previousRect), to: rect(s.currentRect) })),
      ...this.scrollAt(at),
    };
    this.list.push(shift);
    // Marked at the cap, as a partial recording rebuilt from the stream can tell no more than that.
    if (this.list.length >= MAX_SHIFTS) this.truncated = true;
    this.options.onShift(shift);
  }

  /**
   * The browser gives no node for one already removed, nor for one in a shadow tree: a shadow host on the spot the
   * box is now is named instead, the component the moved element is part of.
   */
  private sourceName(node: Node | null, now: DOMRectReadOnly): ShiftNode {
    if (node) return this.named(node);
    const hit = now.width && now.height ? document.elementFromPoint(now.x + now.width / 2, now.y + now.height / 2) : null;
    if (hit?.shadowRoot && !this.isOwn(hit)) return this.named(hit);
    return { node: '(removed)' };
  }

  private blame(moved: Node[], frame: Change[]): ShiftCause {
    const candidates: Candidate[] = [];
    const global: Change[] = [];
    // Loads first: an image mounted and loaded in the same frame is blamed on the missing size, not on the mount.
    for (const change of frame) if (change.kind === 'load') candidates.push({ change, node: change.node!, how: 'loaded' });
    const ended: Change[] = [];
    for (const change of frame) {
      if (change.kind === 'load') continue;
      else if (change.kind === 'sheet' || change.kind === 'font') global.push(change);
      else if (change.kind === 'transition') ended.push(change);
      else for (const item of change.items ?? []) candidates.push({ change, ...item });
    }
    let inside: { candidate: Candidate; where: Where } | null = null;
    // A change that shares no more than the page's top with the moved element is a weak lead: a running animation,
    // a stylesheet or a font of the same frame is taken first.
    let distant: { candidate: Candidate; where: Where } | null = null;
    for (const node of moved) {
      const found = nearest(candidates, node);
      if (found && found.where === 'before' && depthBelow(found.candidate.node, node) <= TOP_DEPTH) distant ??= found;
      else if (found && found.where !== 'inside') return this.causeOf(found.candidate, found.where);
      else inside ??= found;
    }
    const animated = moved.length ? this.animation(moved, ended) : null;
    if (animated && !animated.distant) return animated.cause;
    // A <style> CSS-in-JS puts in comes with the component it styles: the mount is the lead, not the sheet.
    const loaded = global.some((c) => c.kind === 'font' || c.node?.nodeName === 'LINK');
    if (distant && !loaded) return this.causeOf(distant.candidate, distant.where);
    const sheet = global.find((c) => c.kind === 'sheet');
    if (sheet) return { resource: 'css', ...(sheet.node ? { by: { node: nodePath(sheet.node), where: 'before', change: 'added' } } : {}) };
    if (global.some((c) => c.kind === 'font')) return { resource: 'font' };
    if (distant) return this.causeOf(distant.candidate, distant.where);
    if (animated) return animated.cause;
    if (inside) return this.causeOf(inside.candidate, inside.where);
    return { unknown: true };
  }

  private causeOf(candidate: Candidate, where: Where): ShiftCause {
    const { change, how, name, removed: gone } = candidate;
    const media = how === 'added' && isMedia(candidate.node) && !sized(candidate.node as Element);
    const by: ShiftCulprit = {
      ...(gone ?? this.named(candidate.node)),
      where,
      change: how,
      ...(name ? { name } : {}),
      ...(media ? { unsized: true as const } : {}),
    };
    const atMs = Math.round(change.t - this.options.t0);
    if (change.kind === 'commit') return { commit: change.commit ?? null, atMs, by };
    // Mounted by React all the same: a root the recording does not follow, outside the recorded area.
    if (how === 'added' && madeByReact(candidate.node)) return { commit: null, atMs, by };
    if (change.kind === 'load') return { resource: 'image', by };
    if (how === 'attribute' && name === 'style') return { animation: 'inline-style', by };
    return { dom: true, by };
  }

  /** A running animation of a property that takes space, on the moved element, above it, or around it. */
  private animation(moved: Node[], ended: Change[]): { cause: ShiftCause; distant: boolean } | null {
    const all = typeof document.getAnimations === 'function' ? document.getAnimations() : [];
    const running: Array<{ css: boolean; node: Node; how: How; property: string }> = all
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        const property = target && animation.playState === 'running' && !this.isOwn(target) ? layoutPropertyOf(animation) : null;
        const css = typeof CSSTransition !== 'undefined' && (animation instanceof CSSTransition || animation instanceof CSSAnimation);
        return target && property ? { css, node: target as Node, how: 'animated' as How, property } : null;
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    for (const c of ended) running.push({ css: true, node: c.node!, how: 'animated', property: c.property! });
    if (!running.length) return null;
    let distant: { cause: ShiftCause; distant: boolean } | null = null;
    for (const node of moved) {
      const found = nearest(running, node);
      if (!found) continue;
      const { css, property } = found.candidate;
      const cause: ShiftCause = {
        animation: css ? 'css' : 'web-animations',
        by: { ...this.named(found.candidate.node), where: found.where, change: 'animated', name: property },
      };
      // A spinner looping at the page's top moves nothing further down; one inside cannot move the element's corner.
      const weak = found.where === 'inside' || (found.where === 'before' && depthBelow(found.candidate.node, node) <= TOP_DEPTH);
      if (!weak) return { cause, distant: false };
      distant ??= { cause, distant: true };
    }
    return distant;
  }

  private scrollAt(at: number): { scroll?: [number, number] } {
    let x = Math.round(scrollX);
    let y = Math.round(scrollY);
    // A scroll before the shift's frame fires its event in that same frame, a few ms after its start.
    for (let i = this.scrolls.length - 1; i >= 0; i--)
      if (this.scrolls[i][0] <= at + 4) {
        [, x, y] = this.scrolls[i];
        break;
      }
    return x || y ? { scroll: [x, y] } : {};
  }

  /** A removed node's own component, or its parent's with the path it had: `node` of the record is often the victim. */
  private removedName(gone: Node, parent: Node): ShiftNode {
    const own = this.named(gone);
    return own.component ? own : { ...this.named(parent), node: `${nodePath(parent)} > ${nodePath(gone)}` };
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
