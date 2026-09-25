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

## Recording and reading

Work through the `react-perf-recorder` MCP tools: each one says in its description when to use it and what it takes.
Read `record_page`'s before writing a `script` or a `setup`. After a recording, read the file `get_recording` points
at: the recording names the line, the code there shows the mechanism.

No `react-perf-recorder` tools in this session? The server starts with the session; from a terminal the same data
is `node node_modules/react-perf-recorder/dist/cli.js list`, `show latest --section roots`, and `pull` to wait for
the next finished recording.

## References

- `references/measuring-a-fix.md` — before and after: replay or script, a worktree for the change, reading the result.
- `references/reading-a-recording.md` — roots, reasons, hook chains, components and their ways, memos.
- `references/causes-and-actions.md` — what scheduled each commit, the person's actions, plugin sections, traps.
- `references/panel.md` — the panel, for guiding a person who records it themselves.
- `references/from-scripts.md` — the page API for a Playwright or CDP script.

## Before you finish

- The cause is not a guess: name the root, the reason and the `file:line` the recording gave you — and the code
  there that does it, which you read yourself. A reason line summarizes the recording; it is not taken on trust.
- "This component does not re-render", "`memo` holds", "the fix helped" are claims only after that component's own
  counts in `watch` or `components` say so. Counts that did not move after a change put the change in doubt first.
- Close the browser you opened, and say what you did not check.
