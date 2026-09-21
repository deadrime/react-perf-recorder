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
- **The app's components apart from the packages'** — the file of the element a component rendered says which it
  is, so a UI kit's own components are found without listing their names; the app's own lead the report, the picker
  tree hides package internals and the providers that only hand a context down, each behind a checkbox of its own,
  and an outline is labelled with the app's component rather than the UI-kit wrapper above it.
- **Reasons**
  - `state #2`, `external store #3 [useStore] selectPrice`, `context Theme`, `props: value | same: style, onClick`;
  - `SAME-CONTENT` — a new reference with the same content, almost always a subscription bug rather than new data;
  - hook names instead of numbers, with `[package]` where the app's own hooks hand over to a library:
    `useOrderForm › [react-hook-form] useController › useFormState › State @ src/Form.tsx:48 const { fieldState } = useController(…)`.
- **Per-component reasons**, including renders caused by the parent: `parent: props equal` (memo would skip it),
  `parent: props price | same: style, onClick` (what broke memo).
- **The page load** — recording starts before the first commit, so the mount cascade and everything that follows
  it are in the recording.
- **Renders that changed nothing in the DOM**, and **mounts** — a component declared inside a render or an
  unstable `key` remounts its subtree on every render.
- **Causes** — what scheduled each commit, aimed at the components it actually updated: store actions with the keys
  they changed, query cache events, timers (`core:timer setInterval useCountdown @ src/hooks/useCountdown.ts`),
  socket and worker messages (`core:message WebSocket`), navigations, user input. A store write that marked no work
  is not blamed for a commit another write caused. What none of them explains is
  read off the stack at the moment React is told about the update: `core:effect @ src/hooks/useSync.ts`,
  `core:update onMessage @ src/socket.ts`, `core:update refCallback (package)`.
- **User actions** — clicks, typing (length only; secrets never), keys, scroll. The recording is cut into
  _action → consequences_ segments: renders per typed character, reaction vs background, input latency (Event Timing).
- **An area** — pick a component on the page and record only inside it; renders that come from outside are
  attributed to the component above that started them. While nothing is recorded, renders inside the area are
  outlined live, so the overlay is a permanent x-ray of the part you are working on.
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

| Option       | Default                                                                                  |                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `outDir`     | `REACT_PERF_RECORDER_DIR`, then `.agent-artifacts/perf-recorder`                         | Sessions folder, relative to the root or absolute                                                                                                                                                                  |
| `enabled`    | dev server only, not under Vitest                                                        |                                                                                                                                                                                                                    |
| `maxBytes`   | 64 MB                                                                                    | Largest request, the final recording included                                                                                                                                                                      |
| `retain`     | `{ sessions: 100, bytes: 500 MB }`                                                       | Oldest sessions go first                                                                                                                                                                                           |
| `actions`    | `{ values: false, secretSelector: '[data-rpr-secret]' }`                                 | `values: true` records typed values; passwords and one-time codes never                                                                                                                                            |
| `components` | `{ include: ['src/**/*.{tsx,jsx}'], wrappers: ['memo', 'forwardRef', 'createContext'] }` | Adds `displayName` to `const X = memo(…)` and contexts. Components of packages are found on their own, so `wrapperPattern` is only for the names an app leaves empty: `^(Anonymous\|ForwardRef\|Memo)$` by default |
| `panel`      | `{ corner: 'bottom-left', highlight: true, shortcuts }`                                  | `false` — engine only                                                                                                                                                                                              |
| `engine`     | `{ bigCommit: 150, timelineLimit: 5000, maxDurationMs: 600000, timers: true }`           | `timers: false` leaves `setTimeout`, `setInterval` and `requestAnimationFrame` unwrapped, and timer causes out                                                                                                     |

**The panel.** `● Rec` records, `⟳ Load` reloads the page and records from its first render (the area, the note and
the watched components survive the reload; `?rpr=rec` does the same from a script or a link). `⌖ Area` picks the part
of the page to look at: one click on the page takes the component under the cursor as the area and opens the tree
around it — its parents above, its neighbours and what is inside it — so the area can be moved without picking again.
`↑`/`↓` move it, `→` goes inside, `←` goes up, `Enter` or a click on a row keeps it, `Esc` puts back the area that was
there before. While a recording runs, the panel names the roots leading so far, so what is flashing right
now is readable without stopping. The area's name opens the tree again, `◎` follows a component by name through the
recording (renders and which root pulled it), and `⧉` copies the area as text for an assistant
(component, file and line, the path above it, its DOM, what is inside, the `scope` for scripts). `Note` is saved
with the recording and shown in `list_recordings`. `highlight` outlines renders in the area, both while recording
and between recordings; a recording made with it on says so in its warnings, because drawing costs frame time.

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

| Tool                 |                                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_recordings`    | Newest first, with status, area, commits, renders, the top root                                                                                                                                                                                                   |
| `get_recording`      | `id` (`latest`, `latest-1`), `section`: `summary` (default), `actions`, `roots`, `outside`, `causes`, `components`, `timeline`, `frames`, `plugins`, `plugin:<name>`…; `hooks: 'short'` prints hook chains up to the library API instead of down to the primitive |
| `wait_for_recording` | Blocks until the user finishes a recording (`until: 'done'`) or starts one                                                                                                                                                                                        |
| `compare_recordings` | Before/after: totals, roots, causes, the same actions, plugin metrics; warns when runs differ                                                                                                                                                                     |

The folder comes from `--dir`, then `REACT_PERF_RECORDER_DIR`, then `./.agent-artifacts/perf-recorder`.
`react-perf-recorder list` and `react-perf-recorder pull` do the same from a shell.

## From scripts

The page exposes the engine as `window.__REACT_PERF_RECORDER__.engine`:

```js
const rec = await engine.record(10_000, { source: 'script:my-check', scope: { selector: '[data-testid="orders"]' }, watch: ['OrderRow'] });
rec.id; // saved session id
```

`engine.start()`/`engine.stop()`, `scope: { selector, component?, level? } | { names: [...] }`, `zones`,
`highlight: false` for timing runs. `window.__REACT_PERF_RECORDER__.format` prints reasons and hook chains the way
the panel and the MCP server do (`reasonLine(root, reason, 'short' | 'full')`). Pages without the Vite plugin can load `react-perf-recorder/engine.iife.js` (core only: no plugins, no saving).

## Plugins

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

```ts
// src/dev/myStorePlugin.ts
import { definePlugin } from 'react-perf-recorder/runtime';

export default definePlugin((options: { verbose: boolean }) => ({
  name: 'my-store',
  setup(ctx) {}, // at page boot, before the app
  describe(fn, kind, next) {
    return null;
  }, // a label for a store selector or a store
  start(session) {}, // session.emitCause({ type, changes }) queues a cause for the next commit
  stop(session) {
    return { version: 1, highlights: [], metrics: {} };
  },
  conditions() {
    return { account: 'demo' };
  },
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
- A component that rendered while its parent handed it the same props (`children` passed through, equal props to
  `memo`) is a root of its own: the parent did not cause that render.
- Timers are wrapped once at page boot, so intervals started on mount are seen too; a callback becomes a cause only
  when React marked new work during it, and the cause goes to the components that work belongs to.
- The app's `react-dom/client` is proxied so the recorder learns about a root the moment `createRoot` returns —
  that is what makes recording from the page load possible.
- The overlay skips elements the person cannot see (`checkVisibility`): a closed menu or popover still renders, and
  its renders are in the recording, but its boxes would pile up unpositioned in a corner.
- The panel is state plus a preact view in a shadow root on `<html>` (bundled into the client, ~20 KB of the dev
  bundle), never the app's React: moving the area patches the rows instead of rebuilding them, and the app's React
  never learns the tool exists.
- Store and memoizer plugins replace `zustand`, `proxy-memoize` for the app's imports only, so libraries keep the
  originals and memoization behaves exactly the same.

## Limits

- React 18 dev builds; React 19 is best effort.
- Store writes that did not lead to a commit in the area are not recorded — there is no store journal by design.
- Two timers that update the same component between commits are attributed to the first of them.
- `export default memo(() => …)` without a `const`, nested `memo`, zustand v5 selectors are not named.
- StrictMode doubles render-time selector calls.
- Hook names re-run the component: side effects in render run once more.

## Working on it

`npm test` runs the unit tests, `npm run test:e2e` the browser ones. They run against the fixture app in
`test/e2e/fixture-app`, which doubles as the demo: a small team chat with a store, a live feed and a composer, and
thirteen seeded re-render bugs, one per page (`/bug/whole-object`), with `/app` as the same app with none of them,
and eleven textbook mistakes on bare pages of their own (`/basics/memo`, `/basics/keys`, `/basics/subscriptions` …),
each showing the broken and the fixed version of one widget side by side, with the renders and the mounts counted on
every row. `/` lists them as cards that say what to do on the page and what the recording should name, so a recording can
be checked against a known cause and against a clean run. It needs a dev server because the Vite plugin is half of
what is under test — it injects the recorder, names the components, proxies `react-dom/client` and the stores, and
stores the sessions.

`npm run fixture` opens it by hand on http://localhost:5391, which is also the quickest way to try a change to the
panel. Playwright starts its own copy of that server, so stop this one before running the e2e suite — the port is
taken.

## License

MIT
