# Working on it

`npm test` runs the unit tests, `npm run test:e2e` the browser ones against the fixture app in
`test/e2e/fixture-app`, on React 18 and 19. The fixture doubles as the demo:

- `/app` — a small team chat with a store, a live feed, a polled query and a composer, with no bugs;
- `/bug/<id>` — the same app with one seeded re-render bug each (`/bug/whole-object`), for the tests;
- `/basics/<id>` — textbook mistakes on bare pages (`/basics/memo`, `/basics/state` …), the broken and the fixed
  version side by side with renders and mounts counted on every row;
- `/advanced/<id>` — harder ones: a chain of effects, a measurement, a heavy list, a query's fields.

`/` lists the basics and the advanced cases. The e2e suite needs a dev server because the Vite plugin is half of
what is under test.

`npm run fixture` opens it by hand on http://localhost:5391. Playwright starts its own copies of the server on 5391
(React 18) and 5392 (React 19): stop yours first, or move the tests with `FIXTURE_PORT` / `FIXTURE_PORT_19`.
`E2E_PROJECT=react18` runs one version only.

`react-perf-recorder mcp --reload` restarts the MCP server whenever the CLI is rebuilt, for working on the server
from a checkout.

Commits follow [CLAUDE.md](../CLAUDE.md). Pushes to `dev` run type checks and unit tests; `main` runs the e2e suite
too.
