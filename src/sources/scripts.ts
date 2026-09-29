import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import type { ModuleSource } from '../vite/cpu/symbols';
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
  // Served by Vite at its path from the root; an absolute path of its own only from a source map written on disk.
  if (!scheme && path.isAbsolute(rest) && fs.existsSync(rest)) return { abs: rest };
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

export interface CdpLike {
  send(method: string, params?: object): Promise<unknown>;
  on(event: 'Debugger.scriptParsed', listener: (payload: { url: string; sourceMapURL?: string }) => void): unknown;
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

  constructor(private options: ScriptCatalogOptions) {}

  /** Chromium reports every script parsed so far on enable, then each new one. */
  async attach(cdp: CdpLike) {
    cdp.on('Debugger.scriptParsed', (e) => {
      if (e.url && e.sourceMapURL) this.mapRefs.set(e.url, e.sourceMapURL);
    });
    await cdp.send('Debugger.enable');
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
    // Sources resolve against the map's own URL, as a browser does it.
    return { raw, trace: new TraceMap(raw, /^[a-z]+:/i.test(mapUrl) ? mapUrl : undefined) };
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
    if (!loaded) return null;
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

  /** The CPU profile's resolver asks the same way it asks Vite's module graph. */
  moduleSource(): ModuleSource {
    return {
      root: this.options.root,
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
