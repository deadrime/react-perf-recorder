import { useSyncExternalStore } from 'react';

// One shared clock per interval: every relative time on the page moves on the same tick.
const clocks = new Map<number, { now: number; listeners: Set<() => void>; timer?: ReturnType<typeof setInterval> }>();

function clock(interval: number) {
  let entry = clocks.get(interval);
  if (!entry) clocks.set(interval, (entry = { now: Date.now(), listeners: new Set() }));
  return entry;
}

function subscribe(interval: number, listener: () => void) {
  const entry = clock(interval);
  entry.listeners.add(listener);
  entry.timer ??= setInterval(() => {
    entry.now = Date.now();
    entry.listeners.forEach((l) => l());
  }, interval);
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) {
      clearInterval(entry.timer);
      entry.timer = undefined;
    }
  };
}

/** The current time, refreshed every `interval` ms. */
export function useNow(interval = 30_000) {
  return useSyncExternalStore(
    (listener) => subscribe(interval, listener),
    () => clock(interval).now
  );
}
