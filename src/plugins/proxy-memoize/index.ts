import { createFilter, relativeToRoot } from '../../vite/helpers/filter';
import { appendLines, findDeclarations, ifDeclared } from '../../vite/helpers/name-declarations';
import { proxyModule } from '../../vite/helpers/proxy-module';
import type { BuildContext, PerfRecorderPlugin } from '../../vite/plugin-api';

export interface ProxyMemoizeOptions {
  /** Exports of the module that create memoized functions. */
  functions?: string[];
  module?: string;
  include?: string[];
  exclude?: string[];
}

const RUNTIME = 'react-perf-recorder/plugins/proxy-memoize/runtime';

/**
 * Names memoized selectors and counts their calls and recomputes: `memoizeWithArgs` keeps one entry by default, and
 * rows or cells that call it with different arguments evict each other on every store update.
 */
export function proxyMemoize(options: ProxyMemoizeOptions = {}): PerfRecorderPlugin {
  const functions = options.functions ?? ['memoize', 'memoizeWithArgs'];
  const source = options.module ?? 'proxy-memoize';
  let context: BuildContext | null = null;
  const root = () => context?.root() ?? process.cwd();
  const filter = createFilter(root, options.include ?? ['src/**/*.{ts,tsx,js,jsx}'], options.exclude);
  const proxy = proxyModule('proxy-memoize', {
    source,
    importer: filter,
    code: () =>
      [
        `import * as original from ${JSON.stringify(source)};`,
        `import { instrument } from ${JSON.stringify(RUNTIME)};`,
        `export * from ${JSON.stringify(source)};`,
        ...functions.map((fn) => `export const ${fn} = instrument(original.${fn}, ${JSON.stringify(fn)}, 0);`),
      ].join('\n'),
  });
  return {
    name: 'proxy-memoize',
    init: (ctx) => void (context = ctx),
    vite: {
      config: () => ({ optimizeDeps: { include: [source] } }),
      resolveId: (id, importer) => proxy.resolveId(id, importer),
      load: (id) => proxy.load(id),
      transform(code, id) {
        if (!filter(id) || !functions.some((fn) => code.includes(fn))) return null;
        const names = findDeclarations(code, functions, { file: id });
        const file = relativeToRoot(root(), id);
        const out = appendLines(code, [
          `import { nameMemoized as __rprNameMemoized } from ${JSON.stringify(RUNTIME)};`,
          ...names.map((name) => ifDeclared(name, `__rprNameMemoized(${name}, ${JSON.stringify(name)}, ${JSON.stringify(file)});`)),
        ]);
        return names.length && out ? { code: out, map: null } : null;
      },
    },
    runtime: { module: RUNTIME },
  };
}
