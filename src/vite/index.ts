import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import type { Plugin, ViteDevServer } from 'vite';
import type { VitePluginLike } from './plugin-api';
import { ENDPOINT, type JsonValue } from '../shared/schema';
import { addComponentNames, DEFAULT_WRAPPERS, type ComponentNamesOptions } from './component-names';
import { ENTRY_ID, entryCode, RESOLVED_ENTRY_ID, runtimeSpecifier } from './entry';
import { fixJsxLines } from './jsx-lines';
import { optimizeDepsFor, transformServedDep } from './helpers/dep-transform';
import { cleanId, createFilter } from './helpers/filter';
import { proxyModule } from './helpers/proxy-module';
import { siteOnDisk } from '../sources/site';
import { summarizeCpu } from './cpu';
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
  /**
   * CPU in the panel's recordings: the dev server sends `Document-Policy: js-profiling`, so Chromium lets the page
   * sample its own JS (every 10 ms). false leaves the header off; record_page's `cpu` works either way.
   */
  cpu?: boolean;
}

/** Whether a package can be imported from the project: an `include` of one that is not there fails the optimizer. */
function resolvable(specifier: string, root = process.cwd()): boolean {
  try {
    createRequire(path.join(path.resolve(root), 'package.json')).resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

/** The app's React major; 0 when there is none to find. */
function reactMajor(root: string): number {
  try {
    const pkg = createRequire(path.join(path.resolve(root), 'package.json'))('react/package.json') as { version?: string };
    return Number.parseInt(pkg.version ?? '', 10) || 0;
  } catch {
    return 0;
  }
}

const DEFAULT_WRAPPER_PATTERN = '^(Anonymous|ForwardRef|Memo)$';

type HookOptions = { ssr?: boolean } | undefined;

/** A module run by the server, as an SSR framework renders its pages: the recorder is for the browser only. */
function onServer(context: unknown, options: HookOptions): boolean {
  if (options?.ssr) return true;
  return (context as { environment?: { config?: { consumer?: string } } } | undefined)?.environment?.config?.consumer === 'server';
}

/** Frameworks ship their default client entry as source (React Router's `entry.client.tsx`); packages ship built JS. */
const SOURCE_IN_PACKAGE = /\/node_modules\/(?!\.vite\/).+\.[jt]sx$/;

export function resolveOutDir(root: string, outDir: string | undefined): string {
  const dir = outDir ?? process.env.REACT_PERF_RECORDER_DIR ?? '.agent-artifacts/perf-recorder';
  return path.resolve(root, dir);
}

/** A module's map, parsed once while the module is the same: a recording maps hundreds of positions in a few files. */
const traceMaps = new WeakMap<object, TraceMap>();

/** `hooks`: for a memo, the custom hooks down to it; its dependencies are then named too. */
async function mapSite(server: ViteDevServer, root: string, url: string, line: number, column: number, hooks?: string[]) {
  const parsed = new URL(url, 'http://localhost');
  const mod = await server.moduleGraph.getModuleByUrl(parsed.pathname + parsed.search);
  // A change to a module it imports soft-invalidates it: the page still runs the code it was served, whose result
  // Vite keeps aside until the module is asked for again.
  const kept = mod?.invalidationState;
  const result = mod?.transformResult ?? (kept && typeof kept === 'object' ? kept : null);
  const map = result?.map as ConstructorParameters<typeof TraceMap>[0] | null | undefined;
  if (!mod?.file || !map) return null;
  let traced = traceMaps.get(map as object);
  if (!traced) traceMaps.set(map as object, (traced = new TraceMap(map)));
  const pos = originalPositionFor(traced, { line, column: Math.max(0, column - 1) });
  if (pos.line == null) return null;
  const file = pos.source ? (path.isAbsolute(pos.source) ? pos.source : path.resolve(path.dirname(mod.file), pos.source)) : mod.file;
  return siteOnDisk(root, fs.existsSync(file) ? file : mod.file, pos.line, hooks);
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
  const componentFilter = createFilter(() => root, components?.include ?? ['**/*.{tsx,jsx}'], components?.exclude);
  const wrapperPattern = components?.wrapperPattern ?? DEFAULT_WRAPPER_PATTERN;
  // Recording from the page load has to start before the first commit, and a root exists as soon as createRoot
  // returns; the app's own import of react-dom/client goes through a proxy that says so.
  const appFilter = createFilter(() => root, ['**/*.{ts,tsx,js,jsx}']);
  const clientEntry = (id: string | undefined) => appFilter(id) || (!!id && !id.startsWith('\0') && SOURCE_IN_PACKAGE.test(cleanId(id)));
  // Set once the page's HTML went through Vite; an SSR framework renders its own and never asks.
  let htmlEntry = false;
  const rootProxy = proxyModule('core', {
    source: 'react-dom/client',
    importer: clientEntry,
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
    cpu: options.cpu ?? true,
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
    // The app's import of react-dom/client is rewritten to the proxy, so the optimizer's scan never meets it and
    // would find it on the first page load, then reload the page with two copies of React for a moment.
    config(this: { meta?: { rolldownVersion?: string } } | void, config) {
      const output = (config.optimizeDeps as { rolldownOptions?: { output?: { chunkFileNames?: unknown } } } | undefined)?.rolldownOptions?.output;
      // Rolldown names a shared chunk after a module in it (`react-dom-DVjBvCsW`), which reads as a package in a stack.
      const chunks =
        this?.meta?.rolldownVersion && output?.chunkFileNames === undefined
          ? { rolldownOptions: { output: { chunkFileNames: 'chunk-[hash].js' } } }
          : {};
      return {
        optimizeDeps: {
          exclude: ['react-perf-recorder'],
          include: resolvable('react-dom/client', config.root) ? ['react-dom/client'] : [],
          ...chunks,
        },
      };
    },
    configResolved(config) {
      root = config.root;
      base = config.base;
      serving = config.command === 'serve';
    },
    resolveId(id, importer, opts) {
      if (id === ENTRY_ID) return RESOLVED_ENTRY_ID;
      return onServer(this, opts) ? null : rootProxy.resolveId(id, importer);
    },
    load(id) {
      const proxied = rootProxy.load(id);
      if (proxied) return proxied;
      if (id !== RESOLVED_ENTRY_ID) return null;
      const runtimes = plugins
        .filter((p) => p.runtime)
        .map((p) => ({ module: runtimeSpecifier(p.runtime!.module, root), options: p.runtime!.options }));
      return entryCode('react-perf-recorder/client', clientConfig(), runtimes);
    },
    transform(code, id, opts) {
      if (onServer(this, opts)) return null;
      // Rewritten rather than intercepted at resolve: when the app aliases `react-dom`, the optimizer answers first
      // and the root would quietly stop announcing itself.
      let rewritten = clientEntry(id) ? rootProxy.rewrite(code) : null;
      // No HTML to put the entry in: the module that creates the root imports it first, on its first line so no
      // line of the module moves.
      if (rewritten && !htmlEntry) rewritten = `import ${JSON.stringify(ENTRY_ID)};${rewritten}`;
      if (!components || !componentFilter(id)) return rewritten ? { code: rewritten, map: null } : null;
      const named = addComponentNames(rewritten ?? code, components.wrappers ?? DEFAULT_WRAPPERS, id);
      return named ? { code: named, map: null } : rewritten ? { code: rewritten, map: null } : null;
    },
    // The dev server serves a virtual module under /@id/ and puts the base in front itself for a tag added before it
    // reads the page's scripts; a build bundles the module from its id, and only for such a tag.
    transformIndexHtml: {
      order: 'pre',
      handler: () => {
        htmlEntry = true;
        return [{ tag: 'script', attrs: { type: 'module', src: serving ? `/@id/${ENTRY_ID}` : ENTRY_ID }, injectTo: 'head-prepend' as const }];
      },
    },
    configureServer(server) {
      const dir = resolveOutDir(root, options.outDir);
      const store = new SessionStore({
        dir,
        maxBytes: options.maxBytes ?? 64 * 1024 * 1024,
        retain: { sessions: options.retain?.sessions ?? 100, bytes: options.retain?.bytes ?? 500 * 1024 * 1024 },
        gitignore: !path.relative(root, dir).startsWith('..'),
        mapSite: (url, line, column, hooks) => mapSite(server, root, url, line, column, hooks),
        summarizeCpu: (input) =>
          summarizeCpu(input, {
            root,
            publicDir: server.config.publicDir || undefined,
            getModuleByUrl: (url) => server.moduleGraph.getModuleByUrl(url),
          }),
      });
      // Chromium hands a page its own profiler only when the document asks for it.
      if (options.cpu !== false)
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Document-Policy', 'js-profiling');
          next();
        });
      server.middlewares.use(createMiddleware(store, base, VERSION));
      server.config.logger.info(`  react-perf-recorder: sessions → ${dir}`);
    },
  };

  // After esbuild (no `enforce`): it is esbuild that writes the element lines React 18 reports; React 19 reads its
  // own stack through the map instead.
  let react18 = true;
  const jsxLines: Plugin = {
    name: 'react-perf-recorder:jsx-lines',
    apply,
    configResolved(config) {
      react18 = reactMajor(config.root) < 19;
    },
    transform(code, id, opts) {
      if (!react18 || onServer(this, opts) || id.startsWith('\0') || id.includes('/node_modules/') || !code.includes('jsxDEV(')) return null;
      try {
        const fixed = fixJsxLines(code, cleanId(id), () => this.getCombinedSourcemap() as unknown as ReturnType<Parameters<typeof fixJsxLines>[2]>);
        return fixed ? { code: fixed, map: null } : null;
      } catch {
        // A map it cannot read: the lines stay as they were, the module still loads.
        return null;
      }
    },
  };

  const wrapped: Plugin[] = plugins
    .filter((p) => p.vite)
    .map((p) => {
      const { config, resolveId, load, transform, transformDep } = p.vite!;
      const name = `react-perf-recorder:${p.name}`;
      return {
        name,
        enforce: 'pre' as const,
        apply,
        ...(config || transformDep
          ? {
              config(this: { meta?: { rolldownVersion?: string } } | void, userConfig) {
                const own = config?.(userConfig) ?? undefined;
                if (!transformDep) return own;
                const deps = optimizeDepsFor(name, transformDep, !!this?.meta?.rolldownVersion);
                return { ...own, optimizeDeps: { ...own?.optimizeDeps, ...deps } };
              },
            }
          : {}),
        ...(resolveId
          ? {
              resolveId(source, importer, opts) {
                return onServer(this, opts) ? null : resolveId(source, importer) ?? null;
              },
            }
          : {}),
        ...(load ? { load: (id) => load(id) ?? null } : {}),
        ...(transform || transformDep
          ? {
              transform(code, id, opts) {
                if (onServer(this, opts)) return null;
                const depCode = transformDep && transformServedDep(transformDep, code, id);
                if (depCode != null) return { code: depCode, map: null };
                return transform?.(code, id) ?? null;
              },
            }
          : {}),
      } satisfies Plugin;
    });

  return [core, ...wrapped, jsxLines] as unknown as VitePluginLike[];
}

export { definePerfRecorderPlugin, type BuildContext, type PerfRecorderPlugin, type VitePluginLike } from './plugin-api';
export { proxyModule, combineProxies, type ProxyModuleOptions } from './helpers/proxy-module';
export { findDeclarations, appendLines } from './helpers/name-declarations';
export { createFilter } from './helpers/filter';
export { addComponentNames } from './component-names';
