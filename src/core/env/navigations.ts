import type { Navigation } from '../../shared/schema';

/** Wraps pushState/replaceState and listens to popstate; a navigation to the same URL still re-renders router subscribers. */
export function trackHistory(now: () => number, onNavigation: (nav: Navigation) => void): () => void {
  const original = { pushState: history.pushState, replaceState: history.replaceState };
  const wrapped: Partial<typeof original> = {};
  const here = () => location.pathname + location.search;
  for (const method of ['pushState', 'replaceState'] as const) {
    const fn = function (this: History, ...args: Parameters<History['pushState']>) {
      const before = here();
      const result = original[method].apply(this, args);
      const url = here();
      onNavigation({ type: method === 'pushState' ? 'push' : 'replace', atMs: Math.round(now()), url, ...(url === before ? { sameUrl: true as const } : {}) });
      return result;
    };
    wrapped[method] = fn;
    history[method] = fn;
  }
  const onPop = () => onNavigation({ type: 'pop', atMs: Math.round(now()), url: here() });
  window.addEventListener('popstate', onPop);
  return () => {
    // Unwrap only if nobody wrapped on top of us since.
    for (const method of ['pushState', 'replaceState'] as const) if (history[method] === wrapped[method]) history[method] = original[method];
    window.removeEventListener('popstate', onPop);
  };
}
