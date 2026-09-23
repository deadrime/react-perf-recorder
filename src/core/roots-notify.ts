import { registerRoot, type FiberRoot } from './fiber';

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Called by the proxy of `react-dom/client` right after a root is created, before the app renders into it, with the
 * root itself: it is found wherever the app mounted it, not only where a search of the page would look.
 */
export function noteRoot(root?: { _internalRoot?: FiberRoot | null }) {
  if (root?._internalRoot) registerRoot(root._internalRoot);
  listeners.forEach((listener) => listener());
}

export function onRootCreated(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
