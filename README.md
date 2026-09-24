# react-perf-recorder

Record why a React app re-renders, from the page itself: press **Rec**, use the app, press **Stop**. The report
names the component that started each render cascade and why — the hook and its line of code, the store action and
the keys it changed, the props that broke `memo` — and an agent reads the same recordings through an MCP server.

It runs only in the Vite dev server and never ships to a build. React 18.2+ and 19.1+.

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
import { redux } from 'react-perf-recorder/plugins/redux';

export default defineConfig({
  plugins: [react(), perfRecorder({ plugins: [zustand(), redux(), proxyMemoize(), reactQuery()] })],
});
```

Open the dev page: the panel sits in a corner. **Alt+Shift+R** starts and stops a recording, **Alt+Shift+S** picks
an area of the page to record alone.

## What you get

- **The root to fix** — the component that started a cascade, with its reason (`state now`,
  `store chat selectMessages SAME-CONTENT`, `context Theme`) and the hook chain down to the line.
- **The way a render came down** — from the cause through each parent to the component, with the props each one
  handed on; the link with equal props is where a `memo` stops the rest.
- **Wasted renders** — those after which nothing in the DOM changed, and remounts.
- **Causes** — the store action, query, timer, socket message or click behind each commit.
- **A timeline** of actions and commits; a picked commit shows its cascade as a tree and outlines its components on
  the page.
- **Memos that miss** — a `useMemo` that recomputes on every render, and the dependency that moved.
- **Before → after** — `↻ Repeat` reloads the page and does the same actions again, so a fix is measured.

## With an assistant

```sh
npx react-perf-recorder init-claude
```

Adds a skill, an agent and the MCP server to the project. The agent records a scenario — or reads the one you
recorded — and answers with the cascade root, the hook behind it and the file to change.

## Docs

- [The panel and the report](docs/panel.md)
- [What a recording holds](docs/recording.md)
- [Measuring a fix](docs/measuring-a-fix.md)
- [Options](docs/options.md)
- [MCP server, CLI and scripts](docs/mcp.md)
- [Plugins](docs/plugins.md)
- [How it works, and its limits](docs/how-it-works.md)
- [Working on it](docs/contributing.md)

## License

MIT
