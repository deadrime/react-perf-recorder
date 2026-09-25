# Measuring a fix

Two recordings of one scenario — the code as it was, and the change — then `compare_recordings`. Do it when the cause
is a guess or numbers were asked for; a recording that names the root, reason and `file:line` is an answer already.

## Route

1. The recording with the problem — the person's, or `record_page`. Keep its id.
2. The change, in a git worktree when there is git (below); otherwise in place, and put back afterwards.
3. The same scenario on the change — `compare_recordings`' description says how to record it.
4. `compare_recordings` with `before: <id>`, `after: <new id>`.
5. A change that is not kept leaves nothing behind: `git worktree remove`, or the file as it was.

## Worktree

The working tree may hold someone else's changes; do not edit it for a measurement.

```sh
git worktree add --detach ../<app>-fix && cd ../<app>-fix && npm ci
REACT_PERF_RECORDER_DIR=<abs path of the first checkout>/.agent-artifacts/perf-recorder npm run dev -- --port <other port>
```

- `--detach`: no branch is made, and none is switched to.
- The worktree is the last commit, without uncommitted changes. When `git status` shows changes to files the page
  uses, record "before" in the worktree as well, before editing, so the sides differ by the fix alone.
- The variable puts both servers' sessions in the folder the MCP server reads; an `outDir` in the project's config
  overrides it — then set the same absolute path there.
- `record_page` against the second port: pass its `url`, also for a replay.
- Stop that dev server and remove the worktree when done, even when the run failed.

## Fair, and read right

- Same viewport, throttling, data, account and area on both sides.
- Compare renders, not milliseconds — timings move with the machine. ±1 render on an action is noise (a feed tick or
  a poll landing on a keystroke); a result is clear when it moves more, or the same way on a second run.
- Read `warnings` first: a different page, area or a partial side makes it no comparison.
- A script run twice takes a different time: per-second rates move with the length. Read `actions` (per action,
  per character) and the whole-run `totals.renders`; for one component, its own counts in `components` or `watch`.
- Roots that appeared and those that are gone say whether the work went away or moved; `match: 'name'` finds a root
  the fix moved in the tree.
- The answer: the change, the scenario, the conditions, the numbers that moved, and what else could have moved them.
