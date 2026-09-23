import { currentOf, nearestHosts, type Fiber } from '../core/fiber';
import type { HighlightSink } from '../core/recorder';

interface Flash {
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
}

/**
 * An outline holds still while the renders keep coming and only fades once they stop, so a component that renders
 * ten times a second is a steady box with a rising count — not a strobe. The colour says how often, the number says
 * how many; neither needs the box to blink.
 */
const LIT_MS = 320;
const FADE_MS = 420;
/** Renders closer together than this are one streak, and the count keeps rising. */
const STREAK_MS = LIT_MS + FADE_MS;
const MAX_FLASHES = 300;

/**
 * A closed menu or popover is often still in the DOM, unpositioned in the top-left corner: its renders are real,
 * but outlining them stacks boxes over the page. Rects come from an IntersectionObserver, so no layout is forced
 * here beyond the style check itself.
 */
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
 * Outlines of rendered components, like react-scan: one canvas, rectangles read through IntersectionObserver (no
 * forced layout), a box per element that holds while it keeps rendering, and `Name ×N` for the instance's render
 * count. Grey — the render changed nothing in the DOM.
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

  constructor(parent: ShadowRoot | Element) {
    const host = parent instanceof ShadowRoot ? parent.host : parent;
    const style = getComputedStyle(host);
    this.colours = PALETTE.map(([name, fallback]) => rgbOf(style.getPropertyValue(name), fallback));
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '2147483646' });
    this.canvas.setAttribute('data-rpr', 'overlay');
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      this.redraw();
    });
    // A pinned box follows its element when the page scrolls under it.
    window.addEventListener('scroll', () => this.redraw(), { capture: true, passive: true });
  }

  /** Outlines these components until the next call; an empty list takes them away. */
  pin(items: Array<{ fiber: Fiber; label: string }>) {
    this.pinned = items;
    this.redraw();
  }

  private redraw() {
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
      for (const entry of entries) {
        const info = batch.get(entry.target);
        const r = entry.boundingClientRect;
        if (!info || (!r.width && !r.height) || !shown(entry.target)) continue;
        this.flashes.set(entry.target, { x: r.left, y: r.top, w: r.width, h: r.height, ...info, at: now });
      }
      for (const el of this.flashes.keys()) {
        if (this.flashes.size <= MAX_FLASHES) break;
        this.flashes.delete(el);
      }
      if (!this.drawing) {
        this.drawing = true;
        requestAnimationFrame(() => this.draw());
      }
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
    for (const f of ordered.reverse()) {
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
        const y = f.y > 14 ? f.y - 14 : f.y;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.9})`;
        ctx.fillRect(f.x, y, width, 14);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillText(label, f.x + 3, y + 11);
      }
    }
    this.drawPinned(ctx);
    this.costMs += performance.now() - started;
    if (this.flashes.size) requestAnimationFrame(() => this.draw());
    else this.drawing = false;
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
    if (!this.pinned.length) return;
    const [r, g, b] = this.colours[4];
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const { fiber, label } of this.pinned) {
      const rects = nearestHosts(currentOf(fiber), 200)
        .filter((el) => el.isConnected)
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.width || rect.height);
      if (!rects.length) continue;
      const x = Math.min(...rects.map((rect) => rect.left));
      const y = Math.min(...rects.map((rect) => rect.top));
      const w = Math.max(...rects.map((rect) => rect.right)) - x;
      const h = Math.max(...rects.map((rect) => rect.bottom)) - y;
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
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
