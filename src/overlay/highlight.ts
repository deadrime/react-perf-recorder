import type { Fiber } from '../core/fiber';
import type { HighlightSink } from '../core/recorder';

interface Flash {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  count: number;
  wasted: boolean;
  start: number;
}

const FADE_MS = 500;
const MAX_FLASHES = 300;

const colorOf = (count: number, wasted: boolean) => {
  if (wasted) return [150, 150, 160];
  if (count < 3) return [52, 199, 89];
  if (count < 10) return [255, 204, 0];
  return [255, 69, 58];
};

/**
 * Outlines of rendered components, like react-scan: one canvas, rectangles read through IntersectionObserver (no
 * forced layout), a fade, and `Name ×N` for the instance's render count. Grey — the render changed nothing in the DOM.
 */
export class Highlighter implements HighlightSink {
  enabled = true;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private pending = new Map<Element, { name: string; count: number; wasted: boolean }>();
  private readonly counts = new WeakMap<Fiber, number>();
  private flashes: Flash[] = [];
  private frameRequested = false;
  private drawing = false;

  constructor(parent: ShadowRoot | Element) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '2147483646' });
    this.canvas.setAttribute('data-rpr', 'highlight');
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  reset() {
    this.pending.clear();
    this.flashes = [];
    this.clear();
  }

  flash(pairs: Array<[Element, string, Fiber]>, withoutDom: Set<Fiber>) {
    if (!this.enabled || !this.ctx) return;
    for (const [el, name, fiber] of pairs) {
      const count = Math.max(this.counts.get(fiber) ?? 0, fiber.alternate ? this.counts.get(fiber.alternate) ?? 0 : 0) + 1;
      this.counts.set(fiber, count);
      if (fiber.alternate) this.counts.set(fiber.alternate, count);
      const known = this.pending.get(el);
      this.pending.set(el, {
        name: known?.name ?? name,
        count: Math.max(count, known?.count ?? 0),
        wasted: withoutDom.has(fiber) && (known?.wasted ?? true),
      });
    }
    if (!this.frameRequested) {
      this.frameRequested = true;
      requestAnimationFrame(() => this.measure());
    }
  }

  private measure() {
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
        if (!info || (!r.width && !r.height)) continue;
        this.flashes.push({ x: r.left, y: r.top, w: r.width, h: r.height, ...info, start: now });
      }
      if (this.flashes.length > MAX_FLASHES) this.flashes.splice(0, this.flashes.length - MAX_FLASHES);
      if (!this.drawing) {
        this.drawing = true;
        requestAnimationFrame(() => this.draw());
      }
    });
    targets.forEach((el) => observer.observe(el));
  }

  private draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => now - f.start < FADE_MS);
    this.clear();
    const labelled = new Set<string>();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const f of this.flashes) {
      const alpha = 1 - (now - f.start) / FADE_MS;
      const [r, g, b] = colorOf(f.count, f.wasted);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(f.x + 0.5, f.y + 0.5, Math.max(0, f.w - 1), Math.max(0, f.h - 1));
      const label = `${f.name} ×${f.count}`;
      const at = `${Math.round(f.x)}:${Math.round(f.y)}`;
      if (labelled.size < 60 && !labelled.has(at) && f.w > 24) {
        labelled.add(at);
        const width = ctx.measureText(label).width + 6;
        const y = f.y > 14 ? f.y - 14 : f.y;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.9})`;
        ctx.fillRect(f.x, y, width, 14);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillText(label, f.x + 3, y + 11);
      }
    }
    if (this.flashes.length) requestAnimationFrame(() => this.draw());
    else this.drawing = false;
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
