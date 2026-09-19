export interface ProxyModuleOptions {
  /** The bare specifier to replace, e.g. `proxy-memoize` or `zustand/react/shallow`. */
  source: string;
  /** Only these importers get the proxy; the proxy itself, node_modules and virtual modules keep the original. */
  importer: (importer: string | undefined) => boolean;
  /** Body of the proxy module; it imports the original by the same specifier. */
  code: () => string;
}

export interface ProxyHooks {
  resolveId(source: string, importer?: string): string | null;
  load(id: string): string | null;
}

export function proxyModule(pluginName: string, options: ProxyModuleOptions): ProxyHooks {
  const id = `\0react-perf-recorder:${pluginName}:${options.source}`;
  return {
    resolveId(source, importer) {
      if (source !== options.source || !importer || importer === id || importer.startsWith('\0')) return null;
      return options.importer(importer) ? id : null;
    },
    load(loadId) {
      return loadId === id ? options.code() : null;
    },
  };
}

/** Several proxies as one pair of hooks. */
export function combineProxies(proxies: ProxyHooks[]): ProxyHooks {
  return {
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
  };
}
