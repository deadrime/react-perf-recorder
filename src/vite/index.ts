import fs from 'node:fs';
import path from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import type { Plugin, ViteDevServer } from 'vite';
import type { VitePluginLike } from './plugin-api';
import { ENDPOINT, type JsonValue } from '../shared/schema';
import { addComponentNames, DEFAULT_WRAPPERS, type ComponentNamesOptions } from './component-names';
import { ENTRY_ID, entryCode, RESOLVED_ENTRY_ID, runtimeSpecifier } from './entry';
import type { Statement } from '@babel/types';
import { createFilter } from './helpers/filter';
import { memoDepsAt, memoDepsInHook } from './helpers/hook-deps';
import { parseModule } from './helpers/name-declarations';
import { proxyModule } from './helpers/proxy-module';
import { createMiddleware, SessionStore } from './middleware';
import type { BuildContext, PerfRecorderPlugin } from './plugin-api';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

export interface PerfRecorderOptions {
  /** Defaults to the dev server only: never in `vite build`, never under Vitest. */
  enabled?: boolean;
  /**
   * Whether recordings are sent to the dev server to be kept; true when it serves the page. A build made with
   * `enabled: true` (a demo) has no server, and its recordings stay in the tab.
   */
  save?: boolean;
  /** Where sessions are written: relative to the root or absolute. Falls back to REACT_PERF_RECORDER_DIR, then `.agent-artifacts/perf-recorder`. */
  outDir?: string;
  /** Largest request body, the final recording included. */
  maxBytes?: number;
  retain?: { sessions?: number; bytes?: number };
  actions?: { values?: boolean; secretSelector?: string };
  components?: false | (ComponentNamesOptions & { wrapperPattern?: string });
  panel?:
    | false
    | { corner?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'; highlight?: boolean; shortcuts?: { record?: string; pick?: string } };
  /** `timers: false` leaves setTimeout, setInterval and requestAnimationFrame unwrapped: no timer causes. */
  engine?: { bigCommit?: number; timelineLimit?: number; maxDurationMs?: number; timers?: boolean };
  plugins?: PerfRecorderPlugin[];
}

const DEFAULT_WRAPPER_PATTERN = '^(Anonymous|ForwardRef|Memo)$';

export function resolveOutDir(root: string, outDir: string | undefined): string {
  const dir = outDir ?? process.env.REACT_PERF_RECORDER_DIR ?? '.agent-artifacts/perf-recorder';
  return path.resolve(root, dir);
}

/** A module's map, parsed once while the module is the same: a recording maps hundreds of positions in a few files. */
const traceMaps = new WeakMap<object, TraceMap>();
const fileLines = new Map<string, { mtimeMs: number; lines: string[] }>();

function linesOf(file: string): string[] {
  const mtimeMs = fs.statSync(file).mtimeMs;
  const cached = fileLines.get(file);
  if (cached?.mtimeMs === mtimeMs) return cached.lines;
  if (fileLines.size > 200) fileLines.clear();
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  fileLines.set(file, { mtimeMs, lines });
  return lines;
}

const parsedFiles = new Map<string, { mtimeMs: number; code: string; body: Statement[] | null }>();

function parsedOf(file: string) {
  const mtimeMs = fs.statSync(file).mtimeMs;
  let parsed = parsedFiles.get(file);
  if (parsed?.mtimeMs !== mtimeMs) {
    if (parsedFiles.size > 50) parsedFiles.clear();
    const code = linesOf(file).join('\n');
    parsedFiles.set(file, (parsed = { mtimeMs, code, body: parseModule(code, file) }));
  }
  return parsed;
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

/**
 * A memo's dependencies by name: the useMemo on the line, or — when the line calls a custom hook — the one useMemo
 * inside the innermost of `hooks`, looked up in this module and the modules it imports relatively, three at most.
 */
function depsOf(file: string, line: number, hooks: string[] = []): string[] | null {
  const here = parsedOf(file);
  if (!here.body) return null;
  const direct = memoDepsAt(here.body, here.code, line);
  if (direct || !hooks.length) return direct;
  const innermost = hooks[hooks.length - 1];
  let at = file;
  for (let hop = 0; hop < 3; hop++) {
    const parsed = parsedOf(at);
    if (!parsed.body) return null;
    // The innermost hook, or the outermost that leads there: the module that has one imports the other.
    const found =
      memoDepsInHook(parsed.body, parsed.code, innermost) ??
      (hop === 0 && hooks.length > 1 ? memoDepsInHook(parsed.body, parsed.code, hooks[0]) : null);
    if (!found) return null;
    if (found.kind === 'deps') return found.deps;
    if (!found.source.startsWith('.')) return null;
    const base = path.resolve(path.dirname(at), found.source);
    const next = EXTENSIONS.map((ext) => base + ext).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!next) return null;
    at = next;
  }
  return null;
}

/** `hooks`: for a memo, the custom hooks down to it; its dependencies are then named too. */
async function mapSite(server: ViteDevServer, root: string, url: string, line: number, column: number, hooks?: string[]) {
  const parsed = new URL(url, 'http://localhost');
  const mod = await server.moduleGraph.getModuleByUrl(parsed.pathname + parsed.search);
  const map = mod?.transformResult?.map as ConstructorParameters<typeof TraceMap>[0] | null | undefined;
  if (!mod?.file || !map) return null;
  let traced = traceMaps.get(map as object);
  if (!traced) traceMaps.set(map as object, (traced = new TraceMap(map)));
  const pos = originalPositionFor(traced, { line, column: Math.max(0, column - 1) });
  if (pos.line == null) return null;
  const file = pos.source ? (path.isAbsolute(pos.source) ? pos.source : path.resolve(path.dirname(mod.file), pos.source)) : mod.file;
  const real = fs.existsSync(file) ? file : mod.file;
  const code = linesOf(real)[pos.line - 1]?.trim().slice(0, 140);
  // A useMemo or useCallback: its dependencies by the names the code gives them, wherever the array is written.
  const deps = hooks ? depsOf(real, pos.line, hooks) : null;
  return { site: `${path.relative(root, real).replace(/\\/g, '/')}:${pos.line}`, ...(code ? { code } : {}), ...(deps ? { deps } : {}) };
}

/**
 * Records React re-renders from the page: injects the recorder into the dev page, names memo components and
 * contexts, runs the plugins' build halves and stores sessions for the MCP server. Returns several Vite plugins.
 */
export function perfRecorder(options: PerfRecorderOptions = {}): VitePluginLike[] {
  let root = process.cwd();
  let base = '/';
  let serving = true;
  const plugins = options.plugins ?? [];
  const ctx: BuildContext = { root: () => root };
  plugins.forEach((p) => p.init?.(ctx));
  const apply = (_: unknown, env: { command: string; mode: string }) =>
    options.enabled ?? (env.command === 'serve' && !process.env.VITEST && env.mode !== 'test');
  const components = options.components === false ? null : options.components ?? {};
  const componentFilter = createFilter(() => root, components?.include ?? ['src/**/*.{tsx,jsx}'], components?.exclude);
  const wrapperPattern = components?.wrapperPattern ?? DEFAULT_WRAPPER_PATTERN;
  // Recording from the page load has to start before the first commit, and a root exists as soon as createRoot
  // returns; the app's own import of react-dom/client goes through a proxy that says so.
  const appFilter = createFilter(() => root, ['src/**/*.{ts,tsx,js,jsx}']);
  const rootProxy = proxyModule('core', {
    source: 'react-dom/client',
    importer: appFilter,
    code: () =>
      [
        // Named exports only: react-dom/client is interop'd from CJS, and `export *` would lose them.
        `import * as original from 'react-dom/client';`,
        `import { noteRoot } from 'react-perf-recorder/runtime';`,
        `export const createRoot = (...args) => { const root = original.createRoot(...args); noteRoot(root); return root; };`,
        `export const hydrateRoot = (...args) => { const root = original.hydrateRoot(...args); noteRoot(root); return root; };`,
        `export const version = original.version;`,
        `export default original.default ?? original;`,
      ].join('\n'),
  });

  const clientConfig = (): JsonValue => ({
    version: VERSION,
    projectRoot: root.replace(/\\/g, '/'),
    wrapperPattern,
    actions: { values: options.actions?.values ?? false, secretSelector: options.actions?.secretSelector ?? '[data-rpr-secret]' },
    maxDurationMs: options.engine?.maxDurationMs ?? 10 * 60_000,
    bigCommit: options.engine?.bigCommit ?? 150,
    timelineLimit: options.engine?.timelineLimit ?? 5000,
    timers: options.engine?.timers ?? true,
    endpoint: options.save ?? serving ? `${base.replace(/\/$/, '')}/${ENDPOINT}` : null,
    panel:
      options.panel === false
        ? false
        : {
            corner: options.panel?.corner ?? 'bottom-left',
            highlight: options.panel?.highlight ?? true,
            shortcuts: { record: options.panel?.shortcuts?.record ?? 'Alt+Shift+KeyR', pick: options.panel?.shortcuts?.pick ?? 'Alt+Shift+KeyS' },
          },
  });

  const core: Plugin = {
    name: 'react-perf-recorder',
    enforce: 'pre',
    apply,
    config: () => ({ optimizeDeps: { exclude: ['react-perf-recorder'] } }),
    configResolved(config) {
      root = config.root;
      base = config.base;
      serving = config.command === 'serve';
    },
    resolveId: (id, importer) => (id === ENTRY_ID ? RESOLVED_ENTRY_ID : rootProxy.resolveId(id, importer)),
    load(id) {
      const proxied = rootProxy.load(id);
      if (proxied) return proxied;
      if (id !== RESOLVED_ENTRY_ID) return null;
      const runtimes = plugins
        .filter((p) => p.runtime)
        .map((p) => ({ module: runtimeSpecifier(p.runtime!.module, root), options: p.runtime!.options }));
      return entryCode('react-perf-recorder/client', clientConfig(), runtimes);
    },
    transform(code, id) {
      // Rewritten rather than intercepted at resolve: when the app aliases `react-dom`, the optimizer answers first
      // and the root would quietly stop announcing itself.
      const rewritten = appFilter(id) ? rootProxy.rewrite(code) : null;
      if (!components || !componentFilter(id)) return rewritten ? { code: rewritten, map: null } : null;
      const named = addComponentNames(rewritten ?? code, components.wrappers ?? DEFAULT_WRAPPERS, id);
      return named ? { code: named, map: null } : rewritten ? { code: rewritten, map: null } : null;
    },
    // The dev server serves a virtual module under /@id/; a build bundles it from its id, which it does only for a
    // tag that is there before Vite reads the page's scripts.
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'script', attrs: { type: 'module', src: serving ? `${base}@id/${ENTRY_ID}` : ENTRY_ID }, injectTo: 'head-prepend' }],
    },
    configureServer(server) {
      const dir = resolveOutDir(root, options.outDir);
      const store = new SessionStore({
        dir,
        maxBytes: options.maxBytes ?? 64 * 1024 * 1024,
        retain: { sessions: options.retain?.sessions ?? 100, bytes: options.retain?.bytes ?? 500 * 1024 * 1024 },
        gitignore: !path.relative(root, dir).startsWith('..'),
        mapSite: (url, line, column, hooks) => mapSite(server, root, url, line, column, hooks),
      });
      server.middlewares.use(createMiddleware(store, base, VERSION));
      server.config.logger.info(`  react-perf-recorder: sessions → ${dir}`);
    },
  };

  const wrapped: Plugin[] = plugins
    .filter((p) => p.vite)
    .map((p) => ({
      name: `react-perf-recorder:${p.name}`,
      enforce: 'pre' as const,
      apply,
      ...(p.vite!.config ? { config: (config) => p.vite!.config!(config) ?? undefined } : {}),
      ...(p.vite!.resolveId ? { resolveId: (source, importer) => p.vite!.resolveId!(source, importer) ?? null } : {}),
      ...(p.vite!.load ? { load: (id) => p.vite!.load!(id) ?? null } : {}),
      ...(p.vite!.transform ? { transform: (code, id) => p.vite!.transform!(code, id) ?? null } : {}),
    }));

  return [core, ...wrapped] as unknown as VitePluginLike[];
}

export { definePerfRecorderPlugin, type BuildContext, type PerfRecorderPlugin, type VitePluginLike } from './plugin-api';
export { proxyModule, combineProxies, type ProxyModuleOptions } from './helpers/proxy-module';
export { findDeclarations, appendLines } from './helpers/name-declarations';
export { createFilter } from './helpers/filter';
export { addComponentNames } from './component-names';
