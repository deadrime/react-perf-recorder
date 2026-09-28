# The large app

A second target for the agent benchmark: Orbit, an issue tracker in the manner of Linear, big enough that reading the
code whole is not a strategy. The chat app in `test/eval-plugin/app` is about 1,200 lines; an agent without the
recorder read it end to end and fixed most of its bugs. Orbit is 80 files and about 4,000 lines of TypeScript. It has
the libraries and the habits of a product that has grown for a while.

No existing app fit. The public material on React re-renders is made of small exercises that name the problem in
their instructions (Kent C. Dodds' workshops, GPL-3.0), course demos without a license, and interview take-homes of a
page or two. The clean open-source apps (bulletproof-react, react-admin's demo, both MIT) have no live data. Most of
the bugs below only show on a page that updates by itself, and those apps would have brought about fifteen new
dependencies. Their code is also well known enough for a model to remember the clean version.

## The app

- **Data.** 480 issues in five projects, twelve people and a few hundred comments, all seeded, so every load shows the
  same workspace. `src/api` stands in for the server, with latency.
- **Live updates.** A worker plays the socket (`?tick=` sets its pace in ms; the scenarios use 150). Teammates edit
  issues and comment on them, notifications arrive, presence changes, and a heartbeat reports the latency.
- **Pages:**
  - the issue list, with filters in the URL, search, sorting, bulk actions and keyboard navigation;
  - the board, with drag and drop;
  - an issue drawer, with properties, comments, mentions, presence and a typing indicator;
  - a dashboard, with an SVG throughput chart, workload and activity;
  - projects, the inbox and settings.
- **Libraries.** Every one the recorder has a plugin for, used the way product code uses it:
  - Redux Toolkit with entity adapters, `createSelector` and a `proxy-memoize` selector;
  - zustand with `persist` and `devtools`;
  - React Query, polling and with optimistic updates;
  - react-hook-form with `FormProvider`;
  - React Router 6 with a hash router, so a copy is served from any folder.
- **StrictMode** is on, as in most apps.

The clean app is not free of waste, and should not be. The idle issue list re-renders about 44 components in five
seconds that change nothing in the DOM: the page re-renders with fresh data and takes a few unchanged children with
it. Each bug below adds a lot more than that.

## The bugs

Each bug is a patch in `bugs/`, a few lines written the way the mistake reads in a real codebase. Nothing in the patched
copy names the bug or holds the other version.

| Bug                   | What is wrong                                                                                             | Scenario      |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ------------- |
| `auth-connection`     | The auth context's `can()` depends on the whole connection object, so every heartbeat renders its readers | `wait-issues` |
| `row-callback`        | An inline `() => onOpen(issue.key)` per row: the memoized rows render whenever the list does              | `wait-issues` |
| `debounce-deps`       | A shared `useDebouncedCallback` rebuilds the debounce when its callback changes, on every key             | `search`      |
| `column-selector`     | A board selector takes `{ projectId, status }`: its cache misses on every call                            | `wait-board`  |
| `conditional-tooltip` | A card is wrapped in a tooltip only while someone views it, so it remounts as viewers come and go         | `wait-board`  |
| `hoc-in-render`       | `withPermission()` is called in the drawer's render: the comment box remounts and loses the text          | `comment`     |
| `effect-filter`       | An effect copies the filtered issues into state: a second commit after every change                       | `wait-issues` |
| `chart-no-memo`       | The chart's 90-day series is rebuilt on every render, and hovering a bar renders it                       | `hover-chart` |
| `store-whole`         | The sidebar reads the whole zustand store, heartbeat included                                             | `wait-issues` |
| `query-index`         | The members are indexed into a `Map` inside the query function, which structural sharing cannot keep      | `wait-issues` |
| `hover-state`         | The hovered row is state of the table, so every row renders as the pointer moves                          | `hover-rows`  |
| `three-bugs`          | `auth-connection`, `query-index` and `effect-filter` at once                                              | `wait-issues` |
| `no-bug`              | None: the right answer is to change nothing                                                               | `wait-issues` |

`cases.mjs` gives each case its scenario, the root its waste starts at, the number a recording gives for that waste,
and a complaint that describes the symptom, never the cause.

## Checking it

```sh
npm run build
node test/eval-large/check.mjs [bug…]
```

`check.mjs` serves the clean app and every patched copy from one Vite. It records each case's scenario as a person
would from the panel, and passes a bug when:

- its waste is at least twice the clean app's on the same scenario;
- its component is among the recording's first three roots;
- the clean app's page is intact.

For `hoc-in-render` the patched page must also lose the typed comment, since that is what the person sees. CI runs the
check on changes to `src/` or here (`bench-large.yml`).

To look at the app with the recorder's panel:

```sh
npx vite --config test/eval-large/vite.config.ts   # http://localhost:5394/?tick=150
```

## With agents

The agent benchmark in `test/eval-plugin` runs these bugs too, as `orbit-<bug>-rec` in `test/eval-plugin/evals-large`,
apart from the chat's cases so a run of those stays what it was. `evals.mjs` here writes the cases from `cases.mjs`
and `scenarios.mjs`; run it again after changing either (a unit test fails while they differ). Each case gets:

- the complaint and the scenario's steps as its prompt, and the person's recording of that scenario;
- graders for the answer naming the bug's file, a fix that edits only the files in `cases.mjs`, and a before-and-after
  recording.

There is no `no-bug` case for agents: the clean app renders for nothing too, so "change nothing" is not the right
answer there. Whether a fix worked is `verify.mjs`'s call, as for the chat: it records what the agent left.

```sh
npm run build
bash test/eval-plugin/run.sh --eval-dir evals-large --runs 1 --ablation none --keep-temp \
  --json .agent-artifacts/evals-orbit/aggregate-result.json
node test/eval-plugin/verify.mjs .agent-artifacts/evals-orbit/aggregate-result.json
node test/eval-plugin/transcripts.mjs .agent-artifacts/evals-orbit/aggregate-result.json
```

`--cases orbit-store-whole-rec,orbit-query-index-rec` runs only some of them. `summarize.mjs` writes the chat's
tables in `docs/benchmarks.md`, so it is not for an Orbit run yet.
