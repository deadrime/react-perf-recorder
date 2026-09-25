# MCP server, CLI and scripts

## MCP server

`npx react-perf-recorder init-claude` registers it in `.mcp.json` (with a skill and an agent in `.claude/`; `--force`
overwrites them). By hand:

```json
{ "mcpServers": { "react-perf-recorder": { "command": "node", "args": ["node_modules/react-perf-recorder/dist/cli.js", "mcp"] } } }
```

Tools: `list_recordings`, `get_recording`, `record_page`, `wait_for_recording`, `compare_recordings`. Each describes
its parameters itself, and an MCP client shows the descriptions; they are not repeated here, so they cannot go
stale.

The sessions folder comes from `--dir`, then `REACT_PERF_RECORDER_DIR`, then `./.agent-artifacts/perf-recorder`.

`record_page` needs the dev server running and `playwright` installed in the project — it is never a dependency of
this package. A browser of the machine's own — a CI image, a sandbox with a preinstalled Chromium of another
version — is picked by `REACT_PERF_RECORDER_BROWSER=/path/to/chromium`, else the newest Chromium under
`PLAYWRIGHT_BROWSERS_PATH`.

A page behind a sign-in:

- `via` opens a link that signs the browser in first — a debug URL with a token, a magic link — and records the page
  after it;
- `react-perf-recorder login <url>` keeps a session for later runs: a real browser to sign in by hand, or
  `--for <selector>` / `--wait <ms>` when the link signs in by itself;
- `cdp: 'http://localhost:9222'` records in a browser you already have open and signed in; it is never closed.

A page that redirects to a login says so instead of recording the login form. A token never reaches a recording.

## CLI

```text
react-perf-recorder mcp            MCP server over stdio  [--reload: restart when the CLI is rebuilt]
react-perf-recorder list           sessions, newest first  [--limit 20]
react-perf-recorder show [id]      one session  [--section summary|roots|components|…] [--top 10]
react-perf-recorder pull           wait for the next finished recording and print its summary
react-perf-recorder record <url>   record a page  [--ms] [--scope] [--watch] [--script] [--from-load] [--via] …
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
`highlight: false` for timing runs, `sampleReasons: true` for fast recordings. `window.__REACT_PERF_RECORDER__.format`
prints reasons and hook chains the way the panel and the MCP server do. A page with nothing to record — a landing
page, docs — can call `window.__REACT_PERF_RECORDER__.panel?.suppress(true)` on mount and `suppress(false)` on
unmount: the panel, its outlines and shortcuts are gone for that page only, and nothing is remembered. Pages without the Vite plugin can load
`react-perf-recorder/engine.iife.js` (core only: no plugins, no saving).
