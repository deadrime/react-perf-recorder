// Phones fire no HTML drag events: a long press on a `draggable` element plays them from touch, so the board's
// drag and drop works as it is written. A short touch still scrolls and taps as usual.

const HOLD_MS = 350;
const MOVE_TOLERANCE = 8;
const EDGE_PX = 48;

class TouchDataTransfer {
  private data = new Map<string, string>();
  dropEffect = 'move';
  effectAllowed = 'all';
  readonly files = [] as unknown as FileList;
  readonly items = [] as unknown as DataTransferItemList;
  get types() {
    return [...this.data.keys()];
  }
  setData(type: string, value: string) {
    this.data.set(type, value);
  }
  getData(type: string) {
    return this.data.get(type) ?? '';
  }
  clearData(type?: string) {
    if (type) this.data.delete(type);
    else this.data.clear();
  }
  setDragImage() {}
}

function fire(target: Element, type: string, dataTransfer: TouchDataTransfer, x: number, y: number, relatedTarget: Element | null = null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: x },
    clientY: { value: y },
    relatedTarget: { value: relatedTarget },
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

const SCROLL_STEP = 8;

/** -1 or 1 when the finger is at an edge the element can still scroll towards, 0 otherwise. */
function towards(at: number, from: number, to: number, scrolled: number, room: number) {
  if (at < from + EDGE_PX && scrolled > 0) return -1;
  if (at > to - EDGE_PX && scrolled < room - 1) return 1;
  return 0;
}

/**
 * What to scroll near an edge: from the element under the finger up to the page, the first one that can still move
 * that way. A column scrolls up and down, the board sideways, as a browser does it for a mouse.
 */
function edgeScroll(from: Element | null, x: number, y: number): { el: Element; left: number; top: number } | null {
  const page = document.scrollingElement ?? document.documentElement;
  for (let el: Element | null = from; el; el = el === page ? null : el.parentElement ?? page) {
    const style = getComputedStyle(el);
    const box = el === page ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : el.getBoundingClientRect();
    const sideways = el === page || /(auto|scroll)/.test(style.overflowX);
    const upDown = el === page || /(auto|scroll)/.test(style.overflowY);
    const dx = sideways ? towards(x, Math.max(box.left, 0), Math.min(box.right, innerWidth), el.scrollLeft, el.scrollWidth - el.clientWidth) : 0;
    const dy = upDown ? towards(y, Math.max(box.top, 0), Math.min(box.bottom, innerHeight), el.scrollTop, el.scrollHeight - el.clientHeight) : 0;
    if (dx || dy) return { el, left: dx * SCROLL_STEP, top: dy * SCROLL_STEP };
  }
  return null;
}

export function enableTouchDrag() {
  let timer = 0;
  let start: { x: number; y: number } | null = null;
  let drag: {
    source: HTMLElement;
    ghost: HTMLElement;
    data: TouchDataTransfer;
    over: Element | null;
    /** Elements scrolled so far, with the scroll snapping they had: snapping would pull every small step back. */
    snapped: Map<HTMLElement, string>;
    x: number;
    y: number;
    frame: number;
    /** A lifted card that has not moved yet doesn't scroll, even when it sits at an edge. */
    moved: boolean;
    origin: { x: number; y: number };
  } | null = null;

  const cancelHold = () => {
    clearTimeout(timer);
    start = null;
  };

  const target = (x: number, y: number) => document.elementFromPoint(x, y);

  const moveTo = (x: number, y: number) => {
    if (!drag) return;
    drag.x = x;
    drag.y = y;
    drag.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(2deg)`;
    const over = target(x, y);
    if (over !== drag.over) {
      if (drag.over) fire(drag.over, 'dragleave', drag.data, x, y, over);
      if (over) fire(over, 'dragenter', drag.data, x, y, drag.over);
      drag.over = over;
    }
    if (over) fire(over, 'dragover', drag.data, x, y);
  };

  // Near an edge the board scrolls on by itself, so a card reaches a column that is off screen, or a slot below the fold.
  const autoScroll = () => {
    if (!drag) return;
    const step = drag.moved ? edgeScroll(drag.over, drag.x, drag.y) : null;
    if (step) {
      const el = step.el as HTMLElement;
      if (!drag.snapped.has(el)) {
        drag.snapped.set(el, el.style.scrollSnapType);
        el.style.scrollSnapType = 'none';
      }
      el.scrollLeft += step.left;
      el.scrollTop += step.top;
      moveTo(drag.x, drag.y);
    }
    drag.frame = requestAnimationFrame(autoScroll);
  };

  const begin = (source: HTMLElement, x: number, y: number) => {
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${rect.width}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '2147483646',
      boxShadow: '0 12px 32px rgba(0,0,0,.5)',
    });
    document.body.appendChild(ghost);
    const data = new TouchDataTransfer();
    fire(source, 'dragstart', data, x, y);
    source.style.opacity = '0.4';
    navigator.vibrate?.(10);
    drag = { source, ghost, data, over: null, snapped: new Map(), x, y, frame: 0, moved: false, origin: { x, y } };
    moveTo(x, y);
    drag.frame = requestAnimationFrame(autoScroll);
  };

  const finish = (drop: boolean) => {
    if (!drag) return;
    const { source, ghost, data, over, snapped, x, y, frame } = drag;
    cancelAnimationFrame(frame);
    if (over) {
      // A drop counts only where the last dragover was accepted, as a browser does it.
      const accepted = fire(over, 'dragover', data, x, y);
      if (drop && accepted) fire(over, 'drop', data, x, y);
      else fire(over, 'dragleave', data, x, y);
    }
    fire(source, 'dragend', data, x, y);
    source.style.opacity = '';
    for (const [el, snap] of snapped) el.style.scrollSnapType = snap;
    ghost.remove();
    drag = null;
    // The lift ends with a tap on the card, which would open it.
    const swallow = (e: Event) => (e.stopPropagation(), e.preventDefault());
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, true), 400);
  };

  addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return cancelHold();
      const source = (e.target as Element).closest?.<HTMLElement>('[draggable="true"]');
      if (!source) return;
      const { clientX: x, clientY: y } = e.touches[0];
      start = { x, y };
      timer = window.setTimeout(() => {
        start = null;
        begin(source, x, y);
      }, HOLD_MS);
    },
    { passive: true }
  );

  addEventListener(
    'touchmove',
    (e) => {
      const touch = e.touches[0];
      if (drag) {
        e.preventDefault();
        drag.moved ||= Math.hypot(touch.clientX - drag.origin.x, touch.clientY - drag.origin.y) > MOVE_TOLERANCE;
        moveTo(touch.clientX, touch.clientY);
      } else if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > MOVE_TOLERANCE) cancelHold();
    },
    { passive: false }
  );

  addEventListener('touchend', () => (drag ? finish(true) : cancelHold()));
  addEventListener('touchcancel', () => (drag ? finish(false) : cancelHold()));
  // A long press opens the page's context menu on Android: not while a card is lifted.
  addEventListener('contextmenu', (e) => {
    if (drag || (e.target as Element).closest?.('[draggable="true"]')) e.preventDefault();
  });
}
