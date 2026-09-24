import type { ActionKind, ActionRecord, ActionTarget } from '../shared/schema';
import { fiberFromNode, generatedSourceOf, isLibraryFiber, isProvider, nameOf, sourceOf, wrapsProvider, type Fiber } from './fiber';

export interface ActionOptions {
  /** Record typed values; off by default — only the length is kept. */
  values: boolean;
  /** Fields that are never recorded, value or length, in addition to passwords and one-time codes. */
  secretSelector: string;
  wrapperPattern: RegExp;
  projectRoot: string;
  /** Our own UI; events inside it are not actions. */
  ownHost: Element | null;
  inScope(el: Element): boolean | undefined;
}

const KEYS = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
const SECRET_AUTOCOMPLETE = /(password|one-time-code|cc-number|cc-csc|cc-exp)/;
const TEXT_INPUT = /^(text|search|email|tel|url|number|password|)$/;
const TYPING_GAP_MS = 1500;
const SCROLL_GAP_MS = 300;
const INTERACTIVE =
  'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], label, input, select, textarea, summary, [data-testid]';

/**
 * The first words of an element, read text node by text node until there are enough: `textContent` of a page-sized
 * element builds the whole page as a string, in a listener that runs before the app's own. The page itself has none.
 */
function shortText(el: Element, max: number): string {
  const doc = el.ownerDocument;
  if (el === doc.body || el === doc.documentElement) return '';
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let node = walker.nextNode(); node && text.length < max * 2; node = walker.nextNode()) text += ` ${node.nodeValue ?? ''}`;
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

// An element of a same-origin frame belongs to that frame's realm: `instanceof HTMLInputElement` of the page is false
// for it, so elements are told apart by what they are, not by whose constructor made them.
const isElement = (value: unknown): value is Element => (value as Node | null)?.nodeType === 1;
const isInput = (el: Element): el is HTMLInputElement => el.tagName === 'INPUT';
const isFormField = (el: Element) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';

export function isSecretField(el: Element, secretSelector: string): boolean {
  if (secretSelector && el.matches(secretSelector)) return true;
  if (isInput(el) && el.type === 'password') return true;
  return SECRET_AUTOCOMPLETE.test(el.getAttribute('autocomplete') ?? '');
}

/** How far the pointer goes with the button held before a press is a drag, not a click. */
const DRAG_PX = 8;
const DRAG_CLICK_MS = 50;
const DRAGGABLE = '[draggable="true"], [aria-roledescription="sortable"], [data-testid], [role="slider"], button, [role="button"]';

const isTextField = (el: Element): el is HTMLInputElement | HTMLTextAreaElement =>
  el.tagName === 'TEXTAREA' || (isInput(el) && TEXT_INPUT.test(el.type));

export class ActionTracker {
  readonly actions: ActionRecord[] = [];
  private nextId = 1;
  private typing: { el: Element; action: ActionRecord } | null = null;
  private scrolling = new Map<EventTarget, { action: ActionRecord; timer: ReturnType<typeof setTimeout> }>();
  private pointer: { el: Element; x: number; y: number; lastX: number; lastY: number; action: ActionRecord | null } | null = null;
  /** A drag's release ends in a click on the same element; the drag was the action, not the click. */
  private draggedUntil = -Infinity;
  private listeners: Array<[Window, string, EventListener]> = [];
  private handlers: Array<[string, EventListener]> = [];
  private frames: MutationObserver | null = null;
  private watched = new WeakSet<HTMLIFrameElement>();

  constructor(private options: ActionOptions, private now: () => number, private emit: (action: ActionRecord) => void) {}

  start() {
    const on = (type: string, handler: (event: Event) => void) => {
      const listener = (event: Event) => {
        if (this.isOwn(event)) return;
        try {
          handler(event);
        } catch {
          // A broken description must never break the app's own handlers.
        }
      };
      this.handlers.push([type, listener]);
    };
    on('input', (e) => this.onInput(e));
    on('change', (e) => this.onChange(e));
    on('click', (e) => this.onClick(e));
    on('keydown', (e) => this.onKey(e as KeyboardEvent));
    on('submit', (e) => this.push('submit', e.target as Element));
    on('scroll', (e) => this.onScroll(e));
    on('pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    on('pointermove', (e) => this.onPointerMove(e as PointerEvent));
    on('pointerup', () => this.endDrag());
    on('pointercancel', () => this.endDrag());
    this.listen(window);
    // A form in a same-origin frame (a playground, an editor's preview) is the person's too: its window is listened
    // to as the page's is, again after each load of the frame, which brings a new window.
    this.watchFrames(document);
    this.frames = new MutationObserver((records) => {
      for (const r of records)
        for (const node of r.addedNodes) if (isElement(node) && (node.tagName === 'IFRAME' || node.querySelector('iframe'))) this.watchFrames(node);
    });
    this.frames.observe(document, { childList: true, subtree: true });
  }

  private listen(win: Window) {
    if (this.listeners.some(([w]) => w === win)) return;
    for (const [type, listener] of this.handlers) {
      win.addEventListener(type, listener, { capture: true, passive: true });
      this.listeners.push([win, type, listener]);
    }
  }

  private watchFrames(root: ParentNode) {
    const frames = isElement(root) && root.tagName === 'IFRAME' ? [root as HTMLIFrameElement] : root.querySelectorAll('iframe');
    for (const frame of frames) {
      const attach = () => {
        try {
          const win = frame.contentWindow;
          // Reading the document throws for another origin: nothing there is the app's.
          if (win?.document) this.listen(win);
        } catch {
          // Cross-origin: not followed.
        }
      };
      attach();
      if (this.watched.has(frame)) continue;
      this.watched.add(frame);
      frame.addEventListener('load', attach);
    }
  }

  /** Called by the navigation tracker: back and forward are user actions, push and replace are consequences. */
  navigation(url: string) {
    this.flushTyping();
    this.record({ id: this.nextId++, kind: 'navigation', atMs: Math.round(this.now()), endMs: Math.round(this.now()), url });
  }

  stop() {
    for (const [win, type, listener] of this.listeners) win.removeEventListener(type, listener, { capture: true });
    this.listeners = [];
    this.handlers = [];
    this.frames?.disconnect();
    this.frames = null;
    this.flushTyping();
    this.endDrag();
    for (const [target, pending] of this.scrolling) {
      clearTimeout(pending.timer);
      this.scrolling.delete(target);
      this.recordScroll(pending.action);
    }
  }

  describe(el: Element, event?: Event): ActionTarget {
    const target: ActionTarget = { tag: el.tagName.toLowerCase() };
    const testId = el.closest('[data-testid]');
    if (testId && (testId === el || testId.contains(el))) target.testId = testId.getAttribute('data-testid') ?? undefined;
    const name = el.getAttribute('name');
    if (name) target.name = name;
    const label = el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? undefined;
    if (label) target.label = label.slice(0, 60);
    const role = el.getAttribute('role');
    if (role) target.role = role;
    if (!isFormField(el)) {
      const text = shortText(el, 40);
      if (text) target.text = text;
    }
    const id = el.getAttribute('id');
    if (id) target.id = id;
    const href = el.getAttribute('href');
    if (href) target.href = href.slice(0, 200);
    if (el.hasAttribute('disabled')) target.disabled = true;
    if (isInput(el) && (el.type === 'checkbox' || el.type === 'radio')) target.checked = el.checked;
    // Which one it is, not just what it is: a page has many «Add» buttons and only one of them was clicked.
    const selector = this.selectorOf(el);
    if (selector) {
      target.selector = selector;
      const like = el.ownerDocument.querySelectorAll(selector);
      if (like.length > 1) target.nth = [...like].indexOf(el);
    }
    const box = el.getBoundingClientRect();
    if (box.width || box.height) {
      target.box = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
    }
    const pointer = event as MouseEvent | undefined;
    if (pointer && typeof pointer.clientX === 'number' && (pointer.clientX || pointer.clientY)) {
      target.point = { x: Math.round(pointer.clientX), y: Math.round(pointer.clientY) };
    }
    const owner = this.ownerOf(el);
    if (owner) {
      target.component = nameOf(owner) ?? undefined;
      const source = sourceOf(owner, this.options.projectRoot);
      if (source) target.source = source;
      const generated = generatedSourceOf(owner);
      if (generated) target.generatedSource = generated;
      const path = this.pathOf(owner);
      if (path.length) target.path = path;
    }
    const inScope = this.options.inScope(el);
    if (inScope !== undefined) target.inScope = inScope;
    return target;
  }

  /** `[data-testid="send"]`, `#amount`, `button[name="save"]`: enough to find the element again. */
  private selectorOf(el: Element): string | undefined {
    const tag = el.tagName.toLowerCase();
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const id = el.getAttribute('id');
    if (id) return `#${CSS.escape(id)}`;
    const own = ['name', 'role', 'aria-label', 'type', 'href'].map((attr) => [attr, el.getAttribute(attr)] as const).find(([, value]) => value);
    const self = own ? `${tag}[${own[0]}="${CSS.escape(own[1]!)}"]` : tag;
    // Inside the nearest thing that has a test id, so a row's button is not every row's button.
    const anchor = el.parentElement?.closest('[data-testid]');
    const inside = anchor?.getAttribute('data-testid');
    return inside ? `[data-testid="${CSS.escape(inside)}"] ${self}` : self;
  }

  /** The component that rendered the element: the first with a name of its own, wrappers and providers skipped. */
  private ownerOf(el: Element): Fiber | null {
    for (let f = fiberFromNode(el); f; f = f.return) {
      const name = nameOf(f);
      if (name && !isProvider(name) && !this.options.wrapperPattern.test(name)) return f;
    }
    return null;
  }

  /** The app's components above the one that rendered the element, nearest last: `Layout › Chat › MessageRow`. */
  private pathOf(owner: Fiber): string[] {
    const path: string[] = [];
    for (let f: Fiber | null = owner.return; f && path.length < 4; f = f.return) {
      const name = nameOf(f);
      if (!name || isProvider(name) || this.options.wrapperPattern.test(name) || isLibraryFiber(f) || wrapsProvider(f)) continue;
      path.push(name);
    }
    return path.reverse();
  }

  private isOwn(event: Event) {
    const host = this.options.ownHost;
    return Boolean(host && event.composedPath().includes(host));
  }

  private record(action: ActionRecord) {
    if (this.actions.length >= 5000) return;
    this.actions.push(action);
    this.emit(action);
  }

  private push(kind: ActionKind, el: Element | null, extra: Partial<ActionRecord> = {}, event?: Event) {
    if (!el) return;
    this.flushTyping();
    const at = Math.round(this.now());
    this.record({ id: this.nextId++, kind, atMs: at, endMs: at, target: this.describe(el, event), ...extra });
  }

  private valueFields(el: Element): Partial<ActionRecord> {
    if (isSecretField(el, this.options.secretSelector)) return { secret: true };
    const value = (el as HTMLInputElement).value ?? '';
    return { length: value.length, ...(this.options.values ? { value: value.slice(0, 200) } : {}) };
  }

  private onInput(event: Event) {
    const el = event.target as Element;
    // Checkboxes, radios and selects fire `input` too: they are recorded by their click or change, not as typing.
    if (!isElement(el) || !(isTextField(el) || (el as HTMLElement).isContentEditable)) return;
    const now = Math.round(this.now());
    if (this.typing && this.typing.el === el && now - this.typing.action.endMs < TYPING_GAP_MS) {
      const action = this.typing.action;
      action.chars = (action.chars ?? 0) + 1;
      action.endMs = now;
      Object.assign(action, this.valueFields(el));
      return;
    }
    this.flushTyping();
    this.typing = {
      el,
      action: { id: this.nextId++, kind: 'typing', atMs: now, endMs: now, target: this.describe(el), chars: 1, ...this.valueFields(el) },
    };
  }

  private onChange(event: Event) {
    const el = event.target as Element;
    // Text fields fire change on blur after the input events already recorded as typing.
    if (!isElement(el) || isTextField(el)) return;
    const extra: Partial<ActionRecord> = isSecretField(el, this.options.secretSelector)
      ? { secret: true }
      : this.options.values
      ? {
          value: isInput(el) && /checkbox|radio/.test(el.type) ? String(el.checked) : String((el as HTMLSelectElement).value ?? '').slice(0, 200),
        }
      : {};
    this.push('change', el, extra);
  }

  private onClick(event: Event) {
    if (this.now() - this.draggedUntil < DRAG_CLICK_MS) return;
    const el = isElement(event.target) ? event.target : null;
    this.push('click', el?.closest(INTERACTIVE) ?? el, {}, event);
  }

  private onKey(event: KeyboardEvent) {
    if (!KEYS.has(event.key) || event.repeat) return;
    const el = isElement(event.target) ? event.target : document.activeElement;
    this.push('key', el ?? document.body, { key: event.key });
  }

  private onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !isElement(event.target)) return;
    this.pointer = { el: event.target, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, action: null };
  }

  private onPointerMove(event: PointerEvent) {
    const p = this.pointer;
    if (!p || !(event.buttons & 1)) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    if (!p.action) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      this.flushTyping();
      const at = Math.round(this.now());
      const el = p.el.closest(DRAGGABLE) ?? p.el;
      p.action = { id: this.nextId++, kind: 'drag', atMs: at, endMs: at, target: this.describe(el), drag: { dx: 0, dy: 0, pixels: 0 } };
    }
    const drag = p.action.drag!;
    drag.pixels += Math.round(Math.hypot(event.clientX - p.lastX, event.clientY - p.lastY));
    drag.dx = Math.round(dx);
    drag.dy = Math.round(dy);
    p.action.endMs = Math.round(this.now());
    p.lastX = event.clientX;
    p.lastY = event.clientY;
  }

  private endDrag() {
    const action = this.pointer?.action;
    this.pointer = null;
    if (!action) return;
    this.draggedUntil = this.now();
    this.record(action);
  }

  /** `left` is kept only for an element that moved sideways: most scroll up and down alone. */
  private recordScroll(action: ActionRecord) {
    if (action.scroll?.left && action.scroll.left.from === action.scroll.left.to) delete action.scroll.left;
    this.record(action);
  }

  private onScroll(event: Event) {
    const target = event.target;
    const el = (target as Node | null)?.nodeType === 9 ? (target as Document).scrollingElement : target;
    if (!isElement(el)) return;
    const top = Math.round(el.scrollTop);
    const left = Math.round(el.scrollLeft);
    const now = Math.round(this.now());
    const pending = this.scrolling.get(target!);
    if (pending) {
      clearTimeout(pending.timer);
      const scroll = pending.action.scroll!;
      // A board or a carousel moves sideways: counted too, or its scroll reads 0px.
      scroll.pixels += Math.abs(top - scroll.to) + Math.abs(left - scroll.left!.to);
      scroll.to = top;
      scroll.left!.to = left;
      pending.action.endMs = now;
    }
    const entry = pending ?? {
      action: {
        id: this.nextId++,
        kind: 'scroll' as const,
        atMs: now,
        endMs: now,
        target: this.describe(el),
        scroll: { from: top, to: top, pixels: 0, left: { from: left, to: left } },
      },
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
    };
    entry.timer = setTimeout(() => {
      this.scrolling.delete(target!);
      this.recordScroll(entry.action);
    }, SCROLL_GAP_MS);
    this.scrolling.set(target!, entry);
  }

  private flushTyping() {
    if (!this.typing) return;
    this.record(this.typing.action);
    this.typing = null;
  }
}
