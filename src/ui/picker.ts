import { nearestHosts, type Fiber } from '../core/fiber';
import type { Engine, Owner, Shown } from '../core/engine';

export interface TreeRow {
  owner: Owner;
  depth: number;
  /** `null`: opened and nothing below. */
  toggle: 'open' | 'closed' | null;
}

export interface TreeActions {
  select(index: number): void;
  hover(index: number): void;
  toggle(index: number): void;
  leave(): void;
  /** The row above the app's components: the whole app as the area, and the tree closes on it. */
  wholeApp(): void;
}

export interface PickerCallbacks {
  /** Renders the component tree inside the panel; `active` is -1 while the whole app is the one chosen. */
  showTree(rows: TreeRow[], active: number, actions: TreeActions): void;
  /** The active component is the area right away; moving in the tree moves the area with it. `null`: the whole app. */
  preview(owner: Owner | null): void;
  /** `null`: cancelled, the area goes back to what it was. */
  done(choice: Owner | 'whole-app' | null): void;
}

interface Node {
  owner: Owner;
  parent: Node | null;
  children: Node[];
  /** Children are all listed; a path node starts with only the next step of the path. */
  full: boolean;
  open: boolean;
}

const BLOCKED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu'];
const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
const sameFiber = (a: Fiber, b: Fiber) => a === b || a.alternate === b;

/**
 * Picks the area to record, like the react-scan inspector: hover outlines the element and its component, a click
 * takes it as the area and opens the tree around it. ↑/↓ move the area, → goes inside, ← goes up, Enter or a click
 * on a row confirms, Esc puts the old area back; a click elsewhere on the page picks again.
 */
export class Picker {
  active = false;
  private box: HTMLDivElement;
  private tag: HTMLDivElement;
  private root: Node | null = null;
  private current: Node | null = null;
  private previewed: Node | null = null;
  /** The next row the tree lands on is shown, not taken as the area. */
  private quietOpen = false;
  /**
   * The tree of the whole app is open and nothing has been chosen yet: the page still answers the pointer with the
   * box a click would take, as it does before any tree is open, and the keys already move through the tree.
   */
  private browsing = false;
  private frozen = false;
  private listeners: Array<[string, EventListener]> = [];
  /** What the box is drawn around, so it can be measured again when the page scrolls under it. */
  private shown: { fiber: Fiber; label: string } | null = null;

  constructor(
    private shadow: ShadowRoot,
    private host: Element,
    private engine: Engine,
    private filters: () => Shown,
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

  get activeOwner(): Owner | null {
    return this.current?.owner ?? null;
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
    // The box is positioned in viewport coordinates: scrolling or resizing moves the element under it.
    on('scroll', () => this.redraw());
    on('resize', () => this.redraw());
  }

  private redraw() {
    if (this.shown && !this.box.hidden) this.outline(this.shown.fiber, this.shown.label);
  }

  /**
   * Opens the tree on a component, e.g. the current area, to move from it instead of picking anew. `quiet` opens it
   * without taking that component as the area: the tree of the whole app starts at its top, and the whole app stays
   * the area until a row, a key or a click on the page says otherwise.
   */
  startAt(fiber: Fiber, { quiet = false }: { quiet?: boolean } = {}) {
    this.start();
    this.quietOpen = quiet;
    this.build(this.engine.ownersOfFiber(fiber), fiber);
  }

  cancel() {
    this.finish(null);
  }

  /**
   * The whole app becomes the area and the tree stays open on it: its row above the components is the active one,
   * the page answers the pointer again, and the next key goes back into the tree from its top.
   */
  /** False when there is no tree to stay open on: the picker is still waiting for a click on the page. */
  release(): boolean {
    if (!this.active || !this.root) return false;
    this.current = this.previewed = this.root;
    this.quietOpen = false;
    this.browsing = true;
    this.box.hidden = true;
    this.shown = null;
    this.callbacks.preview(null);
    this.render();
    return true;
  }

  /** A filter was switched: rebuild the path around the active component. */
  refresh() {
    if (this.frozen && this.current) this.build(this.engine.ownersOfFiber(this.current.owner.fiber), this.current.owner.fiber);
  }

  outline(fiber: Fiber, label: string) {
    this.shown = { fiber, label };
    this.drawBox(
      nearestHosts(fiber, 200).map((el) => el.getBoundingClientRect()),
      label
    );
  }

  hideOutline() {
    if (this.active && this.current && !this.browsing) this.outline(this.current.owner.fiber, this.current.owner.name);
    else {
      this.box.hidden = true;
      this.shown = null;
    }
  }

  private finish(owner: Owner | 'whole-app' | null) {
    if (!this.active) return;
    this.active = false;
    for (const [type, listener] of this.listeners) window.removeEventListener(type, listener, { capture: true });
    this.listeners = [];
    this.box.hidden = true;
    this.shown = null;
    this.root = this.current = this.previewed = null;
    this.quietOpen = this.browsing = false;
    this.callbacks.done(owner);
  }

  private isOwn(event: Event) {
    return event.composedPath().includes(this.host);
  }

  private elementAt(x: number, y: number): Element | null {
    return document.elementsFromPoint(x, y).find((el) => el !== this.host && !this.host.contains(el) && el !== document.documentElement) ?? null;
  }

  private onMove(event: PointerEvent) {
    if ((this.frozen && !this.browsing) || this.isOwn(event)) return;
    const el = this.elementAt(event.clientX, event.clientY);
    if (!el) return;
    const owner = this.engine.owners(el).find((o) => !this.engine.hidden(o, this.filters()));
    // The box a click would leave, not the element under the cursor: hovering is the preview of the choice.
    if (owner) return this.outline(owner.fiber, owner.name);
    this.shown = null;
    this.drawBox([el.getBoundingClientRect()], el.tagName.toLowerCase());
  }

  private onPress(event: MouseEvent) {
    if (this.isOwn(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click') return;
    const el = this.elementAt(event.clientX, event.clientY);
    const owners = el ? this.engine.owners(el) : [];
    if (owners.length) this.build(owners, null);
  }

  private onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.finish(null);
      return;
    }
    if (!this.frozen || !this.current || !KEYS.includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const rows = this.rows();
    const at = rows.findIndex((r) => r.node === this.current);
    const node = this.current;
    if (this.browsing) {
      // The whole app is active: Enter keeps it, any other key steps into the tree at its top.
      if (event.key === 'Enter') return this.finish('whole-app');
      this.previewed = null;
      return this.render();
    }
    if (event.key === 'Enter') return this.finish(node.owner);
    if (event.key === 'ArrowUp' && at === 0) return this.release();
    if (event.key === 'ArrowDown') this.current = rows[Math.min(rows.length - 1, at + 1)].node;
    else if (event.key === 'ArrowUp') this.current = rows[Math.max(0, at - 1)].node;
    else if (event.key === 'ArrowRight') {
      if (!node.open) this.expand(node);
      else if (node.children.length) this.current = node.children[0];
    } else if (node.open && node.children.length) node.open = false;
    else if (node.parent) this.current = node.parent;
    this.render();
  }

  /** `owners` nearest first; the tree shows them from the app root down, the focus (or the nearest component) active. */
  private build(owners: Owner[], focus: Fiber | null) {
    const shown = this.filters();
    const path = owners.filter((o) => !this.engine.hidden(o, shown) || (focus && sameFiber(o.fiber, focus))).reverse();
    if (!path.length) return;
    let parent: Node | null = null;
    this.root = null;
    const nodes: Node[] = [];
    for (const owner of path) {
      const node: Node = { owner, parent, children: [], full: false, open: true };
      if (parent) parent.children.push(node);
      else this.root = node;
      nodes.push(node);
      parent = node;
    }
    nodes[nodes.length - 1].open = false;
    const target = focus
      ? nodes.find((n) => sameFiber(n.owner.fiber, focus))
      : [...nodes].reverse().find((n) => !this.engine.hidden(n.owner, shown));
    this.current = target ?? nodes[nodes.length - 1];
    this.frozen = true;
    // The neighbourhood of the picked component, not just the path to it: its siblings and what is inside it.
    if (this.current.parent) this.expand(this.current.parent);
    this.expand(this.current);
    this.render();
  }

  /** Lists every component below the node; the path step already there keeps its place and its open children. */
  private fill(node: Node) {
    if (node.full) return;
    const kept = node.children;
    node.children = this.engine
      .childOwners(node.owner.fiber, this.filters())
      .map((owner) => kept.find((k) => sameFiber(k.owner.fiber, owner.fiber)) ?? { owner, parent: node, children: [], full: false, open: false });
    // The next step of the path can sit under a wrapper that the walk passed: keep it listed.
    for (const k of kept) if (!node.children.includes(k)) node.children.push(k);
    node.full = true;
  }

  private expand(node: Node) {
    this.fill(node);
    node.open = true;
  }

  private rows(): Array<{ node: Node; depth: number }> {
    const out: Array<{ node: Node; depth: number }> = [];
    const walk = (node: Node, depth: number) => {
      // A closed row is filled to know whether it has anything inside: an arrow that opens nothing is a dead end.
      if (!node.open) this.fill(node);
      out.push({ node, depth });
      if (node.open) for (const child of node.children) walk(child, depth + 1);
    };
    if (this.root) walk(this.root, 0);
    return out;
  }

  private render() {
    const rows = this.rows();
    if (this.current && this.current !== this.previewed) {
      this.previewed = this.current;
      if (this.quietOpen) {
        this.quietOpen = false;
        this.browsing = true;
      } else {
        this.browsing = false;
        this.callbacks.preview(this.current.owner);
      }
    }
    const active = this.browsing
      ? -1
      : Math.max(
          0,
          rows.findIndex((r) => r.node === this.current)
        );
    this.callbacks.showTree(
      rows.map(({ node, depth }) => ({
        owner: node.owner,
        depth,
        toggle: node.children.length ? (node.open ? 'open' : 'closed') : null,
      })),
      active,
      {
        select: (i) => this.finish(rows[i]?.node.owner ?? null),
        hover: (i) => rows[i] && this.outline(rows[i].node.owner.fiber, rows[i].node.owner.name),
        toggle: (i) => {
          const node = rows[i]?.node;
          if (!node || !node.children.length) return;
          if (node.open) node.open = false;
          else this.expand(node);
          // Closing can hide the area's row; then the row that was closed takes its place.
          if (!this.rows().some((r) => r.node === this.current)) this.current = node;
          this.render();
        },
        leave: () => this.hideOutline(),
        wholeApp: () => this.finish('whole-app'),
      }
    );
    if (this.current && !this.browsing) this.outline(this.current.owner.fiber, this.current.owner.name);
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
