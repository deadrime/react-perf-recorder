# Plugins

Three come with the package: `zustand()` names stores and their actions, `proxyMemoize()` counts memoized selectors'
calls and recomputes, `reactQuery()` turns query cache events into causes. A plugin whose library is not on the page
is left out of the report.

A plugin has two optional halves: build hooks for the dev server and a runtime module for the page.

```ts
import { definePerfRecorderPlugin } from 'react-perf-recorder/vite';

export const myStore = () =>
  definePerfRecorderPlugin({
    name: 'my-store',
    vite: {
      transform(code, id) {
        /* … */
      },
    }, // resolveId / load / transform / config, dev server only
    runtime: { module: '/src/dev/myStorePlugin.ts', options: { verbose: false } },
  });
```

`transform` sees the app's modules. A library's own file — to reach what the libraries on the page do with it —
goes to `transformDep: { filter, transform(code, id) }`: it runs in the dependency optimizer (esbuild before Vite 8,
Rolldown from 8) and on files served from `node_modules` or a linked package. Changing it needs `vite --force` once:
the optimizer keeps its bundle until the lockfile or the config changes.

```ts
// src/dev/myStorePlugin.ts
import { definePlugin } from 'react-perf-recorder/runtime';

export default definePlugin((options: { verbose: boolean }) => ({
  name: 'my-store',
  setup(ctx) {}, // at page boot, before the app
  describe(fn, kind, next) {
    return null; // a label for a store selector or a store
  },
  start(session) {}, // session.emitCause({ type, changes }) queues a cause for the next commit
  commit(session) {}, // after each commit of a recording: find what mounted late; keep it cheap
  stop(session) {
    // active: false when the library is not on the page; the report then leaves the plugin out
    return { version: 1, active: true, highlights: [], metrics: {} };
  },
  conditions() {
    return { account: 'demo' };
  },
}));
```

A cause emitted with `aim: true` after the store told React goes only to the components it updated. A library that
tells React from a timer of its own, as react-query does, lists its packages (`packages: ['@tanstack/query-core']`)
and emits with `waitForTimer: true`: the event waits for that timer and goes to the components it updated;
`merge: key` folds the events of one key into one (`fetch → success ["presence"]`).

Helpers for build halves: `proxyModule` replaces a module for the app's imports only, `findDeclarations` +
`appendLines` name `const X = factory(…)` declarations without shifting lines, `createFilter` matches app files.

**A reselect plugin would be** `proxyModule('reselect')` exporting
`createSelector = instrument(original.createSelector, 'createSelector', 'lastFunction')` from a runtime module with
`createMemoInstrumentation()`, plus `findDeclarations(code, ['createSelector'])` for names — the same shape as the
proxy-memoize plugin.
