# Measuring a fix

A before/after says whether a change helped, and by how much. It is two recordings of the same scenario, one on the
code as it was and one on the change, set side by side.

## The route

1. **Record the problem.** From the panel (**● Rec**, or **↺ Page load** for a page load) or with `record_page`.
   Keep its id.
2. **Make the change** — in a separate worktree when the project is a git repository (below).
3. **Do the same scenario again.**
   - The actions happen in the page (tabs, filters, typing, modals, store updates): **↻ Repeat** in the panel, or
     `record_page` with `replay: <id>`. It reloads the page and does the same clicks and typing at the same pace.
   - The actions wait on requests (server search, paging, saving): a replay does not wait for data. Write a `script`
     that waits for what shows the data is there, and run it with `record_page` on both sides.
4. **Compare.** The panel sets a second recording of the same page and area against the one before it;
   `compare_recordings` does the same for any two ids.
5. **Put back what was not kept.** A fix that is not taken leaves no trace: remove the worktree, or revert the file.

## A separate worktree

The working tree may hold changes that are not yours, and a change made in it for a measurement is easy to leave
behind. With git, make the fix in a worktree instead and run a second dev server from it:

```sh
git worktree add --detach ../app-fix
cd ../app-fix && npm ci
REACT_PERF_RECORDER_DIR=/abs/path/to/app/.agent-artifacts/perf-recorder npm run dev -- --port 5174
```

- **One sessions folder for both.** `REACT_PERF_RECORDER_DIR` points the second server at the first one's folder,
  so `compare_recordings` finds both recordings. A project with `outDir` in its config overrides the variable; set
  the same absolute path there.
- **The same page on the other port.** A replay takes the recording's URL; pass `url` with the second port.
- **The worktree starts from the last commit**, without the working tree's uncommitted changes. When they touch the
  page, record "before" in the worktree too, before the change, so the two sides differ by the fix alone.
- Both versions run at once: before and after can be recorded in turn, and again, without switching code.
- `--detach` makes no branch; commit the fix from the worktree only once it is kept.
- `git worktree remove ../app-fix` when done.

## A fair comparison

- **The same conditions**: viewport, CPU throttling, data, account, area. `compare_recordings` warns when the
  viewport, page, area, conditions or duration differ.
- **Outlines off** on both sides. Drawing them costs frame time; a comparison with them on one side says so.
- **Renders over milliseconds.** Render counts repeat from run to run; timings move with the machine, other tabs and
  the garbage collector. Compare timings only between runs made one after another, and say so.
- **Expect a little noise.** A feed tick or a poll landing on a keystroke adds a render to one run and not the other:
  ±1 render on an action is noise. A clear result moves more than that, or moves the same way twice.
- **Watch the recording, not only the totals**: a fix can move work from one root to another. The roots that
  appeared and those that are gone say where it went.

## Reading the result

`compare_recordings` gives:

- **totals** per second and per commit — renders, wasted renders, commits;
- **roots**: new, gone, and changed by renders per second; `match: 'name'` finds a root the fix moved in the tree;
- **the same actions** side by side: the median of each time it was done, per character for typing, so the runs need
  not match click for click;
- **causes** and **plugin metrics**, e.g. a selector's recomputes;
- **warnings** — read them first: a comparison that warns about the page, the area or partial data is not one.

The answer names the change, the scenario and the conditions, then the numbers that moved and by how much — and what
could have moved them besides the change.
