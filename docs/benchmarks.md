# Benchmarks

What the recorder changes for an agent fixing a re-render: the same agent, on the same app with the same bug, once
with the plugin (the MCP server, the skill and the `perf-recorder` agent) and once without it.

Each case is the demo chat app with one of its seeded bugs, as a real app with that bug would read (below). The
agent gets the complaint and is asked to find which component re-renders for nothing, fix it in the source without
changing what the page shows, and show with before-and-after numbers that the fix worked.

<!-- benchmark-charts -->

## Results

<!-- results:start -->

30 runs a side over 15 cases, 2026-09-26, Claude Code 2.1.283; the whole run cost $36.63.

|                                                              | With the recorder |  Without |                            |
| ------------------------------------------------------------ | ----------------: | -------: | -------------------------- |
| Fixed: the waste gone from a new recording, the page working |          29 of 30 | 20 of 30 |                            |
| The code checks passed                                       |          23 of 30 | 16 of 30 |                            |
| Every check passed, the answer naming the file               |          23 of 30 | 16 of 30 |                            |
| Proved with a before/after recording                         |          28 of 28 |        — | no browser to measure with |
| Cost of a task, mean                                         |             $0.38 |    $0.85 | 2.3× cheaper               |
| Time to the answer, mean                                     |             216 s |    463 s | 2.1× faster                |
| Turns, mean                                                  |                16 |       45 |                            |

| Case                       | What the agent gets                  | Fixed, with / without | Cost, with / without | Time, with / without |
| -------------------------- | ------------------------------------ | --------------------- | -------------------- | -------------------- |
| `draft-context-rec`        | the steps and the person’s recording | 2/2 · 0/2             | $0.39 · $0.89        | 187 s · 427 s        |
| `effect-derived-state-rec` | the steps and the person’s recording | 2/2 · 2/2             | $0.38 · $1.11        | 176 s · 610 s        |
| `exact-value-rec`          | the steps and the person’s recording | 2/2 · 2/2             | $0.35 · $0.80        | 199 s · 428 s        |
| `expensive-render-rec`     | the steps and the person’s recording | 2/2 · 2/2             | $0.24 · $0.64        | 93 s · 330 s         |
| `field-state-rec`          | the steps and the person’s recording | 2/2 · 1/2             | $0.46 · $1.18        | 286 s · 639 s        |
| `form-watch`               | a one-line complaint                 | 2/2 · 0/2             | $0.54 · $0.69        | 205 s · 340 s        |
| `form-watch-rec`           | the steps and the person’s recording | 1/2 · 1/2             | $0.58 · $1.25        | 310 s · 628 s        |
| `inline-context-rec`       | the steps and the person’s recording | 2/2 · 2/2             | $0.29 · $0.72        | 147 s · 355 s        |
| `memo-cache-slot-rec`      | the steps and the person’s recording | 2/2 · 1/2             | $0.56 · $0.94        | 314 s · 478 s        |
| `nested-component-rec`     | the steps and the person’s recording | 2/2 · 2/2             | $0.24 · $0.49        | 306 s · 209 s        |
| `new-array-selector-rec`   | the steps and the person’s recording | 2/2 · 2/2             | $0.32 · $0.79        | 276 s · 384 s        |
| `no-bug-rec`               | the steps and a recording, no bug    | 2/2 · 2/2             | $0.42 · $1.28        | 218 s · 1258 s       |
| `router-in-layout-rec`     | the steps and the person’s recording | 2/2 · 1/2             | $0.26 · $0.67        | 240 s · 316 s        |
| `two-bugs-rec`             | the steps and the person’s recording | 2/2 · 0/2             | $0.33 · $0.66        | 143 s · 293 s        |
| `whole-object-rec`         | the steps and the person’s recording | 2/2 · 2/2             | $0.25 · $0.57        | 142 s · 260 s        |

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
| `two-bugs`             | `whole-object` and `exact-value` at once                                                  | waiting    |
| `no-bug`               | None: the idle page's renders all change what it shows, and the right answer is no change | waiting    |

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
  as it is fails and the clean app passes; a unit test makes sure every code check fails on its patched app and
  passes on the clean one; `check.mjs` records every case live to see the bug's component among the first roots.

## Reading the numbers

- Two runs a side per case: a single run moves a case's row by a half. The totals are the ones to read.
- Every bug can be found by reading the code, and the agent without the plugin found most of them. Where it fell
  short, its edits left the root rendering as before — the form root in `form-watch`, the layout in
  `draft-context` — or fixed one bug of two in `two-bugs`. The recording shows the root still rendering after a fix,
  and the second root waiting; reading the code does not.
- The code checks pass less often than the fixes work, and the new recording is the one counted. In `field-state`
  the agents kept `fieldState` and stopped validating the whole form on every key instead — the renders were gone, the
  code check still saw the bug's line.
- Cost is the agent's own, from Claude Code; the checks cost nothing.

## Running it

```sh
npm run build
bash test/eval-plugin/run.sh --runs 2 -j 6 --keep-temp --output-dir .agent-artifacts/evals
node test/eval-plugin/verify.mjs .agent-artifacts/evals/aggregate-result.json
node test/eval-plugin/summarize.mjs .agent-artifacts/evals/aggregate-result.json
```

`run.sh` runs `claude plugin eval` on the cases in `test/eval-plugin/evals`, keeping each run's sandbox;
`verify.mjs` records what each agent left; `summarize.mjs` writes the tables above and the numbers the site draws
them from, `docs/benchmarks.json`.
