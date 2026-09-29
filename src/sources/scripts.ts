import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlattenMap, TraceMap, decodedMappings, originalPositionFor } from '@jridgewell/trace-mapping';
import type { ModuleSource } from '../vite/cpu/symbols';
import { SCRIPTS_KEY, type ScriptSources } from '../shared/inject';
import { siteOnDisk, type MappedSite } from './site';

type RawMap = ConstructorParameters<typeof TraceMap>[0];

/** A source of a map as a path: from the project's root (`rel`) or on disk (`abs`). */
export interface SourcePath {
  rel?: string;
  abs?: string;
}

/**
 * What a bundler writes as a source, as a path: Vite's served URL, webpack's `webpack://app/./src/x.tsx` and
 * `webpack-internal:///(app-pages-browser)/./src/x.tsx`, Turbopack's `turbopack:///[project]/src/x.tsx`, a file URL.
 */
export function sourcePath(source: string): SourcePath {
  if (source.startsWith('file://')) {
    try {
      return { abs: fileURLToPath(source) };
    } catch {
      return {};
    }
  }
  let rest = source;
  const scheme = /^([a-z][\w+.-]*):\/\/([^/]*)/i.exec(source);
  if (scheme) rest = source.slice(scheme[0].length);
  rest = decodeURIComponent(rest.split(/[?#]/)[0]);
  if (rest.startsWith('/@fs/')) return { abs: rest.slice(4) };
  // Served by Vite at its path from the root; an absolute path only from a map written with one (Rsbuild's), which
  // the browser resolved against the server's origin.
  if ((!scheme || /^https?$/i.test(scheme[1])) && path.isAbsolute(rest) && fs.existsSync(rest)) return { abs: rest };
  rest = rest.replace(/^\/+/, '');
  // Bundler prefixes: a webpack layer `(rsc)/`, Turbopack's `[project]/`, the `./` a module id starts with.
  for (;;) {
    const next = rest
      .replace(/^\([\w-]+\)\//, '')
      .replace(/^\[project\]\//, '')
      .replace(/^\.\//, '');
    if (next === rest) break;
    rest = next;
  }
  return rest ? { rel: rest } : {};
}

/** The bundler's own code in a chunk: webpack's and Rspack's runtime, Turbopack's, a virtual entry. */
const BUNDLER_SOURCE = /^(webpack\/(runtime|bootstrap)|rspack\/|\[turbopack\]|\[externals\]|data:)|\/data:/;

interface Loaded {
  trace: TraceMap;
  raw: RawMap;
}

export interface ScriptCatalogOptions {
  /** The app's folder: sources are its files. */
  root: string;
  /** Text at a URL the page loaded, with the page's cookies; null when there is none. */
  fetchText(url: string): Promise<string | null>;
}

interface Paused {
  reason: string;
  data?: { url?: string; sourceMapURL?: string };
}

export interface CdpLike {
  send(method: string, params?: object): Promise<unknown>;
  on(event: 'Debugger.scriptParsed', listener: (payload: { scriptId: string; url: string; sourceMapURL?: string }) => void): unknown;
  on(event: 'Debugger.paused', listener: (payload: Paused) => void): unknown;
}

const decodeDataUrl = (url: string): string | null => {
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  const head = url.slice(0, comma);
  const body = url.slice(comma + 1);
  return /;base64$/.test(head) ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body);
};

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);

/**
 * The scripts a page ran and their source maps, as Chromium reports them over CDP: what turns a position in a
 * served or bundled file back into the app's own line when no dev server plugin is there to ask.
 */
export class ScriptCatalog {
  private maps = new Map<string, Promise<Loaded | null>>();
  private mapRefs = new Map<string, string>();
  private located = new Map<string, string | null>();
  private scriptIds = new Map<string, string>();
  private texts = new Map<string, Promise<string | null>>();
  private cdp: CdpLike | null = null;

  constructor(private options: ScriptCatalogOptions) {}

  /**
   * Chromium reports every script parsed so far on enable, then each new one. With `tables`, each served script
   * with a map waits until the page has its sources by line: a chunk's url says nothing of whose code a line is.
   */
  async attach(cdp: CdpLike, { tables = false } = {}) {
    this.cdp = cdp;
    cdp.on('Debugger.scriptParsed', (e) => {
      if (e.url && e.sourceMapURL) this.mapRefs.set(e.url, e.sourceMapURL);
      if (e.url) this.scriptIds.set(e.url, e.scriptId);
    });
    // The debugger is on now, so the page's own `debugger;` would stop it for good.
    cdp.on('Debugger.paused', (e) => void this.paused(cdp, e, tables));
    await cdp.send('Debugger.enable');
    if (tables) await cdp.send('Debugger.setInstrumentationBreakpoint', { instrumentation: 'beforeScriptWithSourceMapExecution' });
  }

  private async paused(cdp: CdpLike, e: Paused, tables: boolean) {
    try {
      const url = e.data?.url;
      if (tables && e.reason === 'instrumentation' && url && e.data?.sourceMapURL && /^https?:/.test(url)) {
        this.noteScript(url, e.data.sourceMapURL);
        const loaded = await this.mapOf(url);
        const table = loaded && this.tableOf(loaded);
        // Not awaited: an evaluate sent in this pause runs only once the pause ends.
        if (table)
          cdp
            .send('Runtime.evaluate', {
              expression: `(window[${JSON.stringify(SCRIPTS_KEY)}] ??= {})[${JSON.stringify(url.split(/[?#]/)[0])}] = ${JSON.stringify(table)}`,
            })
            .catch(() => {});
      }
    } finally {
      await cdp.send('Debugger.resume').catch(() => {});
    }
  }

  /** A source as the page names it: its path from the root, null for the bundler's own. */
  private nameOf(source: string): string | null {
    const { rel, abs } = sourcePath(source);
    if (abs) return path.relative(this.options.root, abs).replace(/\\/g, '/');
    return rel && !BUNDLER_SOURCE.test(rel) ? rel : null;
  }

  /** Each generated line's source, run-length: the first mapped segment of a line decides it. */
  tableOf(loaded: Loaded): ScriptSources {
    const s: string[] = [];
    const index = loaded.trace.resolvedSources.map((source) => {
      const name = source == null ? null : this.nameOf(source);
      if (name === null) return -1;
      const at = s.indexOf(name);
      return at >= 0 ? at : s.push(name) - 1;
    });
    const l: number[] = [];
    let last = -2;
    decodedMappings(loaded.trace).forEach((segments, i) => {
      // An empty line is nobody's call site: it keeps what came before, and the table stays short.
      if (!segments.length) return;
      const mapped = segments.find((segment) => segment.length >= 4);
      const at = mapped ? index[mapped[1]!] : -1;
      if (at === last) return;
      l.push(i + 1, at);
      last = at;
    });
    return s.length === 1 && !l.some((at, i) => i % 2 === 1 && at < 0) ? { s, l: [] } : { s, l };
  }

  noteScript(url: string, sourceMapURL: string) {
    this.mapRefs.set(url, sourceMapURL);
  }

  private mapOf(url: string): Promise<Loaded | null> {
    let loading = this.maps.get(url);
    if (!loading) this.maps.set(url, (loading = this.load(url).catch(() => null)));
    return loading;
  }

  private async load(url: string): Promise<Loaded | null> {
    let ref = this.mapRefs.get(url) ?? [...this.mapRefs].find(([known]) => known.split(/[?#]/)[0] === url.split(/[?#]/)[0])?.[1];
    // Parsed before anyone listened, or evaluated without a URL of its own: the file says where its map is.
    if (!ref && /^https?:/.test(url)) {
      const code = await this.options.fetchText(url);
      ref = code ? /\/\/[#@] sourceMappingURL=(\S+)\s*$/.exec(code.slice(-1_000_000))?.[1] : undefined;
    }
    if (!ref) return null;
    let text: string | null;
    let mapUrl = url;
    if (ref.startsWith('data:')) text = decodeDataUrl(ref);
    else {
      try {
        mapUrl = new URL(ref, url).href;
      } catch {
        return null;
      }
      text = await this.options.fetchText(mapUrl);
    }
    if (!text) return null;
    const raw = JSON.parse(text) as RawMap;
    // Sources resolve against the map's own URL, as a browser does it; Turbopack writes a map of sections.
    const base = /^[a-z]+:/i.test(mapUrl) ? mapUrl : undefined;
    return { raw, trace: 'sections' in (raw as object) ? FlattenMap(raw, base) : new TraceMap(raw, base) };
  }

  /** The file behind a path from the root, found on disk: the app may sit in a folder under where the server runs. */
  locate(rel: string): string | null {
    if (this.located.has(rel)) return this.located.get(rel)!;
    const direct = path.join(this.options.root, rel);
    let found: string | null = fs.existsSync(direct) ? direct : null;
    const queue: Array<[string, number]> = [[this.options.root, 0]];
    // A big monorepo is not walked whole for every name it does not have.
    let visited = 0;
    while (!found && queue.length && visited++ < 2000) {
      const [dir, depth] = queue.shift()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        const candidate = path.join(dir, entry.name, rel);
        if (fs.existsSync(candidate)) {
          found = candidate;
          break;
        }
        if (depth < 3) queue.push([path.join(dir, entry.name), depth + 1]);
      }
    }
    this.located.set(rel, found);
    return found;
  }

  /** A generated position to `src/file.ts:12` and the code on the line; with `hooks`, a memo's dependencies too. */
  async mapSite(url: string, line: number, column: number, hooks?: string[]): Promise<MappedSite | null> {
    const loaded = await this.mapOf(url);
    if (!loaded) return this.siteByText(url, line, column, hooks);
    const pos = originalPositionFor(loaded.trace, { line, column: Math.max(0, column - 1) });
    if (pos.line == null || !pos.source) return null;
    const { rel, abs } = sourcePath(pos.source);
    const file = abs ?? (rel ? this.locate(rel) : null);
    const name = rel ?? (abs ? path.relative(this.options.root, abs).replace(/\\/g, '/') : undefined);
    if (file) return siteOnDisk(this.options.root, file, pos.line, hooks, name);
    if (!name) return null;
    // Not on this disk: the map may carry the source itself.
    const index = loaded.trace.resolvedSources.indexOf(pos.source);
    const content = index >= 0 ? loaded.trace.sourcesContent?.[index] : null;
    const code = content?.split('\n')[pos.line - 1]?.trim().slice(0, 140);
    return { site: `${name}:${pos.line}`, ...(code ? { code } : {}) };
  }

  private textOf(url: string): Promise<string | null> {
    let loading = this.texts.get(url);
    const scriptId = this.scriptIds.get(url);
    if (!loading && scriptId && this.cdp)
      this.texts.set(
        url,
        (loading = this.cdp
          .send('Debugger.getScriptSource', { scriptId })
          .then((r) => (r as { scriptSource: string }).scriptSource)
          .catch(() => null))
      );
    return loading ?? Promise.resolve(null);
  }

  /** No map (webpack's default `eval`): the module's own file, at the line the generated code's call is on. */
  private async siteByText(url: string, line: number, column: number, hooks?: string[]): Promise<MappedSite | null> {
    const { rel, abs } = sourcePath(url);
    const file = abs ?? (rel ? this.locate(rel) : null);
    if (!file || !/\.[cm]?[jt]sx?$/.test(file)) return null;
    const generated = await this.textOf(url);
    if (!generated) return null;
    let original: string;
    try {
      original = fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
    const found = lineByText(generated, line, column, original);
    const name = rel ?? path.relative(this.options.root, file).replace(/\\/g, '/');
    return found ? siteOnDisk(this.options.root, file, found, hooks, name) : null;
  }

  /**
   * A profiled function's own file: by the map of its script, or for an `eval` module of webpack's by its name in
   * the module's file. Line 0: the file, the function not found in it.
   */
  async position(
    url: string,
    line: number,
    column: number,
    name?: string
  ): Promise<{ file: string; line: number; column: number } | { package: string } | null> {
    const loaded = await this.mapOf(url);
    if (loaded) {
      const pos = originalPositionFor(loaded.trace, { line, column });
      if (pos.line == null || !pos.source) return null;
      const { rel, abs } = sourcePath(pos.source);
      if (!abs && (!rel || BUNDLER_SOURCE.test(rel))) return { package: '(bundler)' };
      const file = abs ?? (rel!.startsWith('node_modules/') ? path.join(this.options.root, rel!) : this.locate(rel!));
      return file ? { file, line: pos.line, column: pos.column ?? 0 } : null;
    }
    if (/^https?:/.test(url) || !this.scriptIds.has(url)) return null;
    const { rel, abs } = sourcePath(url);
    if (!abs && rel?.startsWith('node_modules/')) return { file: path.join(this.options.root, rel), line: 0, column: 0 };
    const file = abs ?? (rel ? this.locate(rel) : null);
    if (!file) return rel && /^webpack\//.test(rel) ? { package: '(bundler)' } : null;
    return { file, line: name ? declarationLine(file, name) : 0, column: 0 };
  }

  /** The CPU profile's resolver asks the same way it asks Vite's module graph. */
  moduleSource(): ModuleSource {
    return {
      root: this.options.root,
      position: (url, line, column, name) => this.position(url, line, column, name),
      getModuleByUrl: async (pathname) => {
        const script = [...this.mapRefs.keys()].find((url) => {
          try {
            const parsed = new URL(url);
            return parsed.pathname + parsed.search === pathname || parsed.pathname === pathname.split('?')[0];
          } catch {
            return false;
          }
        });
        const { rel } = sourcePath(pathname);
        const file = rel ? this.locate(rel) : null;
        const loaded = script ? await this.mapOf(script) : null;
        return { file, transformResult: loaded ? { map: loaded.raw } : null };
      },
    };
  }
}

const offsetOf = (text: string, line: number, column: number) => {
  let at = 0;
  for (let i = 1; i < line && at >= 0; i++) at = text.indexOf('\n', at) + (at >= 0 ? 1 : 0);
  return at < 0 ? -1 : at + Math.max(0, column - 1);
};

const callsOf = (text: string, name: string) => {
  const escaped = name.replace(/\$/g, '\\$');
  return [...text.matchAll(new RegExp(`(?<![\\w$])${escaped}\\)?\\s*\\(`, 'g'))].map((m) => m.index!);
};

const JSX_CALLEE = /^_?(jsxs?(DEV)?|createElement)$/;
const JSX_CALL = /(?<![\w$])_?(jsxs?(DEV)?|createElement)\)?\s*\(/g;
const TYPE = /^\s*(?:(?:[\w$]+\.)*([\w$]+)|["']([^"']+)["'])/;

/** A JSX call's element by its type: the n-th `jsxDEV(Row, …)` is the n-th `<Row` of the file. */
function elementLine(generated: string, args: number, original: string): number | null {
  const typeAt = (from: number) => {
    const m = TYPE.exec(generated.slice(from, from + 200));
    return m ? m[1] ?? m[2] : null;
  };
  const type = typeAt(args);
  if (!type || type === 'Fragment') return null;
  const same = [...generated.matchAll(JSX_CALL)].filter((m) => typeAt(m.index! + m[0].length) === type).map((m) => m.index! + m[0].length);
  const n = same.indexOf(args);
  const escaped = type.replace(/\$/g, '\\$');
  const inOriginal = [...original.matchAll(new RegExp(`<${escaped}(?=[\\s/>])`, 'g'))].map((m) => m.index!);
  if (n < 0 || same.length !== inOriginal.length) return null;
  return original.slice(0, inOriginal[n]).split('\n').length;
}

/**
 * The line in the original file of a call in code a loader transformed. A dev JSX transform writes the line into
 * the call itself; any other call is the same n-th call of the same function in both, when both have as many.
 */
export function lineByText(generated: string, line: number, column: number, original: string): number | null {
  const at = offsetOf(generated, line, column);
  if (at < 0) return null;
  // V8 points at the callee's name, or at the arguments of `(0, _store__WEBPACK_IMPORTED_MODULE_2__.useClicks)(…)`.
  const before = /(?<![\w$])([\w$]+)\)?\s*\($/.exec(generated.slice(Math.max(0, at - 200), at + 1));
  const after = /^[\s(]*(?:0\s*,\s*)?(?:[\w$]+\.)*([\w$]+)\)?\s*\(/.exec(generated.slice(at, at + 200));
  const call = before ?? after;
  if (!call) return null;
  const end = before ? at + 1 : at + call[0].length;
  const name = call[1];
  if (JSX_CALLEE.test(name)) {
    const rest = generated.slice(end);
    const next = rest.search(JSX_CALL);
    // Babel 7 and swc write the element's own line into a dev JSX call; Babel 8 no longer does.
    const own = /lineNumber:\s*(\d+)/.exec(next >= 0 ? rest.slice(0, next) : rest);
    return own ? Number(own[1]) : elementLine(generated, end, original);
  }
  const calls = callsOf(generated, name);
  const inOriginal = callsOf(original, name);
  const n = calls.findIndex((i) => i >= end - call[0].length - 1 && i < end);
  if (n < 0 || calls.length !== inOriginal.length) return null;
  return original.slice(0, inOriginal[n]).split('\n').length;
}

/** Where a function is declared in a file: `function Row(`, `const Row = `, `Row: `; 0 when not found. */
function declarationLine(file: string, name: string): number {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return 0;
  }
  const escaped = name.replace(/\$/g, '\\$');
  const found = new RegExp(`(function\\*?\\s+${escaped}\\b|(?<![\\w$.])${escaped}\\s*[:=](?!=))`).exec(text);
  return found ? text.slice(0, found.index).split('\n').length : 0;
}
