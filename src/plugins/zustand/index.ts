import { createFilter } from '../../vite/helpers/filter';
import { nameStoresTransform } from '../../vite/helpers/name-declarations';
import { combineProxies, proxyModule } from '../../vite/helpers/proxy-module';
import type { BuildContext, PerfRecorderPlugin } from '../../vite/plugin-api';
import { handOverCode, ZUSTAND_GLOBAL } from '../store-shared';

export interface ZustandOptions {
  include?: string[];
  exclude?: string[];
  /** Store factories whose results get a name: `export const useStore = create(...)`, `createWithEqualityFn(...)`. */
  functions?: string[];
  /** Stand in for the Redux DevTools extension to read action names; a real extension still gets everything. */
  devtools?: boolean;
}

const RUNTIME = 'react-perf-recorder/plugins/zustand/runtime';
const IMPL = 'const createStoreImpl = ';

/**
 * `create`, `createWithEqualityFn` and `createStore` all end in `createStoreImpl` of zustand/vanilla (v4 and v5), so
 * a store made inside a library — xyflow's, one per component — is followed too, not only those the app imports.
 */
export function registerStores(code: string): string | null {
  if (!code.includes(IMPL) || code.includes('__rprCreateStoreImpl')) return null;
  const { declare, handOver } = handOverCode(ZUSTAND_GLOBAL);
  return [
    code.replace(IMPL, 'const __rprCreateStoreImpl = '),
    declare,
    'const createStoreImpl = (createState) => {',
    '  const api = __rprCreateStoreImpl(createState);',
    `  ${handOver('api')}`,
    '  return api;',
    '};',
  ].join('\n');
}

/**
 * Store causes for commits: which action wrote to which store and which top-level keys it changed (with the same
 * content or not); labels `useShallow(selector)` and the store in `external store` reasons.
 */
export function zustand(options: ZustandOptions = {}): PerfRecorderPlugin {
  const functions = options.functions ?? ['create', 'createStore', 'createWithEqualityFn'];
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
    // v5 also exports `useShallow` from here, and keeps the store with an equality function in `traditional`.
    wrap('zustand/shallow', ['export const useShallow = rpr.wrapUseShallow(original.useShallow);', 'export default original.default;']),
    wrap('zustand/traditional', ['export const createWithEqualityFn = rpr.wrapCreate(original.createWithEqualityFn);']),
  ]);
  return {
    name: 'zustand',
    init: (ctx) => void (context = ctx),
    vite: {
      config: () => ({ optimizeDeps: { include: ['zustand', 'zustand/vanilla', 'zustand/react/shallow'] } }),
      transformDep: { filter: /[\\/]zustand[\\/]esm[\\/]vanilla\.mjs$/, transform: registerStores },
      resolveId: (id, importer) => proxies.resolveId(id, importer),
      load: (id) => proxies.load(id),
      transform: nameStoresTransform(filter, functions, RUNTIME, '__rprNameStore'),
    },
    runtime: { module: RUNTIME, options: { devtools: options.devtools ?? true } },
  };
}
