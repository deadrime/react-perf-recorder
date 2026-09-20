import { createStore } from 'zustand/vanilla';

/**
 * One clock for the whole page: every relative time reads it. A timer per message would be the other way to do it,
 * and a much worse one — this is the shape apps actually use.
 */
export const clockStore = createStore(() => ({ now: Date.now() }));

setInterval(() => clockStore.setState({ now: Date.now() }), 1000);

export function timeAgo(now: number, sentAt: number): string {
  const seconds = Math.max(0, Math.round((now - sentAt) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 45) return 'a few seconds ago';
  if (seconds < 90) return 'a minute ago';
  const mins = Math.round(seconds / 60);
  return mins < 60 ? `${mins} minutes ago` : `${Math.round(mins / 60)} hours ago`;
}
