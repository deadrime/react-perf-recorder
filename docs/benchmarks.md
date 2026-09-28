# Benchmarks

What the recorder changes for an agent fixing a re-render: the same agent, on the same app with the same bug, once
with the plugin (the MCP server, the skill and the `perf-recorder` agent) and once without it.

Each case is the demo chat app with one of its seeded bugs, as a real app with that bug would read (below). The
agent gets the complaint and is asked to find which component re-renders for nothing, fix it in the source without
changing what the page shows, and show with before-and-after numbers that the fix worked.

<!-- benchmark-charts -->

## Results

<!-- results:start -->

36 runs a side over 18 cases, 2026-09-27, Claude Code 2.1.283; the whole run cost $43.03.

|                                                              | With the recorder |  Without |                            |
| ------------------------------------------------------------ | ----------------: | -------: | -------------------------- |
| Fixed: the waste gone from a new recording, the page working |          35 of 36 | 26 of 36 |                            |
| The code checks passed                                       |          33 of 36 | 21 of 36 |                            |
| Every check passed, the answer naming the file               |          32 of 36 | 21 of 36 |                            |
| Proved with a before/after recording                         |          34 of 34 |        — | no browser to measure with |
| Cost of a task, mean                                         |             $0.34 |    $0.86 | 2.6× cheaper               |
| Time to the answer, mean                                     |             152 s |    423 s | 2.8× faster                |
| Turns, mean                                                  |                16 |       52 |                            |

| Case                       | What the agent gets                  | Fixed, with / without | Cost, with / without | Time, with / without |
| -------------------------- | ------------------------------------ | --------------------- | -------------------- | -------------------- |
| `connect-filter-rec`       | the steps and the person’s recording | 2/2 · 2/2             | $0.24 · $0.70        | 93 s · 331 s         |
| `draft-context-rec`        | the steps and the person’s recording | 2/2 · 2/2             | $0.46 · $1.23        | 212 s · 508 s        |
| `effect-derived-state-rec` | the steps and the person’s recording | 2/2 · 1/2             | $0.30 · $0.79        | 154 s · 345 s        |
| `exact-value-rec`          | the steps and the person’s recording | 2/2 · 1/2             | $0.34 · $1.22        | 170 s · 625 s        |
| `expensive-render-rec`     | the steps and the person’s recording | 2/2 · 2/2             | $0.25 · $0.73        | 116 s · 344 s        |
| `field-state-rec`          | the steps and the person’s recording | 2/2 · 1/2             | $0.63 · $1.02        | 291 s · 585 s        |
| `form-watch`               | a one-line complaint                 | 2/2 · 1/2             | $0.43 · $0.82        | 201 s · 420 s        |
| `form-watch-rec`           | the steps and the person’s recording | 2/2 · 0/2             | $0.37 · $0.84        | 170 s · 415 s        |
| `hook-reads-all-rec`       | the steps and the person’s recording | 2/2 · 2/2             | $0.27 · $0.81        | 94 s · 356 s         |
| `inline-context-rec`       | the steps and the person’s recording | 2/2 · 2/2             | $0.25 · $0.76        | 99 s · 376 s         |
| `memo-cache-slot-rec`      | the steps and the person’s recording | 2/2 · 1/2             | $0.38 · $0.98        | 123 s · 479 s        |
| `nested-component-rec`     | the steps and the person’s recording | 2/2 · 2/2             | $0.22 · $0.48        | 98 s · 221 s         |
| `new-array-selector-rec`   | the steps and the person’s recording | 2/2 · 2/2             | $0.32 · $0.78        | 151 s · 381 s        |
| `no-bug-rec`               | the steps and a recording, no bug    | 2/2 · 2/2             | $0.42 · $1.07        | 252 s · 637 s        |
| `query-rest-rec`           | the steps and the person’s recording | 2/2 · 2/2             | $0.29 · $0.89        | 133 s · 449 s        |
| `router-in-layout-rec`     | the steps and the person’s recording | 2/2 · 1/2             | $0.30 · $0.82        | 141 s · 387 s        |
| `two-bugs-rec`             | the steps and the person’s recording | 1/2 · 0/2             | $0.31 · $0.85        | 154 s · 431 s        |
| `whole-object-rec`         | the steps and the person’s recording | 2/2 · 2/2             | $0.27 · $0.69        | 92 s · 322 s         |

<!-- results:end -->

**Fixed** is judged by the result, not the diff: after the run, the source the agent left is served and recorded
with the case's scenario again, and the fix counts when at least three quarters of what the bug added is gone —
while every part of the page is still there and what the scenario typed is in the box. What is measured is what the
bug costs: where the bug is a root rendering for nothing, that root's own renders, so `memo` on the children under it
does not count; elsewhere the renders that changed nothing, the remounts, or the render time. A fix written
differently from anything expected counts, and one that removes the bug's code but not its cost does not. On the case
without a bug, fixed means the page is left as it was.

**The code checks** are what the run itself can tell: the bug's own code is gone, no `console.count` probe is left,
and no file outside the bug's was edited. **Every check passed** also wants the answer to name the file. **Proved**
is a `compare_recordings` of the recording before the fix and one after it; without the plugin there is no browser
to measure with, so that side's numbers are an argument.

## The cases

Each bug is a pattern any React app can have. What the person does to see it is waiting on the page, typing a
message, or switching tabs.

| Case                   | The bug                                                                                   | Shows when |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| `whole-object`         | `Header` subscribes to the whole workspace object in a store to show one number of it     | waiting    |
| `field-state`          | `useController`'s `fieldState` subscribes each small field to the whole form's errors     | typing     |
| `form-watch`           | `Composer` calls `watch()` in the form root, so every keystroke renders the whole form    | typing     |
| `memo-cache-slot`      | The rows share one `memoizeWithArgs` with its single default slot, evicting each other    | waiting    |
| `new-array-selector`   | A selector builds a new array with `Object.keys()` on every call                          | waiting    |
| `inline-context`       | A provider that renders on every tick passes a fresh object as its value                  | waiting    |
| `router-in-layout`     | A hook the whole layout calls reads the URL, so a tab switch renders the page             | tabs       |
| `exact-value`          | The time under a message subscribes to the clock itself, to print "4 minutes ago"         | waiting    |
| `effect-derived-state` | An effect copies the active tab into state: a second commit after every switch            | tabs       |
| `nested-component`     | A component declared inside the message box's render: the box loses focus after a letter  | typing     |
| `expensive-render`     | A list sorts 1500 names in its render, on every poll of the channel's stats               | waiting    |
| `draft-context`        | The draft sits in state at the root, so every keystroke renders the whole page            | typing     |
| `connect-filter`       | `connect()`'s `mapStateToProps` filters a Redux list anew on every dispatch               | waiting    |
| `query-rest`           | `...rest` of `useQuery` reads every field, so each poll renders it with the same data     | waiting    |
| `hook-reads-all`       | A helper two files from the component reads the whole store and applies the selector      | waiting    |
| `prefs-on-tick`        | The store's writer rebuilds an object on every tick; the component reading it is right    | waiting    |
| `decoys`               | A timer puts a new object in state, among harmless look-alikes in other files             | waiting    |
| `fallback-array`       | A selector's `?? []` hands a new array to the rows that have no files, and only to them   | waiting    |
| `cost-over-count`      | A memo two files away breaks on an options object; a cheaper, busier waste draws the eye  | waiting    |
| `two-bugs`             | `whole-object` and `exact-value` at once                                                  | waiting    |
| `no-bug`               | None: the idle page's renders all change what it shows, and the right answer is no change | waiting    |

`prefs-on-tick`, `decoys`, `fallback-array` and `cost-over-count` were added after the run above and are not in its numbers yet. Each puts its cause away from where a reader of the code looks first — in the store's writer, among look-alikes, in the data, or behind the cost rather than the count. A first run, one a side, found that the app is small enough to read whole: the agent without the recorder fixed all four too, in three times the time and cost, and in two of them edited files the bug was not in.

A case comes in two forms. The `-rec` one is what a person with the panel sends: the steps to reproduce it and the
id of a recording they made, taken with the panel before the agent starts. The plain one gives only a one-line
complaint ("typing into the message box lags"), and the agent works out the scenario itself; `form-watch` runs in
both forms. Every prompt asks whether something renders for nothing and says to change nothing if not.

## How a case is built

- **The source is a small chat app with one bug patched in.** The app lives in `test/eval-plugin/app` without any
  of the bugs, and each bug is a patch of a few lines in `test/eval-plugin/bugs`, written the way the mistake reads
  in a real codebase. Nothing in the copy names the bug or holds the other version.
- **The app runs.** Each run has a dev server of its own serving that copy with the Vite plugin, so the agent's
  edit reloads in the page it records.
- **Both sides have the same tools** to read and edit the code (`Read`, `Grep`, `Glob`, `Edit`, `Write`); only the
  plugin's side has the recorder.
- Nothing takes the agent's word. `verify.mjs` records the result again, and its self-test makes sure the bug left
  as it is fails and shows its component among the first roots, and the clean app passes; CI runs it on every change
  to the recorder or the suite. A unit test makes sure every code check fails on its patched app and passes on the
  clean one; `check.mjs` records every case through the scaffold a run starts from.

## Reading the numbers

- Two runs a side per case: a single run moves a case's row by a half. The totals are the ones to read.
- Every bug can be found by reading the code, and the agent without the plugin found most of them. Where it fell
  short, its edits mostly left the root rendering as before — the form root in `form-watch`, in three runs of four
  across its two forms — or fixed one bug of two in `two-bugs`, both times; one run of `effect-derived-state` left
  the page broken. The recording shows the root still rendering after a fix, and the second root waiting; reading the
  code does not. With the plugin, the one miss was also `two-bugs`: one run fixed `whole-object` and left `exact-value`.
- The code checks pass less often than the fixes work, and the new recording is the one counted. A bug can have
  more than one right fix, and a check takes each one found so far: in `field-state` dropping the whole form's
  `trigger()` on every key, whose rules read no other field, shows the same page with no waste left; in
  `draft-context` the state can move into a provider below the layout.
- Cost is the agent's own, from Claude Code; the checks cost nothing.

## Running it

```sh
npm run build
bash test/eval-plugin/run.sh --runs 2 -j 6 --keep-temp --output-dir .agent-artifacts/evals
node test/eval-plugin/verify.mjs .agent-artifacts/evals/aggregate-result.json
node test/eval-plugin/summarize.mjs .agent-artifacts/evals/aggregate-result.json
node test/eval-plugin/transcripts.mjs .agent-artifacts/evals/aggregate-result.json --publish
```

`run.sh` runs `claude plugin eval` on the cases in `test/eval-plugin/evals`, keeping each run's sandbox — or only
some of them, `--cases decoys-rec,fallback-array-rec`, or the large app's with `--eval-dir evals-large`
(`test/eval-large/README.md`);
`verify.mjs` records what each agent left; `summarize.mjs` writes the tables above and the numbers the site draws
them from, `docs/benchmarks.json`; `transcripts.mjs` writes every run of it to `.agent-artifacts/transcripts` — the
prompt, the answer, the diff the agent left and its steps — so a wrong answer can be read after the sandboxes are gone.
With `--publish` it also commits them to the
[`benchmarks`](https://github.com/deadrime/react-perf-recorder/tree/benchmarks) branch, a folder a run, which holds
nothing else: about a megabyte a run, they stay out of `dev` and the package.
