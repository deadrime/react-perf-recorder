# react-perf-recorder

Record why a React app re-renders, from the page itself: press **Rec**, use the app, press **Stop**. The recording
names the component that started each render cascade and why it rendered — the hook (with the custom hooks around
it and the line of code), the store action and the keys it changed, the props that broke `memo`, the context that
changed. Sessions land in a folder, and an agent reads them through an MCP server.

Think of it as [react-grab](https://github.com/aidenybai/react-grab) for re-renders, with the overlay idea of
[react-scan](https://github.com/aidenybai/react-scan). It runs only in the Vite dev server and never ships to a build.

## What it records

- **Cascade roots** — a component that rendered while its parent did not: where a render started, how many renders
  it pulled (`perHit`), how many instances fired at once.
- **Reasons**
  - `state #2`, `external store #3 [useStore] selectPrice`, `context Theme`, `props: value | same: style, onClick`;
  - `SAME-CONTENT` — a new reference with the same content, almost always a subscription bug rather than new data;
  - hook names instead of numbers: `useOrderForm › useController › useFormState › State @ src/Form.tsx:48 const { fieldState } = useController(…)`.
- **Per-component reasons**, including renders caused by the parent: `parent: props equal` (memo would skip it),
  `parent: props price | same: style, onClick` (what broke memo).
- **Renders that changed nothing in the DOM**.
- **Causes** — what happened before each commit: store actions with the keys they changed, query cache events,
  navigations, user input.
- **User actions** — clicks, typing (length only; secrets never), keys, scroll. The recording is cut into
  *action → consequences* segments: renders per typed character, reaction vs background, input latency (Event Timing).
- **An area** — pick a component on the page and record only inside it; renders that come from outside are
  attributed to the component above that started them.
- Long animation frames with their scripts, lanes of each commit, memoized selectors' calls and recomputes.

## Install

```sh
npm i -D -E react-perf-recorder
```

```ts
// vite.config.ts
import { perfRecorder } from 'react-perf-recorder/vite';
import { zustand } from 'react-perf-recorder/plugins/zustand';
import { proxyMemoize } from 'react-perf-recorder/plugins/proxy-memoize';
import { reactQuery } from 'react-perf-recorder/plugins/react-query';

export default defineConfig({
  plugins: [
    react(),
    perfRecorder({
      plugins: [zustand(), proxyMemoize({ functions: ['memoize', 'memoizeWithArgs'] }), reactQuery()],
    }),
  ],
});
```

Open the dev page. The panel sits in a corner; **Alt+Shift+R** starts and stops a recording, **Alt+Shift+S**
picks an area. In automated browsers (`navigator.webdriver`) the panel is hidden unless the URL has `?rpr=panel`.

### Options

| Option | Default | |
| --- | --- | --- |
| `outDir` | `REACT_PERF_RECORDER_DIR`, then `.agent-artifacts/perf-recorder` | Sessions folder, relative to the root or absolute |
| `enabled` | dev server only, not under Vitest | |
| `maxBytes` | 64 MB | Largest request, the final recording included |
| `retain` | `{ sessions: 100, bytes: 500 MB }` | Oldest sessions go first |
| `actions` | `{ values: false, secretSelector: '[data-rpr-secret]' }` | `values: true` records typed values; passwords and one-time codes never |
| `components` | `{ include: ['src/**/*.{tsx,jsx}'], wrappers: ['memo', 'forwardRef', 'createContext'] }` | Adds `displayName` to `const X = memo(…)` and contexts; `wrapperPattern` hides UI-kit wrappers from paths |
| `panel` | `{ corner: 'bottom-left', highlight: true, shortcuts }` | `false` — engine only |
| `engine` | `{ bigCommit: 150, timelineLimit: 5000, maxDurationMs: 600000 }` | |

## Sessions

`<outDir>/<id>/`:

- `session.json` — `status: recording | done | interrupted`, page, area, conditions;
- `events.ndjson` — streamed while recording, every ~2 s: commits, actions, frames;
- `recording.json` — written on Stop: the full recording (`schema: react-perf-recorder/recording`, `version: 1`).

A session whose page reloads or closes mid-recording stays readable: the MCP server rebuilds a partial recording
from its events.

## MCP server

```json
{ "mcpServers": { "react-perf-recorder": { "command": "node", "args": ["node_modules/react-perf-recorder/dist/cli.js", "mcp"] } } }
```

| Tool | |
| --- | --- |
| `list_recordings` | Newest first, with status, area, commits, renders, the top root |
| `get_recording` | `id` (`latest`, `latest-1`), `section`: `summary` (default), `actions`, `roots`, `outside`, `causes`, `components`, `timeline`, `frames`, `plugins`, `plugin:<name>`… |
| `wait_for_recording` | Blocks until the user finishes a recording (`until: 'done'`) or starts one |
| `compare_recordings` | Before/after: totals, roots, causes, the same actions, plugin metrics; warns when runs differ |

The folder comes from `--dir`, then `REACT_PERF_RECORDER_DIR`, then `./.agent-artifacts/perf-recorder`.
`react-perf-recorder list` and `react-perf-recorder pull` do the same from a shell.

## From scripts

The page exposes the engine as `window.__REACT_PERF_RECORDER__.engine`:

```js
const rec = await engine.record(10_000, { source: 'script:my-check', scope: { selector: '[data-testid="orders"]' }, watch: ['OrderRow'] });
rec.id; // saved session id
```

`engine.start()`/`engine.stop()`, `scope: { selector, component?, level? }`, `zones`, `highlight: false` for timing
runs. Pages without the Vite plugin can load `react-perf-recorder/engine.iife.js` (core only: no plugins, no saving).

## Plugins

A plugin has two optional halves: build hooks for the dev server and a runtime module for the page.

```ts
import { definePerfRecorderPlugin } from 'react-perf-recorder/vite';

export const myStore = () =>
  definePerfRecorderPlugin({
    name: 'my-store',
    vite: { transform(code, id) { /* … */ } }, // resolveId / load / transform / config, dev server only
    runtime: { module: '/src/dev/myStorePlugin.ts', options: { verbose: false } },
  });
```

```ts
// src/dev/myStorePlugin.ts
import { definePlugin } from 'react-perf-recorder/runtime';

export default definePlugin((options: { verbose: boolean }) => ({
  name: 'my-store',
  setup(ctx) {},                            // at page boot, before the app
  describe(fn, kind, next) { return null }, // a label for a store selector or a store
  start(session) {},                        // session.emitCause({ type, changes }) queues a cause for the next commit
  stop(session) { return { version: 1, highlights: [], metrics: {} } },
  conditions() { return { account: 'demo' } },
}));
```

Helpers for build halves: `proxyModule` replaces a module for the app's imports only, `findDeclarations` +
`appendLines` name `const X = factory(…)` declarations without shifting lines, `createFilter` matches app files.

**A reselect plugin would be:** `proxyModule('reselect')` exporting
`createSelector = instrument(original.createSelector, 'createSelector', 'lastFunction')` from a runtime module with
`createMemoInstrumentation()`, plus `findDeclarations(code, ['createSelector'])` for names — the same shape as the
proxy-memoize plugin.

## How it works

- Commits are caught by a setter on `FiberRoot.current`: React 18 assigns it once per commit. The DevTools hook is
  left to its owners (react-grab, React DevTools).
- A fiber rendered when its props, hook list or context dependency list changed since the last commit it was seen
  in; untouched subtrees (`child === alternate.child`) are skipped.
- Hook names come from re-running the component with a stand-in dispatcher, as React DevTools does — only on Stop,
  only for components in the report, never inside a commit.
- Store and memoizer plugins replace `zustand`, `proxy-memoize` for the app's imports only, so libraries keep the
  originals and memoization behaves exactly the same.

## Limits

- React 18 dev builds; React 19 is best effort.
- Store writes that did not lead to a commit in the area are not recorded — there is no store journal by design.
- `export default memo(() => …)` without a `const`, nested `memo`, zustand v5 selectors are not named.
- StrictMode doubles render-time selector calls.
- Hook names re-run the component: side effects in render run once more.

## License

MIT
