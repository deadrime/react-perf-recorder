export interface ProxyModuleOptions {
  /** The bare specifier to replace, e.g. `proxy-memoize` or `zustand/react/shallow`. */
  source: string;
  /** Only these importers get the proxy; the proxy itself, node_modules and virtual modules keep the original. */
  importer: (importer: string | undefined) => boolean;
  /** Body of the proxy module; it imports the original by the same specifier. */
  code: () => string;
}

export interface ProxyHooks {
  /** The id of the proxy module, for a transform that wants to import it by name rather than wait to be asked. */
  readonly id: string;
  resolveId(source: string, importer?: string): string | null;
  load(id: string): string | null;
  /** Points a module's imports of the source at the proxy, whatever the resolver would have done with them. */
  rewrite(code: string): string | null;
}

/**
 * The package a specifier stands for once Vite has had it: an alias turns `zustand` into a path, and the optimizer
 * turns it into `…/deps/zustand_vanilla.js` before any plugin of ours is asked. A proxy that only knew the bare name
 * would quietly stop applying in a monorepo, under a version matrix, or whenever a dep is pre-bundled first — the
 * store would lose its causes and the root its `createRoot`.
 */
function packageOf(id: string): string {
  const path = id.replace(/\?.*$/, '');
  const optimized = /\/deps\/([^/]+)\.js$/.exec(path);
  // `@tanstack_react-query`, `zustand_vanilla`: the optimizer flattens the slashes of a subpath.
  if (optimized) return optimized[1].startsWith('chunk-') ? '' : optimized[1].replace(/_/g, '/');
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return '';
  return path
    .slice(at + '/node_modules/'.length)
    .replace(/\.[cm]?js$/, '')
    .replace(/\/index$/, '');
}

export function proxyModule(pluginName: string, options: ProxyModuleOptions): ProxyHooks {
  const id = `\0react-perf-recorder:${pluginName}:${options.source}`;
  return {
    id,
    resolveId(source, importer) {
      // Asked for the proxy itself: a module the plugin rewrote an import to, rather than a specifier to replace.
      if (source === id) return id;
      if (!importer || importer === id || importer.startsWith('\0')) return null;
      if (source !== options.source && packageOf(source) !== options.source) return null;
      return options.importer(importer) ? id : null;
    },
    load(loadId) {
      return loadId === id ? options.code() : null;
    },
    rewrite(code) {
      const quoted = options.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const imports = new RegExp(`((?:^|[\\s{(,;])(?:from|import)\\s*)(['"])${quoted}\\2`, 'g');
      if (!imports.test(code)) return null;
      imports.lastIndex = 0;
      return code.replace(imports, (_all, head: string, quote: string) => `${head}${quote}${id}${quote}`);
    },
  };
}

/** Several proxies as one pair of hooks. */
export function combineProxies(proxies: ProxyHooks[]): ProxyHooks {
  return {
    id: proxies[0]?.id ?? '',
    resolveId: (source, importer) => {
      for (const p of proxies) {
        const id = p.resolveId(source, importer);
        if (id) return id;
      }
      return null;
    },
    load: (id) => {
      for (const p of proxies) {
        const code = p.load(id);
        if (code != null) return code;
      }
      return null;
    },
    rewrite: (code) => {
      let out: string | null = null;
      for (const p of proxies) out = p.rewrite(out ?? code) ?? out;
      return out;
    },
  };
}
