---
name: react-perf-recorder
description: Record why a React app re-renders and read the recording — cascade roots, the hook or store behind each one, what scheduled the commit, renders that changed nothing. Use when a page feels slow, flashes on its own, or a fix has to be proved with before-and-after numbers.
---

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Recordings land in a folder
(`.agent-artifacts/perf-recorder`, or `REACT_PERF_RECORDER_DIR`) and this session reads them through the
`react-perf-recorder` MCP server.

**Never write measured numbers into a file of the repository.** They are true for one machine and one moment;
numbers belong in the answer.

## The method

1. **The recording** is the person's own: they press **Rec** in the panel and do it (`wait_for_recording`), or give
   you its id. No recording, and they cannot make one: `references/recording-yourself.md`.
2. **Read** the `get_recording` summary. Follow the hook chain to the app's own code, left of `[package]`, and ask for
   another section only for what the summary left open.
3. **Check before you conclude.** A reason line summarizes the recording; it is not a proof. Open the code at its
   `file:line` and find the mechanism there: the `setState`, the selector, the prop built in render. A claim about
   one component — it re-renders, `memo` holds, the fix helped — stands on that component's own counts in
   `components` or `watch`, not on totals or on how a reason is worded.
4. **Fix where the recording puts the waste.** A root that renders for nothing — subscribed to more than it shows,
   fed a value that changes for nothing — is fixed at that cause, and its own count has to fall; `memo` on its
   children leaves it rendering. A root whose render is needed is fixed below it, and its renders per hit have to
   fall. Whether it is needed is in `ownDomUnchanged`, not in `noDomChange`, which counts what changed anywhere under
   it: a root whose own elements stayed as they were in most of its hits — a form root whose only change is the
   letter in its child's input — renders for nothing, and the fix is in it. When its reason is a package's own state
   (`[package] useX › State`), the root reads more of what that hook returned than it shows — a getter, a proxied
   field, a function that subscribes as it reads, in an initializer too: move that read into the child that shows it.
5. **Prove it** when numbers were asked for or the cause is a guess: `references/measuring-a-fix.md`. Counts that did
   not move put the fix in doubt before the recorder.
6. **Read what is left.** The recording after the fix is the next look at the page: a root still rendering with no
   DOM change is the next cause, and a complaint can have more than one. Stop when what remains changes what the
   page shows — and when the first recording shows nothing wasted, say so and change nothing: a render that
   changes the page is not a bug. A root whose own count did not fall is not fixed: something in its render still
   subscribes it; find it rather than adding `memo` below.

Work through the `react-perf-recorder` MCP tools: each one says in its description when to use it and what it takes.

## References

- `references/recording-yourself.md` — no recording of the person's: their steps as a scenario of your own.
- `references/measuring-a-fix.md` — before and after: replay or script, a worktree for the change, reading the result.
- `references/reading-a-recording.md` — roots, reasons, hook chains, components and their ways, memos.
- `references/causes-and-actions.md` — what scheduled each commit, the person's actions, plugin sections, traps.
- `references/libraries.md` — what a library in a root's reason usually means: react-hook-form.
- `references/panel.md` — the panel, for guiding a person who records it themselves.
- `references/from-scripts.md` — the page API for a script of your own, and the CLI when the MCP tools are missing.
