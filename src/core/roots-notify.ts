type Listener = () => void;

const listeners = new Set<Listener>();

/** Called by the proxy of `react-dom/client` right after a root is created, before the app renders into it. */
export function noteRoot() {
  listeners.forEach((listener) => listener());
}

export function onRootCreated(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
