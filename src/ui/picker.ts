import { nearestHosts } from '../core/fiber';
import type { Engine, Owner } from '../core/engine';

export interface PickerCallbacks {
  /** Renders the owner list inside the panel; `select` confirms an item. */
  showOwners(owners: Owner[], active: number, select: (index: number) => void, hover: (index: number) => void): void;
  done(owner: Owner | null): void;
}

const BLOCKED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu'];

/**
 * Picks the area to record, like the react-scan inspector: hover highlights the element and its component, a click
 * freezes it and lists the composite owners, ↑/↓ choose the level, Enter confirms, Esc cancels.
 */
export class Picker {
  active = false;
  private box: HTMLDivElement;
  private tag: HTMLDivElement;
  private owners: Owner[] = [];
  private index = 0;
  private frozen = false;
  private listeners: Array<[string, EventListener]> = [];

  constructor(
    private shadow: ShadowRoot,
    private host: Element,
    private engine: Engine,
    private showWrappers: () => boolean,
    private callbacks: PickerCallbacks
  ) {
    this.box = document.createElement('div');
    this.box.className = 'box';
    this.box.hidden = true;
    this.tag = document.createElement('div');
    this.tag.className = 'tag';
    this.box.appendChild(this.tag);
    this.shadow.appendChild(this.box);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.frozen = false;
    const on = (type: string, handler: (event: Event) => void) => {
      const listener = (event: Event) => handler(event);
      window.addEventListener(type, listener, { capture: true });
      this.listeners.push([type, listener]);
    };
    on('pointermove', (e) => this.onMove(e as PointerEvent));
    for (const type of BLOCKED) on(type, (e) => this.onPress(e as MouseEvent));
    on('keydown', (e) => this.onKey(e as KeyboardEvent));
  }

  cancel() {
    this.finish(null);
  }

  refresh() {
    if (this.frozen) this.render();
  }

  private finish(owner: Owner | null) {
    if (!this.active) return;
    this.active = false;
    for (const [type, listener] of this.listeners) window.removeEventListener(type, listener, { capture: true });
    this.listeners = [];
    this.box.hidden = true;
    this.callbacks.done(owner);
  }

  private isOwn(event: Event) {
    return event.composedPath().includes(this.host);
  }

  private elementAt(x: number, y: number): Element | null {
    return document.elementsFromPoint(x, y).find((el) => el !== this.host && !this.host.contains(el) && el !== document.documentElement) ?? null;
  }

  private onMove(event: PointerEvent) {
    if (this.frozen || this.isOwn(event)) return;
    const el = this.elementAt(event.clientX, event.clientY);
    if (!el) return;
    const owner = this.engine.owners(el).find((o) => !o.wrapper);
    this.drawBox([el.getBoundingClientRect()], owner ? owner.name : el.tagName.toLowerCase());
  }

  private onPress(event: MouseEvent) {
    if (this.isOwn(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click' || this.frozen) return;
    const el = this.elementAt(event.clientX, event.clientY);
    if (!el) return;
    const owners = this.engine.owners(el);
    if (!owners.length) return;
    this.owners = owners;
    this.frozen = true;
    this.index = Math.max(
      0,
      this.visible().findIndex((o) => !o.wrapper)
    );
    this.render();
  }

  private onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.finish(null);
      return;
    }
    if (!this.frozen) return;
    if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    const list = this.visible();
    if (event.key === 'ArrowDown') this.index = Math.min(list.length - 1, this.index + 1);
    else if (event.key === 'ArrowUp') this.index = Math.max(0, this.index - 1);
    else if (event.key === 'Enter') return this.finish(list[this.index] ?? null);
    else return;
    this.render();
  }

  private visible() {
    return this.showWrappers() ? this.owners : this.owners.filter((o) => !o.wrapper);
  }

  private render() {
    const list = this.visible();
    this.index = Math.min(this.index, Math.max(0, list.length - 1));
    this.callbacks.showOwners(
      list,
      this.index,
      (i) => this.finish(list[i] ?? null),
      (i) => {
        this.index = i;
        this.highlightOwner(list[i]);
      }
    );
    this.highlightOwner(list[this.index]);
  }

  private highlightOwner(owner: Owner | undefined) {
    if (!owner) return;
    const rects = nearestHosts(owner.fiber, 200).map((el) => el.getBoundingClientRect());
    this.drawBox(rects, owner.name);
  }

  private drawBox(rects: DOMRect[], label: string) {
    const visible = rects.filter((r) => r.width || r.height);
    if (!visible.length) {
      this.box.hidden = true;
      return;
    }
    const left = Math.min(...visible.map((r) => r.left));
    const top = Math.min(...visible.map((r) => r.top));
    const right = Math.max(...visible.map((r) => r.right));
    const bottom = Math.max(...visible.map((r) => r.bottom));
    Object.assign(this.box.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    this.tag.textContent = label;
    this.box.hidden = false;
  }
}
