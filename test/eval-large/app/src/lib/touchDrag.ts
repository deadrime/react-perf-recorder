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

function fire(target: Element, type: string, dataTransfer: TouchDataTransfer, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: x },
    clientY: { value: y },
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

/** The element that scrolls sideways under the dragged one, if any: the board on a phone. */
function sideScroller(from: Element): HTMLElement | null {
  for (let el = from.parentElement; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return el;
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
    scroller: HTMLElement | null;
    x: number;
    y: number;
    frame: number;
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
      if (drag.over) fire(drag.over, 'dragleave', drag.data, x, y);
      if (over) fire(over, 'dragenter', drag.data, x, y);
      drag.over = over;
    }
    if (over) fire(over, 'dragover', drag.data, x, y);
  };

  // Near an edge of the screen the board scrolls on by itself, so a card reaches a column that is off screen.
  const autoScroll = () => {
    if (!drag) return;
    const { scroller, x } = drag;
    if (scroller) {
      const step = x < EDGE_PX ? -8 : x > innerWidth - EDGE_PX ? 8 : 0;
      if (step) {
        scroller.scrollLeft += step;
        moveTo(drag.x, drag.y);
      }
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
      opacity: '0.9',
      boxShadow: '0 12px 32px rgba(0,0,0,.5)',
    });
    document.body.appendChild(ghost);
    const data = new TouchDataTransfer();
    fire(source, 'dragstart', data, x, y);
    source.style.opacity = '0.4';
    navigator.vibrate?.(10);
    const scroller = sideScroller(source);
    // Scroll snapping would pull every small step of the auto-scroll back.
    if (scroller) scroller.style.scrollSnapType = 'none';
    drag = { source, ghost, data, over: null, scroller, x, y, frame: 0 };
    moveTo(x, y);
    drag.frame = requestAnimationFrame(autoScroll);
  };

  const finish = (drop: boolean) => {
    if (!drag) return;
    const { source, ghost, data, over, scroller, x, y, frame } = drag;
    cancelAnimationFrame(frame);
    if (over) {
      // A drop counts only where the last dragover was accepted, as a browser does it.
      const accepted = fire(over, 'dragover', data, x, y);
      if (drop && accepted) fire(over, 'drop', data, x, y);
      else fire(over, 'dragleave', data, x, y);
    }
    fire(source, 'dragend', data, x, y);
    source.style.opacity = '';
    if (scroller) scroller.style.scrollSnapType = '';
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
