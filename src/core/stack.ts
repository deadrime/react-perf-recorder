export interface Frame {
  fn: string;
  url: string;
  line: number;
  column: number;
}

const V8_FRAME = /^\s*at (?:(?:async )?(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

/** A frame's file as the dev server served it: `src/hooks/useCountdown.ts`, without the origin or the query. */
export const servedPath = (url: string) =>
  url
    .replace(/^[a-z]+:\/\/[^/]+/, '')
    .split(/[?#]/)[0]
    .replace(/^\//, '');

export function parseStack(stack: string): Frame[] {
  const frames: Frame[] = [];
  for (const line of stack.split('\n')) {
    const m = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (!m) continue;
    frames.push({ fn: (m[1] ?? '').replace(/^Object\./, '').replace(/ \[as .+\]$/, ''), url: m[2], line: Number(m[3]), column: Number(m[4]) });
  }
  return frames;
}

/** Where this package's own code is served from: a `file:` link is served by its real path, not node_modules. */
const OWN = (() => {
  const url = (parseStack(new Error().stack ?? '')[0]?.url ?? '').split(/[?#]/)[0];
  // The last one: a checkout under ~/src or a monorepo in a src folder has one above the package's own.
  const at = Math.max(url.lastIndexOf('/dist/'), url.lastIndexOf('/src/'));
  return at >= 0 ? [`${url.slice(0, at)}/dist/`, `${url.slice(0, at)}/src/`] : [];
})();

const packageOf = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] ?? '';
};

// A shared chunk has no package: `chunk-XYZ` from esbuild and, set by our plugin, Rolldown. A project's own Rolldown
// names are `[name]-[hash]`: npm names are lower case, so an upper-case letter in the last eight marks a hash.
const SHARED_CHUNK = /^chunk-|-(?=[\w$-]{0,7}[A-Z])[\w$-]{8}$/;

/**
 * The npm package a frame runs in, or null for app code. Pre-bundled deps are `<cacheDir>/deps/<id>.js?v=…` with `/`
 * in the id flattened to `_` (`@tanstack_react-query`); shared chunks (`chunk-XYZ.js`) have no name and give `''`.
 */
export function libraryOf(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  if (OWN.some((prefix) => path.startsWith(prefix))) return 'react-perf-recorder';
  const deps = /\/deps\/([^/]+)\.js$/.exec(path);
  if (deps && (url.includes('?v=') || path.includes('/.vite'))) return SHARED_CHUNK.test(deps[1]) ? '' : packageOf(deps[1].replace(/_/g, '/'));
  const at = path.lastIndexOf('/node_modules/');
  if (at >= 0) return packageOf(path.slice(at + '/node_modules/'.length));
  return null;
}
