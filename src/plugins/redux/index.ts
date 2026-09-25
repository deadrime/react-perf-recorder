import { createFilter } from '../../vite/helpers/filter';
import { nameStoresTransform } from '../../vite/helpers/name-declarations';
import type { BuildContext, PerfRecorderPlugin } from '../../vite/plugin-api';
import { handOverCode, REDUX_GLOBAL } from '../store-shared';

export interface ReduxOptions {
  include?: string[];
  exclude?: string[];
  /** Store factories whose results get a name: `export const store = configureStore(...)`. */
  functions?: string[];
}

const RUNTIME = 'react-perf-recorder/plugins/redux/runtime';
const CREATE = 'function createStore(reducer, preloadedState, enhancer) {';

/**
 * redux's own createStore, rewritten: RTK's configureStore and applyMiddleware end in it, so every store is followed —
 * the app's and a library's. Its dispatch is the one a reducer runs under, after every middleware.
 */
export function registerStores(code: string): string | null {
  if (!code.includes(CREATE) || code.includes('__rprCreateStore')) return null;
  const { declare, handOver } = handOverCode(REDUX_GLOBAL);
  return [
    code.replace(CREATE, 'function __rprCreateStore(reducer, preloadedState, enhancer) {'),
    declare,
    'const __rprSeen = new WeakSet();',
    'function createStore(reducer, preloadedState, enhancer) {',
    '  const store = __rprCreateStore.apply(this, arguments);',
    // An enhancer's store wraps the one it made by calling createStore again, and shares its getState.
    '  if (!store || __rprSeen.has(store.getState)) return store;',
    '  __rprSeen.add(store.getState);',
    '  const dispatch = store.dispatch;',
    '  store.dispatch = function (action) { return __rprHook.dispatch ? __rprHook.dispatch(store, dispatch, action) : dispatch(action); };',
    `  ${handOver('store')}`,
    '  return store;',
    '}',
  ].join('\n');
}

const USE_SELECTOR = 'const selectedState = useSyncExternalStoreWithSelector(';
const CONNECT = 'let actualChildProps;';

/**
 * react-redux, told to the runtime as it renders: the app's selector behind useSelector's wrapper, and the store and
 * mapStateToProps behind the getSnapshot a `connect` hands useSyncExternalStore.
 */
export function followSelectors(code: string): string | null {
  if (!(code.includes(USE_SELECTOR) || code.includes(CONNECT)) || code.includes('__rprHook')) return null;
  return [
    code
      .replace(USE_SELECTOR, `if (__rprHook.selector) __rprHook.selector(wrappedSelector, selector);\n${USE_SELECTOR}`)
      .replace(CONNECT, `if (__rprHook.snapshot) __rprHook.snapshot(actualChildPropsSelector, store, mapStateToProps);\n${CONNECT}`),
    handOverCode(REDUX_GLOBAL).declare,
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
      // redux 5 ships dist/redux.mjs (and .browser / .legacy-esm builds), redux 4 es/redux.js; react-redux 9 dist/react-redux.mjs.
      transformDep: {
        filter:
          /[\\/](?:redux[\\/](?:dist[\\/]redux(?:\.browser|\.legacy-esm)?\.m?js|es[\\/]redux\.m?js)|react-redux[\\/]dist[\\/]react-redux(?:\.legacy-esm)?\.m?js)$/,
        transform: (code) => registerStores(code) ?? followSelectors(code),
      },
      transform: nameStoresTransform(filter, functions, RUNTIME, '__rprNameReduxStore'),
    },
    runtime: { module: RUNTIME },
  };
}
