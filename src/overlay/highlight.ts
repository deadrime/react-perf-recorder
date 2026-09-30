import { currentOf, nearestHosts, type Fiber } from '../core/fiber';
import type { HighlightSink } from '../core/recorder';

interface Flash {
  /** In the document, not the viewport: the box is drawn for most of a second, and the page scrolls meanwhile. */
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  count: number;
  wasted: boolean;
  /** Mounted into the tree rather than rendered again: a dashed box. */
  mounted?: boolean;
  /** When the element last rendered: a box is lit from there, not from the first render of a streak. */
  at: number;
  /** A container scrolled under the box: its place is read from the element each frame, clipped to the container. */
  scroller?: Element;
}

/** An outline holds while renders keep coming and fades once they stop: a steady box, not a strobe. */
const LIT_MS = 320;
const FADE_MS = 420;
/** Renders closer together than this are one streak, and the count keeps rising. */
const STREAK_MS = LIT_MS + FADE_MS;
const MAX_FLASHES = 300;
/** A picked shift plays again every this long: a still, the move, then the result held. */
const SHIFT_LOOP_MS = 2200;
/** `roundRect` where the browser has it, a plain rectangle where it does not. */
const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) =>
  typeof ctx.roundRect === 'function' ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** Then it holds still: a loop left running draws every frame for as long as the report stays open. */
const SHIFT_REPLAYS = 3;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** Where a tag of width `w` may go by a box: above it, below it, then to its sides, then above or below where it was. */
function around(box: Box, w: number, was?: { left: number; top: number; width: number; height: number } | null): Array<[number, number]> {
  const spots: Array<[number, number]> = [
    [box.left, box.top - 22],
    [box.left, box.bottom + 2],
    [box.right + 4, box.top],
    [box.left - w - 4, box.top],
  ];
  if (was) spots.push([was.left, was.top - 22], [was.left, was.top + was.height + 2]);
  return spots;
}

/** A layout shift picked in the report: where each moved element was and is, and what moved it. */
export interface ShiftPin {
  /** `dx`, `dy`: from its box now to where it was before the shift; `was` is the size it had then. */
  moved: Array<{ el: Element; dx: number; dy: number; was: [number, number] | null; label: string }>;
  culprit: { el: Element; label: string } | null;
}

/** A closed menu or popover often stays in the DOM, unpositioned in the top-left: outlining it stacks boxes there. */
const shown = (el: Element) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) ?? true;

type Rgb = [number, number, number];

/** The four colours of an outline, by name in the panel's stylesheet and as the fallback for a page without it. */
const PALETTE: Array<[string, Rgb]> = [
  ['--flash-wasted', [150, 150, 160]],
  ['--flash-new', [52, 199, 89]],
  ['--flash-often', [255, 204, 0]],
  ['--flash-hot', [255, 69, 58]],
  ['--pick', [10, 132, 255]],
];

/** A canvas takes no custom property, so each one is read from the panel once and kept as numbers. */
const rgbOf = (value: string, fallback: Rgb): Rgb => {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!hex) return fallback;
  const n = parseInt(hex[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

/**
 * Outlines of rendered components on one canvas, `Name ×N` for the render count; grey when the DOM did not change.
 * Rects come through IntersectionObserver, so drawing forces no layout.
 */
export class Highlighter implements HighlightSink {
  enabled = true;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private pending = new Map<Element, { name: string; count: number; wasted: boolean; mounted?: boolean }>();
  /** Renders in a row with less than a fade between them: a steady ticker keeps counting up and turns red. */
  private counts = new WeakMap<Fiber, { n: number; at: number }>();
  /** One box per element, so a component rendering again refreshes its outline instead of stacking another. */
  private flashes = new Map<Element, Flash>();
  private frameRequested = false;
  private drawing = false;
  private costMs = 0;
  private colours: Rgb[] = PALETTE.map(([, fallback]) => fallback);
  /** Components picked on the report's timeline: outlined until the pick changes, whatever the highlight toggle says. */
  private pinned: Array<{ fiber: Fiber; label: string }> = [];
  private shift: ShiftPin | null = null;
  private shiftSince = 0;
  private element: { el: Element; label: string } | null = null;

  constructor(parent: ShadowRoot | Element) {
    const host = parent instanceof ShadowRoot ? parent.host : parent;
    const style = getComputedStyle(host);
    this.colours = PALETTE.map(([name, fallback]) => rgbOf(style.getPropertyValue(name), fallback));
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147483646' });
    this.canvas.setAttribute('data-rpr', 'overlay');
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      this.redraw();
    });
    // A pinned box follows its element when the page scrolls under it.
    window.addEventListener('scroll', (event) => this.scrolled(event.target), { capture: true, passive: true });
  }

  /** Outlines these components until the next call; an empty list takes them away. */
  pin(items: Array<{ fiber: Fiber; label: string }>) {
    this.pinned = items;
    this.redraw();
  }

  /** Outlines one element of the page, the largest paint's, until the next call; null takes it away. */
  pinElement(pin: { el: Element; label: string } | null) {
    this.element = pin;
    this.redraw();
  }

  /** Outlines a layout shift until the next call; null takes it away. */
  pinShift(pin: ShiftPin | null) {
    this.shift = pin;
    this.shiftSince = performance.now();
    this.redraw();
  }

  /** Window scroll is taken off document coords in draw; an inner container moves its boxes without it. */
  private scrolled(target: EventTarget | null) {
    if (target instanceof Element && target !== document.scrollingElement) {
      for (const [el, f] of this.flashes) {
        if (!target.contains(el)) continue;
        // The innermost container clips tightest.
        if (!f.scroller || f.scroller.contains(target)) f.scroller = target;
      }
    }
    this.redraw();
  }

  private slowTimer: ReturnType<typeof setTimeout> | null = null;

  private redraw() {
    // A slow refresh waiting is no frame on its way: draw now.
    if (this.slowTimer) {
      clearTimeout(this.slowTimer);
      this.slowTimer = null;
      this.drawing = false;
    }
    if (this.drawing) return;
    this.drawing = true;
    requestAnimationFrame(() => this.draw());
  }

  takeCostMs() {
    const cost = this.costMs;
    this.costMs = 0;
    return cost;
  }

  reset() {
    this.counts = new WeakMap();
    this.pending.clear();
    this.flashes.clear();
    this.clear();
  }

  flash(pairs: Array<[Element, string, Fiber]>, withoutDom: Set<Fiber>, mounted?: Set<Fiber>) {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();
    for (const [el, name, fiber] of pairs) {
      const prev = this.counts.get(fiber) ?? (fiber.alternate ? this.counts.get(fiber.alternate) : undefined);
      const entry = { n: prev && now - prev.at < STREAK_MS ? prev.n + 1 : 1, at: now };
      const count = entry.n;
      this.counts.set(fiber, entry);
      if (fiber.alternate) this.counts.set(fiber.alternate, entry);
      const known = this.pending.get(el);
      const isMount = mounted?.has(fiber) ?? false;
      this.pending.set(el, {
        name: known?.name ?? name,
        count: Math.max(count, known?.count ?? 0),
        wasted: !isMount && withoutDom.has(fiber) && (known?.wasted ?? true),
        mounted: isMount || (known?.mounted ?? false),
      });
    }
    if (!this.frameRequested) {
      this.frameRequested = true;
      requestAnimationFrame(() => this.measure());
    }
  }

  private measure() {
    const started = performance.now();
    this.frameRequested = false;
    const batch = this.pending;
    this.pending = new Map();
    const targets = [...batch.keys()].filter((el) => el.isConnected).slice(0, MAX_FLASHES);
    if (!targets.length) return;
    const observer = new IntersectionObserver((entries) => {
      observer.disconnect();
      const now = performance.now();
      const [sx, sy] = [scrollX, scrollY];
      for (const entry of entries) {
        const info = batch.get(entry.target);
        const r = entry.boundingClientRect;
        if (!info || (!r.width && !r.height) || !shown(entry.target)) continue;
        this.flashes.set(entry.target, { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, ...info, at: now });
      }
      for (const el of this.flashes.keys()) {
        if (this.flashes.size <= MAX_FLASHES) break;
        this.flashes.delete(el);
      }
      this.redraw();
    });
    targets.forEach((el) => observer.observe(el));
    this.costMs += performance.now() - started;
  }

  private draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const started = performance.now();
    const now = performance.now();
    for (const [el, f] of this.flashes) if (now - f.at >= STREAK_MS) this.flashes.delete(el);
    this.clear();
    const labelled = new Set<string>();
    const mountedAt = new Set<string>();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    // Mounts last, so their dashed box is on top of the parent's, and their label wins a corner they share.
    const ordered = [...this.flashes.values()].sort((a, b) => Number(Boolean(b.mounted)) - Number(Boolean(a.mounted)));
    for (const [el, flash] of this.flashes) if (flash.scroller) this.follow(el, flash);
    for (const flash of ordered.reverse()) {
      const f = { ...flash, x: flash.x - scrollX, y: flash.y - scrollY };
      let top = 0;
      if (flash.scroller) {
        const clip = flash.scroller.getBoundingClientRect();
        top = clip.top;
        ctx.save();
        ctx.beginPath();
        ctx.rect(clip.left, clip.top, clip.width, clip.height);
        ctx.clip();
      }
      const age = now - f.at;
      // Full while it keeps rendering, and only then on its way out.
      const alpha = age <= LIT_MS ? 1 : Math.max(0, 1 - (age - LIT_MS) / FADE_MS);
      const [r, g, b] = this.colourOf(f.count, f.wasted);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 1.5;
      // A mount is not one more render of the same thing: dashed, and named for what happened.
      ctx.setLineDash(f.mounted ? [5, 3] : []);
      ctx.strokeRect(f.x + 0.5, f.y + 0.5, Math.max(0, f.w - 1), Math.max(0, f.h - 1));
      ctx.setLineDash([]);
      const label = f.mounted ? `${f.name} · mounted` : `${f.name} ×${f.count}`;
      const at = `${Math.round(f.x)}:${Math.round(f.y)}`;
      if (labelled.size < 60 && (!labelled.has(at) || (f.mounted && !mountedAt.has(at))) && f.w > 24) {
        labelled.add(at);
        if (f.mounted) mountedAt.add(at);
        const width = this.widthOf(ctx, label) + 6;
        // Inside the box when there is no room above it, or the scroller would clip the label away.
        const y = f.y - 14 >= top ? f.y - 14 : f.y;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.9})`;
        ctx.fillRect(f.x, y, width, 14);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillText(label, f.x + 3, y + 11);
      }
      if (flash.scroller) ctx.restore();
    }
    this.drawPinned(ctx);
    // Only render outlines count as overhead: a picked shift is drawn from the report, not while the app works.
    this.costMs += performance.now() - started;
    this.drawShift(ctx);
    // A picked shift plays its move a few times; then its boxes follow the page a few times a second.
    if (this.flashes.size || this.replaying()) requestAnimationFrame(() => this.draw());
    else if (this.shift)
      this.slowTimer = setTimeout(() => {
        this.slowTimer = null;
        requestAnimationFrame(() => this.draw());
      }, 250);
    else this.drawing = false;
  }

  /** Scrolling does not dirty layout, so reading the rect here costs no reflow, as for a pinned box. */
  private follow(el: Element, flash: Flash) {
    if (!el.isConnected || !flash.scroller?.isConnected) return;
    const r = el.getBoundingClientRect();
    Object.assign(flash, { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
  }

  /** Labels repeat from frame to frame while a box fades: measured once each. */
  private readonly labelWidths = new Map<string, number>();

  private widthOf(ctx: CanvasRenderingContext2D, label: string): number {
    let width = this.labelWidths.get(label);
    if (width === undefined) {
      if (this.labelWidths.size > 500) this.labelWidths.clear();
      this.labelWidths.set(label, (width = ctx.measureText(label).width));
    }
    return width;
  }

  /** A box around everything a picked component draws, in the colour of picking, and its label above. */
  private drawPinned(ctx: CanvasRenderingContext2D) {
    if (!this.pinned.length && !this.element) return;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const { fiber, label } of this.pinned) {
      const rects = nearestHosts(currentOf(fiber), 200)
        .filter((el) => el.isConnected)
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.width || rect.height);
      if (!rects.length) continue;
      const x = Math.min(...rects.map((rect) => rect.left));
      const y = Math.min(...rects.map((rect) => rect.top));
      this.drawPick(ctx, x, y, Math.max(...rects.map((rect) => rect.right)) - x, Math.max(...rects.map((rect) => rect.bottom)) - y, label);
    }
    const pinned = this.element;
    if (pinned?.el.isConnected) {
      const rect = pinned.el.getBoundingClientRect();
      this.drawPick(ctx, rect.left, rect.top, rect.width, rect.height, pinned.label);
    }
  }

  private drawPick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string) {
    const [r, g, b] = this.colours[4];
    ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
    const width = ctx.measureText(label).width + 8;
    const top = y > 16 ? y - 16 : y;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, top, width, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 4, top + 12);
  }

  /** A picked shift: the culprit hatched in a red frame, each moved element blue now and dashed where it was, an arrow between. */
  private drawShift(ctx: CanvasRenderingContext2D) {
    const pin = this.shift;
    if (!pin) return;
    const blue = this.colours[4];
    const red = this.colours[3];
    const rgba = ([r, g, b]: Rgb, a = 1) => `rgba(${r},${g},${b},${a})`;
    ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    // Tags go where they cover neither an element that moved nor the cause, nor another tag: each is tried in a
    // few places and put in the freest one.
    const tags: Array<{ text: string; colour: Rgb; at: (w: number) => Array<[number, number]>; optional?: boolean; outline?: boolean }> = [];
    const keepClear: Box[] = [];

    const culprit = pin.culprit?.el.isConnected ? pin.culprit : null;
    if (culprit) {
      const box = culprit.el.getBoundingClientRect();
      keepClear.push(box);
      this.stripes(ctx, box, 'rgba(110,110,122,0.28)');
      ctx.strokeStyle = rgba(red, 0.9);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(box.left + 0.75, box.top + 0.75, Math.max(0, box.width - 1.5), Math.max(0, box.height - 1.5));
      tags.push({ text: culprit.label, colour: red, at: (w) => around(box, w) });
    }

    const t = (performance.now() - this.shiftSince) % SHIFT_LOOP_MS;
    for (const moved of pin.moved) {
      if (!moved.el.isConnected) continue;
      const now = moved.el.getBoundingClientRect();
      keepClear.push(now);
      const was = moved.was && { left: now.left + moved.dx, top: now.top + moved.dy, width: moved.was[0], height: moved.was[1] };
      if (was) {
        ctx.strokeStyle = rgba(blue, 0.9);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(was.left + 1, was.top + 1, Math.max(0, was.width - 2), Math.max(0, was.height - 2));
        ctx.setLineDash([]);
      }
      ctx.fillStyle = rgba(blue, 0.1);
      ctx.fillRect(now.left, now.top, now.width, now.height);
      ctx.strokeStyle = rgba(blue);
      ctx.lineWidth = 2;
      ctx.strokeRect(now.left + 1, now.top + 1, Math.max(0, now.width - 2), Math.max(0, now.height - 2));
      // Rows of one list move together: one name and one distance say it for all of them.
      if (!tags.some((tag) => tag.text === moved.label)) tags.push({ text: moved.label, colour: blue, at: (w) => around(now, w, was) });
      const distance = Math.hypot(moved.dx, moved.dy);
      if (was && distance > 4) {
        // The move once more, from where it was to where it is: the eye follows motion before it reads boxes.
        if (this.replaying()) {
          const k = t < 500 ? 0 : t < 900 ? ease((t - 500) / 400) : 1;
          const fade = t < 900 ? 1 : Math.max(0, 1 - (t - 900) / 600);
          if (fade > 0) {
            ctx.fillStyle = rgba(blue, 0.28 * fade);
            ctx.fillRect(was.left + (now.left - was.left) * k, was.top + (now.top - was.top) * k, now.width, now.height);
          }
        }
        const vertical = Math.abs(moved.dy) >= Math.abs(moved.dx);
        // Through the element, near its end: a short one is crossed in the middle, not below it.
        const x = now.width > 56 ? Math.min(now.right, innerWidth) - 28 : now.left + now.width / 2;
        const y = now.height > 56 ? Math.max(now.top, 0) + 28 : now.top + now.height / 2;
        const [x1, y1, x2, y2] = vertical ? [x, was.top + (y - now.top), x, y] : [was.left + (x - now.left), y, x, y];
        // Shorter than its own head, an arrow is a blot: the tag says the distance.
        if (distance >= 16) this.arrow(ctx, x1, y1, x2, y2, rgba(blue));
        const text = `${vertical ? (moved.dy < 0 ? '↓' : '↑') : moved.dx < 0 ? '→' : '←'} ${Math.round(distance)}px`;
        if (tags.some((tag) => tag.text === text)) continue;
        tags.push({
          text,
          colour: blue,
          at: (w) =>
            vertical
              ? [
                  [x1 - w - 8, (y1 + y2) / 2 - 10],
                  [x1 + 8, (y1 + y2) / 2 - 10],
                ]
              : [
                  [(x1 + x2) / 2 - w / 2, Math.max(now.bottom, was.top + was.height) + 4],
                  [(x1 + x2) / 2 - w / 2, Math.min(now.top, was.top) - 24],
                ],
        });
        tags.push({ text: 'before', colour: blue, outline: true, optional: true, at: () => [[was.left + 4, was.top + 4]] });
      }
    }
    // Tags last, over every box, so none of them is buried under the box of another element.
    const placed: Box[] = [];
    for (const tag of tags) {
      const w = ctx.measureText(tag.text).width + 12;
      let best: Box | null = null;
      let cost = Infinity;
      for (const [x, y] of tag.at(w)) {
        const left = Math.max(0, Math.min(x, innerWidth - w));
        const top = Math.max(0, Math.min(y, innerHeight - 20));
        const box = { left, top, right: left + w, bottom: top + 20 };
        // Over another tag is worse than over an element: that one cannot be read at all.
        const c = placed.reduce((sum, p) => sum + 4 * overlap(box, p), 0) + keepClear.reduce((sum, k) => sum + overlap(box, k), 0);
        if (c < cost) [best, cost] = [box, c];
        if (!c) break;
      }
      if (!best || (tag.optional && cost > 0)) continue;
      placed.push(best);
      this.tag(ctx, tag.text, best.left, best.top, tag.colour, tag.outline);
    }
  }

  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private replaying() {
    return Boolean(this.shift) && !this.reducedMotion && performance.now() - this.shiftSince < SHIFT_REPLAYS * SHIFT_LOOP_MS;
  }

  /** A label on a rounded tab; `outline` draws it as a dashed tab, for the box of where something was. */
  private tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, [r, g, b]: Rgb, outline = false) {
    const w = ctx.measureText(text).width + 12;
    const left = Math.max(0, Math.min(x, innerWidth - w));
    const top = Math.max(0, y);
    ctx.beginPath();
    rounded(ctx, left, top, w, 20, 4);
    ctx.fillStyle = outline ? 'rgba(20,20,26,0.85)' : `rgb(${r},${g},${b})`;
    ctx.fill();
    if (outline) {
      ctx.beginPath();
      rounded(ctx, left + 0.5, top + 0.5, w - 1, 19, 4);
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(text, left + 6, top + 14);
  }

  /** Thin grey hatching: marks the cause as something put in without shouting over the page under it. */
  private stripes(ctx: CanvasRenderingContext2D, box: DOMRect, colour: string) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.left, box.top, box.width, box.height);
    ctx.clip();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let d = -box.height; d < box.width; d += 9) {
      ctx.moveTo(box.left + d, box.bottom);
      ctx.lineTo(box.left + d + box.height, box.top);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * From a ringed dot where the edge was to a swept head where it is: a slim shaft with a soft shadow, so it stands
   * off a light page and a dark one without a heavy rim.
   */
  private arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, colour: string) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const [len, half, notch] = [13, 5.5, 4];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - (len - notch) * cos, y2 - (len - notch) * sin);
    ctx.stroke();
    // The head's back is cut in, the way a drawn arrow is, rather than a flat triangle.
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * cos - half * sin, y2 - len * sin + half * cos);
    ctx.lineTo(x2 - (len - notch) * cos, y2 - (len - notch) * sin);
    ctx.lineTo(x2 - len * cos + half * sin, y2 - len * sin - half * cos);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** Grey when the render changed nothing; otherwise green, amber and red by how often it came. */
  private colourOf(count: number, wasted: boolean): Rgb {
    const [wastedColour, fresh, often, hot] = this.colours;
    if (wasted) return wastedColour;
    return count < 3 ? fresh : count < 10 ? often : hot;
  }

  private clear() {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    // In pixels, not 100vh: on a phone 100vh is the height without the address bar, and the canvas was stretched to it.
    Object.assign(this.canvas.style, { width: `${innerWidth}px`, height: `${innerHeight}px` });
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
