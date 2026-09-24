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

## Getting a recording

| The situation                                        | What to do                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| The person reproduces the problem in their browser   | Ask them to press **Rec**, do it, press **Stop**; meanwhile `wait_for_recording`, then `get_recording`. |
| You drive the page                                   | `record_page` — one call, one recording; clicks and typing go in a `script` module.                     |
| The problem is the page load                         | `record_page` with `fromLoad`, or the panel's `↺ Page load`.                                            |
| Before and after a fix, nothing waits on the network | `record_page` with `replay: <id>` after the change → `compare_recordings`.                              |
| Before and after a fix, actions wait on requests     | Two `record_page` runs with the same `script`; compare them yourself.                                   |

About one component: pass the name it is exported under as `scope`. Details, sign-in and the traps of each route:
`references/getting-a-recording.md`.

## Reading it

**One call usually holds the answer.** The default `summary` of `get_recording` has the totals, the cascade roots
with their reason, hook chain and `file:line`, what scheduled the commits, the costliest actions, the memos that
keep recomputing and the plugins' highlights. Read the file it points at; open another section only for what the
summary leaves open — `components` for the way a render came down, `timeline` for one commit's cascade.

## References

- `references/getting-a-recording.md` — `record_page`, replay or script, the area, sign-in, fast recordings.
- `references/reading-a-recording.md` — roots, reasons, hook chains, components and their ways, memos.
- `references/causes-and-actions.md` — what scheduled each commit, the person's actions, plugin sections, traps.
- `references/mcp-tools.md` — the tools, the sections of `get_recording`, the CLI when there is no MCP server.
- `references/panel.md` — the panel, for guiding a person who records it themselves.
- `references/from-scripts.md` — the page API for a Playwright or CDP script.

## Before you finish

- The cause is not a guess: name the root, the reason and the `file:line` the recording gave you.
- "This component does not re-render" is a claim only after `watch` or `components` says so.
- Close the browser you opened, and say what you did not check.
