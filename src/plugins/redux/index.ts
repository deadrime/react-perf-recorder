import { createFilter } from '../../vite/helpers/filter';
import { appendLines, findDeclarations, ifDeclared } from '../../vite/helpers/name-declarations';
import type { BuildContext, PerfRecorderPlugin } from '../../vite/plugin-api';

export interface ReduxOptions {
  include?: string[];
  exclude?: string[];
  /** Store factories whose results get a name: `export const store = configureStore(...)`. */
  functions?: string[];
}

const RUNTIME = 'react-perf-recorder/plugins/redux/runtime';
/** Where every store made on the page is handed over, also before the runtime has loaded. */
export const STORES_GLOBAL = '__REACT_PERF_RECORDER_REDUX__';
const CREATE = 'function createStore(reducer, preloadedState, enhancer) {';

/**
 * redux's own createStore, rewritten: RTK's configureStore and applyMiddleware end in it, so every store is followed —
 * the app's and a library's. Its dispatch is the one a reducer runs under, after every middleware.
 */
export function registerStores(code: string): string | null {
  if (!code.includes(CREATE) || code.includes('__rprCreateStore')) return null;
  return [
    code.replace(CREATE, 'function __rprCreateStore(reducer, preloadedState, enhancer) {'),
    `const __rprRedux = globalThis.${STORES_GLOBAL} || (globalThis.${STORES_GLOBAL} = { made: [], seen: new WeakSet() });`,
    'function createStore(reducer, preloadedState, enhancer) {',
    '  const store = __rprCreateStore.apply(this, arguments);',
    // An enhancer's store wraps the one it made by calling createStore again, and shares its getState.
    '  if (!store || __rprRedux.seen.has(store.getState)) return store;',
    '  __rprRedux.seen.add(store.getState);',
    '  const dispatch = store.dispatch;',
    '  store.dispatch = function (action) { return __rprRedux.dispatch ? __rprRedux.dispatch(store, dispatch, action) : dispatch(action); };',
    '  const stack = new Error().stack;',
    '  if (__rprRedux.register) __rprRedux.register(store, stack); else __rprRedux.made.push([store, stack]);',
    '  return store;',
    '}',
  ].join('\n');
}

/**
 * Store causes for commits: which action changed which slices of which store; names the store in the `external store`
 * reasons of useSelector.
 */
export function redux(options: ReduxOptions = {}): PerfRecorderPlugin {
  const functions = options.functions ?? ['configureStore', 'createStore', 'legacy_createStore'];
  let context: BuildContext | null = null;
  const root = () => context?.root() ?? process.cwd();
  const filter = createFilter(root, options.include ?? ['src/**/*.{ts,tsx,js,jsx}'], options.exclude);
  return {
    name: 'redux',
    init: (ctx) => void (context = ctx),
    vite: {
      // redux 5 ships dist/redux.mjs (and .browser / .legacy-esm builds), redux 4 es/redux.js.
      transformDep: { filter: /[\\/]redux[\\/](?:dist[\\/]redux(?:\.browser|\.legacy-esm)?\.m?js|es[\\/]redux\.m?js)$/, transform: registerStores },
      transform(code, id) {
        if (!filter(id) || !functions.some((fn) => code.includes(fn))) return null;
        const names = findDeclarations(code, functions, { file: id });
        const out = appendLines(code, [
          `import { nameStore as __rprNameReduxStore } from ${JSON.stringify(RUNTIME)};`,
          ...names.map((name) => ifDeclared(name, `__rprNameReduxStore(${name}, ${JSON.stringify(name)});`)),
        ]);
        return names.length && out ? { code: out, map: null } : null;
      },
    },
    runtime: { module: RUNTIME },
  };
}
