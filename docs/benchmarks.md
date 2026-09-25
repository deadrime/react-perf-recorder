# Benchmarks

What the recorder changes for an agent fixing a re-render: the same agent, on the same app with the same bug, once
with the plugin (the MCP server, the skill and the `perf-recorder` agent) and once without it.

Each case is the demo chat app with one of its seeded bugs, as a real app with that bug would read (below). The
agent gets the complaint and is asked to find which component re-renders for nothing, fix it in the source without
changing what the page shows, and show with before-and-after numbers that the fix worked.

<!-- benchmark-charts -->

## Results

<!-- results:start -->

8 runs a side over 4 cases, 2026-09-25, Claude Code 2.1.282; the whole run cost $9.35.

|                                      | With the recorder | Without |                            |
| ------------------------------------ | ----------------: | ------: | -------------------------- |
| Fixed at the cause                   |            7 of 8 |  5 of 8 |                            |
| Proved with a before/after recording |            8 of 8 |       — | no browser to measure with |
| Cost of a task, mean                 |             $0.36 |   $0.81 | 2.3× cheaper               |
| Time to the answer, mean             |             138 s |   324 s | 2.3× faster                |
| Turns, mean                          |                19 |      34 |                            |

| Case               | What the agent gets                  | Fixed, with / without | Cost, with / without | Time, with / without |
| ------------------ | ------------------------------------ | --------------------- | -------------------- | -------------------- |
| `form-watch`       | a one-line complaint                 | 1/2 · 0/2             | $0.55 · $0.92        | 210 s · 384 s        |
| `form-watch-rec`   | the steps and the person’s recording | 2/2 · 1/2             | $0.36 · $0.98        | 170 s · 369 s        |
| `whole-object`     | a one-line complaint                 | 2/2 · 2/2             | $0.23 · $0.79        | 67 s · 355 s         |
| `whole-object-rec` | the steps and the person’s recording | 2/2 · 2/2             | $0.30 · $0.55        | 105 s · 190 s        |

<!-- results:end -->

**Fixed at the cause** is every check of the case passing: the fix is in the component the bug is in and removes
what causes it (`memo` over a form that still watches itself does not count), the file is named in the answer, and
no `console.count` probes are left behind. **Proved** is a `compare_recordings` of the recording before the fix and
one after it; without the plugin there is no browser to measure with, so that side's numbers are an argument.

## The cases

Each is one of the demo's seeded bugs, a pattern any React app can have. What the person does to see it is waiting
on the page, typing a message, or switching tabs.

| Case                   | The bug                                                                                  | Shows when |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| `whole-object`         | `Header` subscribes to the whole workspace object in a store to show one number of it    | waiting    |
| `live-subscription`    | The message box subscribes to the presence store though it reads it only while rendering | waiting    |
| `field-state`          | `useController`'s `fieldState` subscribes each small field to the whole form's errors    | typing     |
| `form-watch`           | `Composer` calls `watch()` in the form root, so every keystroke renders the whole form   | typing     |
| `memo-cache-slot`      | The rows share one `memoizeWithArgs` with its single default slot, evicting each other   | waiting    |
| `new-array-selector`   | A selector builds a new array with `Object.keys()` on every call                         | waiting    |
| `inline-jsx-prop`      | A JSX element made in render is passed to a `memo` component                             | typing     |
| `inline-context`       | A provider that renders on every tick passes a fresh object as its value                 | waiting    |
| `router-in-layout`     | A hook the whole layout calls reads the URL, so a tab switch renders the page            | tabs       |
| `exact-value`          | The time under a message subscribes to the clock itself, to print "4 minutes ago"        | waiting    |
| `nested-component`     | A component declared inside another one's render is remounted every time                 | waiting    |
| `hidden-hook-state`    | A custom hook keeps a ticking clock in state to derive a boolean that stays `false`      | waiting    |
| `effect-derived-state` | An effect copies the active tab into state: a second commit after every switch           | tabs       |

A case comes in two forms. The `-rec` one is what a person with the panel sends: the steps to reproduce it and the
id of a recording they made, taken with the panel before the agent starts. The plain one gives only a one-line
complaint ("typing into the message box lags"), and the agent works out the scenario itself; `whole-object` and
`form-watch` run in both forms.

## How a case is built

- **The source is a copy with the bug in it and no trace of the other version.** The fixture switches each bug with
  `bug('…')`; the copy keeps the branch the page runs, blanks the code only the other branch used and every comment
  that talks about either, and leaves out the bug list and the demo pages. Lines stay where they were.
- **The app runs.** Each run has a dev server of its own serving that copy with the Vite plugin, so the agent's
  edit reloads in the page it records.
- **Both sides have the same tools** to read and edit the code (`Read`, `Grep`, `Glob`, `Edit`, `Write`); only the
  plugin's side has the recorder.
- The checks read the fixed files and the run's trace, not the agent's word.

## Reading the numbers

- Two runs a side per case: a single run moves a case's row by a half. The totals are the ones to read.
- Every bug can be found by reading the code, and the agent without the plugin often does: the app is small. The
  difference is in what it costs, and in whether the fix goes where the renders come from.
- The checks look for the bug's own code being gone or changed, not for one right fix: `memo-cache-slot` and
  `inline-context` can be fixed in either of two files, and either counts.
- Cost is the agent's own, from Claude Code; the checks cost nothing.

## Running it

```sh
npm run build
bash test/eval-plugin/run.sh --runs 2 -j 6 --output-dir .agent-artifacts/evals
node test/eval-plugin/summarize.mjs .agent-artifacts/evals/aggregate-result.json
```

`run.sh` runs `claude plugin eval` on the cases in `test/eval-plugin/evals`; `summarize.mjs` writes the tables above
and the numbers the site draws them from, `docs/benchmarks.json`.
