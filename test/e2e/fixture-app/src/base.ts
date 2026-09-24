import { useEffect } from 'react';

/** Where the app is served from: `/` on the dev server, `/react-perf-recorder/` on GitHub Pages. */
export const BASE = import.meta.env.BASE_URL;

/** A path of the app, under its base: `href('basics/memo')`. */
export const href = (path = '') => `${BASE}${path.replace(/^\//, '')}`;

/** The path inside the app, without the base: what the routes and the page's own checks see. */
export const appPath = () => `/${decodeURIComponent(location.pathname).slice(BASE.length)}`;

/** A page with nothing to record — the front page, the docs — keeps the recorder's panel out of the way. */
export function useNoPanel() {
  useEffect(() => {
    const panel = (window as { __REACT_PERF_RECORDER__?: { panel?: { suppress(on: boolean): void } | null } }).__REACT_PERF_RECORDER__?.panel;
    panel?.suppress(true);
    return () => panel?.suppress(false);
  }, []);
}
