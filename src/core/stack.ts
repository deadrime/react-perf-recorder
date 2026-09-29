import { SCRIPTS_KEY, type ScriptSources } from '../shared/inject';

export interface Frame {
  fn: string;
  url: string;
  line: number;
  column: number;
}

const V8_FRAME = /^\s*at (?:(?:async )?(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

/**
 * The source file a line of a bundled script came from, when the source map was read for it: a chunk holds many
 * modules, the app's and the packages', and its url says nothing of which. `''`: the bundler's own code.
 */
export function sourceAt(url: string, line?: number): string | undefined {
  const tables = (globalThis as Record<string, unknown>)[SCRIPTS_KEY] as Record<string, ScriptSources> | undefined;
  const table = tables?.[url.split(/[?#]/)[0]];
  if (!table) return undefined;
  // A script of one source, every line of it.
  if (!table.l.length) return table.s[0];
  if (line === undefined) return undefined;
  let lo = 0;
  let hi = table.l.length / 2 - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (table.l[mid * 2] <= line) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const index = found >= 0 ? table.l[found * 2 + 1] : -1;
  return index >= 0 ? table.s[index] : '';
}

/** A module id's own prefixes: webpack's `./`, the layer in `(app-pages-browser)/`. */
export const moduleIdPath = (path: string) => path.replace(/^\/+/, '').replace(/^(\([\w-]+\)\/)?(\.\/)?/, '');

/** A frame's file as the dev server served it: `src/hooks/useCountdown.ts`, without the origin or the query. */
export const servedPath = (url: string, line?: number) =>
  sourceAt(url, line) || moduleIdPath(url.replace(/^[a-z][\w+.-]*:\/\/[^/]*/, '').split(/[?#]/)[0]);

export function parseStack(stack: string): Frame[] {
  const frames: Frame[] = [];
  for (const line of stack.split('\n')) {
    const m = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (!m) continue;
    const fn = (m[1] ?? '').replace(/^Object\./, '').replace(/ \[as .+\]$/, '');
    // V8 names an anonymous function in eval'd code (webpack's `eval` modules) after the eval.
    frames.push({ fn: fn === 'eval' ? '' : fn, url: m[2], line: Number(m[3]), column: Number(m[4]) });
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
export function libraryOf(url: string, line?: number): string | null {
  const path = url.split(/[?#]/)[0];
  if (OWN.some((prefix) => path.startsWith(prefix))) return 'react-perf-recorder';
  const mapped = sourceAt(url, line);
  if (mapped !== undefined) {
    if (!mapped) return '';
    const at = `/${mapped}`.lastIndexOf('/node_modules/');
    return at >= 0 ? packageOf(`/${mapped}`.slice(at + '/node_modules/'.length)) : null;
  }
  const deps = /\/deps\/([^/]+)\.js$/.exec(path);
  if (deps && (url.includes('?v=') || path.includes('/.vite'))) return SHARED_CHUNK.test(deps[1]) ? '' : packageOf(deps[1].replace(/_/g, '/'));
  const at = path.lastIndexOf('/node_modules/');
  if (at >= 0) return packageOf(path.slice(at + '/node_modules/'.length));
  return null;
}

export interface Origin {
  text: string;
  at?: Frame;
}

/** Code the page did not load: a test driver's or devtools' evaluated script, an extension's content script. */
const INJECTED = /^(<anonymous>|native$|(chrome|moz|safari(-web)?)-extension:)/;

/**
 * Who made a call, from the stack taken in it: `useWindowSize @ src/hooks/useWindowSize.ts`, `(swiper)` when a
 * package did, `''` when the stack says nothing; `at` is the app's frame, for the dev server to map to a line.
 * The first frame is the recorder's wrapper, wherever it was loaded from.
 */
export function originOf(origin: Error, fallbackName = ''): Origin {
  const frames = parseStack(origin.stack ?? '')
    .slice(1)
    .filter((f) => !INJECTED.test(f.url) && libraryOf(f.url, f.line) !== 'react-perf-recorder');
  const app = frames.find((f) => libraryOf(f.url, f.line) === null);
  const own = app?.fn.split('.').pop();
  const name = (own || fallbackName || '').replace(/^bound /, '');
  if (app) return { text: `${name ? `${name} ` : ''}@ ${servedPath(app.url, app.line)}`, at: app };
  const library = frames.map((f) => libraryOf(f.url, f.line)).find(Boolean);
  return { text: library ? `(${library})` : '' };
}

export const originText = (origin: Error, fallbackName = '') => originOf(origin, fallbackName).text;
