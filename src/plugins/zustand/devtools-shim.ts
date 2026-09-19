type Send = (action: unknown, state: unknown) => void;

interface Connection {
  init?(...args: unknown[]): unknown;
  send?(action: unknown, state: unknown): unknown;
  subscribe?(listener: unknown): unknown;
  unsubscribe?(): unknown;
  error?(message: unknown): unknown;
}

type Extension = ((...args: unknown[]) => unknown) & { connect?(options?: unknown): Connection | undefined };

const KEY = '__REDUX_DEVTOOLS_EXTENSION__';

/**
 * zustand's devtools middleware sends every named `set()` to the Redux DevTools extension. The shim stands in for it
 * to read action names; a real extension, even one injected later, still receives everything. The shim is callable
 * like the extension's store enhancer, so legacy Redux code keeps working.
 */
export function installDevtoolsShim(onSend: Send) {
  const target = window as unknown as Record<string, unknown>;
  const existing = Object.getOwnPropertyDescriptor(target, KEY);
  if (existing?.get && (existing.get as { rpr?: boolean }).rpr) return;
  let real = (target[KEY] as Extension | undefined) ?? undefined;
  const shim: Extension = Object.assign((...args: unknown[]) => (real ? real(...args) : (next: unknown) => next), {
    connect(options?: unknown): Connection {
      const connection = real?.connect?.(options);
      return {
        init: (...args) => connection?.init?.(...args),
        subscribe: (listener) => connection?.subscribe?.(listener) ?? (() => {}),
        unsubscribe: () => connection?.unsubscribe?.(),
        error: (message) => connection?.error?.(message),
        send(action, state) {
          try {
            onSend(action, state);
          } catch {
            // Reading the action must never break the store.
          }
          return connection?.send?.(action, state);
        },
      };
    },
  });
  const get = Object.assign(() => shim, { rpr: true });
  Object.defineProperty(target, KEY, {
    configurable: true,
    enumerable: false,
    get,
    set(value: Extension) {
      if (value !== shim) real = value;
    },
  });
}
