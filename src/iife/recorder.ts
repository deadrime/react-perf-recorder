import { boot, type ClientConfig } from '../client';
import { captureRenderers, type FiberRoot } from '../core/fiber';
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
  // No proxy of react-dom/client tells of a new root: React tells the DevTools hook as the root is first rendered.
  const seen = new WeakSet<FiberRoot>();
  const schedule = hook.onScheduleFiberRoot;
  hook.onScheduleFiberRoot = function (this: unknown, id, root, children) {
    if (state === 'booted' && root && !seen.has(root)) {
      seen.add(root);
      noteRoot({ _internalRoot: root });
    }
    return schedule?.call(this, id, root, children);
  };
  // A page with no React on it still gets an engine, so record_page can say so rather than wait for one.
  window.addEventListener('load', settle, { once: true });
}

if (window.top === window && !(window as unknown as Record<string, unknown>)[GLOBAL_KEY]) install();
