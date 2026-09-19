// Like a dev page with react-grab: a DevTools hook exists before react-dom loads, so renderers are registered.
const renderers = new Map<number, unknown>();
(globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  renderers,
  supportsFiber: true,
  inject(renderer: unknown) {
    renderers.set(renderers.size + 1, renderer);
    return renderers.size;
  },
  onCommitFiberRoot() {},
  onCommitFiberUnmount() {},
  onPostCommitFiberRoot() {},
  checkDCE() {},
};
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
