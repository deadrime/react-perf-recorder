import { libraryOf, parseStack } from '../core/stack';

/** Where a store library hands every store it makes over to its runtime, also before the runtime has loaded. */
export const ZUSTAND_GLOBAL = '__REACT_PERF_RECORDER_ZUSTAND__';
export const REDUX_GLOBAL = '__REACT_PERF_RECORDER_REDUX__';

/** Code for a store library's own module: each store goes to the runtime, or waits in `made` until the runtime loads. */
export const handOverCode = (global: string) => ({
  declare: `const __rprHook = globalThis.${global} || (globalThis.${global} = { made: [] });`,
  handOver: (store: string) =>
    `if (__rprHook.register) __rprHook.register(${store}, new Error()); else __rprHook.made.push([${store}, new Error()]);`,
});

/** The runtime's end of `handOverCode`: the stores made so far, then each one as it is made. */
export function receiveStores(global: string, register: (store: unknown, made: Error) => void) {
  const hook = ((globalThis as Record<string, any>)[global] ??= { made: [] }) as {
    made: Array<[unknown, Error]>;
    register?: typeof register;
  };
  hook.register = register;
  hook.made.splice(0).forEach(([store, made]) => register(store, made));
  return hook as typeof hook & Record<string, unknown>;
}

/**
 * The package that made a store, from the stack taken where the store library made it: `@xyflow/react` for
 * `.vite/deps/@xyflow_react.js`. `own` are the store library's packages, passed over on the way down.
 */
export function storeOrigin(stack: string | undefined, own: string[]): string | null {
  for (const { url } of parseStack(stack ?? '')) {
    const pkg = libraryOf(url);
    // The app's code, or a linked package served by its path: the store is theirs, and the declaration names it.
    if (pkg === null) return null;
    if (pkg && pkg !== 'react-perf-recorder' && !own.includes(pkg)) return pkg;
  }
  return null;
}

/** Store names by `getState`: the app's declaration, else the package that made it (`@xyflow/react#1`), else `store1`. */
export class StoreNames {
  private names = new WeakMap<Function, string>();
  // The stack is formatted only for a store that needs a name: xyflow makes one per node.
  private made = new WeakMap<Function, Error>();
  private count = 0;

  constructor(private own: string[]) {}

  madeAt(getState: Function, made: Error | undefined) {
    if (made) this.made.set(getState, made);
  }

  set(getState: Function, name: string) {
    this.names.set(getState, name);
  }

  get(getState: Function) {
    let name = this.names.get(getState);
    if (!name) {
      const origin = storeOrigin(this.made.get(getState)?.stack, this.own);
      name = origin ? `${origin}#${++this.count}` : `store${++this.count}`;
      this.names.set(getState, name);
    }
    return name;
  }
}

const MAX_KEYS = 40;

/** The top-level keys a write changed — a store's slices — with the values either side, for the cause of a commit. */
export function changedKeys(prev: unknown, next: unknown) {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return [{ key: '(state)', prev, next }];
  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const out: Array<{ key: string; prev: unknown; next: unknown }> = [];
  for (const key of Object.keys(b)) if (a[key] !== b[key] && out.length < MAX_KEYS) out.push({ key, prev: a[key], next: b[key] });
  return out;
}
