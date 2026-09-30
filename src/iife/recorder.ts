import { boot, type ClientConfig } from '../client';
import { captureRenderers, isDevOverlay, type FiberRoot } from '../core/fiber';
import { noteRoot } from '../core/roots-notify';
import reactQuery from '../plugins/react-query/runtime';
import redux from '../plugins/redux/runtime';
import zustand from '../plugins/zustand/runtime';
import { INJECT_KEY, type InjectConfig } from '../shared/inject';
import { GLOBAL_KEY } from '../shared/schema';

declare const __VERSION__: string;

type Hook = {
  inject?: (renderer: unknown) => number;
  onScheduleFiberRoot?: (id: number, root: FiberRoot, children: unknown) => void;
  onCommitFiberRoot?: (id: number, root: FiberRoot, ...rest: unknown[]) => void;
};

/**
 * record_page puts this in front of every script of a page whose dev server has no Vite plugin. It stands aside
 * when the plugin's own recorder is on the page after all (a demo build has no health endpoint to ask): the
 * plugin's boot would otherwise find this one and keep it, panel and store plugins lost.
 */
function install() {
  const target = window as unknown as Record<string, unknown>;
  const given = (target[INJECT_KEY] ??= {}) as Partial<InjectConfig>;
  // The hook must be there before react-dom loads, or React keeps no updater sets and no renderer to name hooks.
  captureRenderers();
  const hook = (target.__REACT_DEVTOOLS_GLOBAL_HOOK__ ?? {}) as Hook;
  let state: 'waiting' | 'booted' | 'aside' = 'waiting';
  const settle = () => {
    if (state !== 'waiting') return;
    if (target[GLOBAL_KEY]) {
      state = given.state = 'aside';
      return;
    }
    state = given.state = 'booted';
    const config: ClientConfig = {
      version: typeof __VERSION__ === 'string' ? __VERSION__ : 'dev',
      projectRoot: given.projectRoot ?? '',
      wrapperPattern: '^(Anonymous|ForwardRef|Memo)$',
      actions: { values: false, secretSelector: '[data-rpr-secret]' },
      maxDurationMs: 10 * 60_000,
      bigCommit: 150,
      timelineLimit: 5000,
      timers: true,
      // The page profiles itself only with a Document-Policy header; record_page profiles through CDP instead.
      cpu: false,
      // record_page saves the recording from outside the page.
      endpoint: null,
      panel: false,
    };
    boot(config, [
      [zustand, { devtools: true, untracked: true }],
      [redux, null],
      [reactQuery, null],
    ]);
  };
  // The plugin's entry runs ahead of the app's modules, so by the time react-dom registers it has booted or never will.
  const inject = hook.inject;
  if (typeof inject === 'function')
    hook.inject = Object.assign(function (this: unknown, renderer: unknown) {
      settle();
      return inject.call(this, renderer);
    }, inject);
  // No proxy of react-dom/client tells of a new root: React tells the DevTools hook as the root is first rendered,
  // and of a hydrated one (hydrateRoot(document) in Next.js) only once it has committed.
  const seen = new WeakSet<FiberRoot>();
  const note = (root: FiberRoot | undefined) => {
    if (state !== 'booted' || !root || seen.has(root)) return;
    // An overlay's container may not be in its portal yet when its root first renders: its commit tells.
    if (!(root.containerInfo as Node | undefined)?.isConnected) return;
    seen.add(root);
    if (!isDevOverlay(root.containerInfo as Node)) noteRoot({ _internalRoot: root });
  };
  const schedule = hook.onScheduleFiberRoot;
  hook.onScheduleFiberRoot = function (this: unknown, id, root, children) {
    note(root);
    return schedule?.call(this, id, root, children);
  };
  const commit = hook.onCommitFiberRoot;
  hook.onCommitFiberRoot = function (this: unknown, id, root, ...rest) {
    note(root);
    return commit?.call(this, id, root, ...rest);
  };
  // React marks a root's container just before it listens there for events, and hydrateRoot tells the hook nothing
  // until it commits: a recording from the load would start after the hydration it is about.
  const listen = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    ...rest: [EventListenerOrEventListenerObject | null, (boolean | AddEventListenerOptions)?]
  ) {
    if (type === 'click' && state === 'booted' && this) {
      const key = Object.keys(this).find((k) => k.startsWith('__reactContainer$'));
      const fiber = key ? (this as unknown as Record<string, { stateNode?: FiberRoot } | undefined>)[key] : undefined;
      if (fiber?.stateNode) note(fiber.stateNode);
    }
    return listen.call(this, type, ...rest);
  };
  // A page with no React on it still gets an engine, so record_page can say so rather than wait for one.
  window.addEventListener('load', settle, { once: true });
}

if (window.top === window && !(window as unknown as Record<string, unknown>)[GLOBAL_KEY]) install();
