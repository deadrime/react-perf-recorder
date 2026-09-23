let override: Event | undefined;
let restore: (() => void) | null = null;

/** `window.event` answers with the replayed event while one is set, and as the browser's own otherwise. */
function install() {
  if (restore || typeof window === 'undefined') return;
  const own = Object.getOwnPropertyDescriptor(window, 'event');
  if (!own?.get || !own.configurable) return;
  Object.defineProperty(window, 'event', {
    configurable: true,
    enumerable: own.enumerable,
    get: () => override ?? own.get!.call(window),
    set: (value) => own.set?.call(window, value),
  });
  restore = () => Object.defineProperty(window, 'event', own);
}

/**
 * Dispatches an event the way a browser would for a person. A browser runs React's microtasks while the event is
 * still being dispatched, so React sees `window.event` and gives the update — and what its effects set off — the
 * priority of an input. A script's dispatch returns first: React would see no event and schedule the rest later,
 * so a replay would measure a different app. `window.event` is kept until the microtasks have run.
 */
export function dispatchAsUser(target: EventTarget, event: Event) {
  install();
  override = event;
  try {
    target.dispatchEvent(event);
  } finally {
    // A browser keeps the event until every microtask has run — an async validation's chain included. The first
    // task after them is where it ends; it is posted before React's scheduler posts its own, so those see none.
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      if (override === event) override = undefined;
    };
    channel.port2.postMessage(null);
  }
}

/** Puts `window.event` back as the browser defines it. */
export function endReplayedEvents() {
  override = undefined;
  restore?.();
  restore = null;
}
