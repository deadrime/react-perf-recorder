import { createFilter } from '../../vite/helpers/filter';
import { appendLines, findDeclarations } from '../../vite/helpers/name-declarations';
import { combineProxies, proxyModule } from '../../vite/helpers/proxy-module';
import type { BuildContext, PerfRecorderPlugin } from '../../vite/plugin-api';

export interface ZustandOptions {
  include?: string[];
  exclude?: string[];
  /** Store factories whose results get a name: `export const useStore = create(...)`. */
  functions?: string[];
  /** Stand in for the Redux DevTools extension to read action names; a real extension still gets everything. */
  devtools?: boolean;
}

const RUNTIME = 'react-perf-recorder/plugins/zustand/runtime';

/**
 * Store causes for commits: which action wrote to which store and which top-level keys it changed (with the same
 * content or not); labels `useShallow(selector)` and the store in `external store` reasons.
 */
export function zustand(options: ZustandOptions = {}): PerfRecorderPlugin {
  const functions = options.functions ?? ['create', 'createStore'];
  let context: BuildContext | null = null;
  const root = () => context?.root() ?? process.cwd();
  const filter = createFilter(root, options.include ?? ['src/**/*.{ts,tsx,js,jsx}'], options.exclude);
  const wrap = (source: string, lines: string[]) =>
    proxyModule('zustand', {
      source,
      importer: filter,
      code: () =>
        [
          `import * as original from ${JSON.stringify(source)};`,
          `import * as rpr from ${JSON.stringify(RUNTIME)};`,
          `export * from ${JSON.stringify(source)};`,
          ...lines,
        ].join('\n'),
    });
  const proxies = combineProxies([
    wrap('zustand', [
      'export const create = rpr.wrapCreate(original.create);',
      'export const createStore = rpr.wrapCreate(original.createStore);',
      'export default original.default;',
    ]),
    wrap('zustand/vanilla', ['export const createStore = rpr.wrapCreate(original.createStore);', 'export default original.default;']),
    wrap('zustand/react/shallow', ['export const useShallow = rpr.wrapUseShallow(original.useShallow);']),
  ]);
  return {
    name: 'zustand',
    init: (ctx) => void (context = ctx),
    vite: {
      config: () => ({ optimizeDeps: { include: ['zustand', 'zustand/vanilla', 'zustand/react/shallow'] } }),
      resolveId: (id, importer) => proxies.resolveId(id, importer),
      load: (id) => proxies.load(id),
      transform(code, id) {
        if (!filter(id) || !functions.some((fn) => code.includes(fn))) return null;
        const names = findDeclarations(code, functions);
        const out = appendLines(code, [
          `import { nameStore as __rprNameStore } from ${JSON.stringify(RUNTIME)};`,
          ...names.map((name) => `__rprNameStore(${name}, ${JSON.stringify(name)});`),
        ]);
        return names.length && out ? { code: out, map: null } : null;
      },
    },
    runtime: { module: RUNTIME, options: { devtools: options.devtools ?? true } },
  };
}
