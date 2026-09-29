# MCP server, CLI and scripts

## MCP server

`npx react-perf-recorder init-claude` registers it in `.mcp.json` (with a skill and an agent in `.claude/`; `--force`
overwrites them). By hand:

```json
{ "mcpServers": { "react-perf-recorder": { "command": "node", "args": ["node_modules/react-perf-recorder/dist/cli.js", "mcp"] } } }
```

Tools: `wait_for_recording`, `record_page`, `get_recording`, `compare_recordings`, `list_recordings`. Each says in
its own description when to use it and what it takes; an MCP client shows it.

The sessions folder comes from `--dir`, then `REACT_PERF_RECORDER_DIR`, then `./.agent-artifacts/perf-recorder`.

`record_page` needs the dev server running and `playwright` installed in the project — it is never a dependency of
this package. A browser of the machine's own — a CI image, a sandbox with a preinstalled Chromium of another
version — is picked by `REACT_PERF_RECORDER_BROWSER=/path/to/chromium`, else the newest Chromium under
`PLAYWRIGHT_BROWSERS_PATH`.

Without the Vite plugin on the dev server (`record_page` asks it at `<base>/__react-perf-recorder/health`),
`record_page` puts the recorder into the page itself before the page's first script, maps the positions through the
source maps the page loaded and saves the recording from the MCP server. The answer says `recorder: "injected"`,
the recording's conditions carry it, and a warning lists what such a recording lacks: `memo` components written as
arrow functions show as `Anonymous`, zustand stores without the `devtools` middleware have no store or action names,
proxy-memoize is not seen. `inject: 'never'` records only through the plugin; `root` is the app's folder when it is
not the working directory. With the plugin, nothing changes: nothing is put into the page.

This works on a dev server of any bundler that serves the page's scripts with source maps: checked on Vite, webpack 5
and Rsbuild. A chunk holds modules of the app and of packages alike, so the page is told whose code each of its lines
is as the chunk loads. webpack's development default, `devtool: 'eval'`, gives no maps: the line of a hook or an
element is found by what the transformed code calls there, in the module's file on disk.

A page behind a sign-in: `record_page` through a signing link, else a session saved once by
`react-perf-recorder login <url>`, else a browser you already have open (`cdp`).

`record_page` with `cpu: true` also profiles the page's JS through CDP, every 0.5 ms (`cpu: { intervalUs }` changes
it, `cpu: { raw: true }` keeps `cpu.cpuprofile` beside the recording for DevTools). `get_recording` reads it with
`section: 'cpu'`, and the summary has one line of it. The profiler starts before the page load for `fromLoad` and
right before the recording otherwise, and stops before the garbage is collected. Throttling and the sampling
interval go into the recording's conditions, so `compare_recordings` says when two runs differ in them. A replay of a
profiled recording is profiled too.

## CLI

```text
react-perf-recorder mcp            MCP server over stdio  [--reload: restart when the CLI is rebuilt]
react-perf-recorder list           sessions, newest first  [--limit 20]
react-perf-recorder show [id]      one session  [--section summary|roots|components|…] [--top 10]
react-perf-recorder pull           wait for the next finished recording and print its summary
react-perf-recorder record <url>   record a page  [--ms] [--scope] [--watch] [--script] [--from-load] [--cpu] [--via] …
react-perf-recorder login <url>    keep a signed-in session for later recordings
react-perf-recorder init-claude    copy the skill and the agent, register the MCP server  [--force]
```

## From scripts

The page exposes the engine as `window.__REACT_PERF_RECORDER__.engine`:

```js
const rec = await engine.record(10_000, { source: 'script:my-check', scope: { selector: '[data-testid="orders"]' }, watch: ['OrderRow'] });
rec.id; // saved session id
```

`engine.start()` / `engine.stop()`; `scope: { selector, component?, level? } | { names: [...] }`, `zones`,
`highlight: false` for timing runs, `sampleReasons: true` for fast recordings; `engine.stop({ collected: true })` right
after a CDP `HeapProfiler.collectGarbage` counts the unmounted components still in memory. `window.__REACT_PERF_RECORDER__.format`
prints reasons and hook chains the way the panel and the MCP server do. A page with nothing to record — a landing
page, docs — can call `window.__REACT_PERF_RECORDER__.panel?.suppress(true)` on mount and `suppress(false)` on
unmount: the panel, its outlines and shortcuts are gone for that page only, and nothing is remembered. Pages without the Vite plugin can load
`react-perf-recorder/engine.iife.js` (core only: no plugins, no saving).
