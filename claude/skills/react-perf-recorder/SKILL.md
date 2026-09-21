---
name: react-perf-recorder
description: Record why a React app re-renders and read the recording — cascade roots, the hook or store behind each one, what scheduled the commit, renders that changed nothing. Use when a page feels slow, flashes on its own, or a fix has to be proved with before-and-after numbers.
---

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page itself. Recordings land in a folder
(`.agent-artifacts/perf-recorder` by default, or `REACT_PERF_RECORDER_DIR`) and this session reads them through
the `react-perf-recorder` MCP server. Nothing here touches a production build.

**Never write measured numbers into a file of the repository** — a skill, a reference, a README. They are true
for one machine, one browser and one moment, and they rot into lies. Numbers belong in the answer.

## Getting a recording

| The situation | What to do |
| --- | --- |
| The person reproduces the problem in their own browser | Ask them to press **Rec**, do the thing, press **Stop**. Meanwhile call `wait_for_recording`, then `get_recording`. |
| You drive the page yourself | `engine.start(…)` / `engine.stop()` from a script — `references/from-scripts.md`. |
| The problem is the page load | `?rpr=rec` in the URL, or the panel's `⟳ Load`: recording starts before the first commit. |
| Before and after a fix | Two recordings in the same conditions → `compare_recordings`. |

The panel is hidden in automated browsers (`navigator.webdriver`) unless the URL says `?rpr=panel`; the shortcuts
work either way.

## The panel

- **Alt+Shift+R** records and stops, **Alt+Shift+S** picks an area.
- **`⌖ Area`** — click an element and it becomes the area, with the component tree open around it: parents above,
  neighbours beside, children inside. `↑`/`↓` move the area, `→` goes in, `←` goes up, `Enter` or a click on a row
  keeps it, `Esc` puts the old one back. **The page does not react to clicks while the picker is open.** Only what
  renders inside the area is recorded; a render that came from above is kept as an *outside root* — the component
  that started the cascade, with its reason.
- **`⧉`** copies the area as text for a chat: component, file and line, the path above it, its DOM, what is inside,
  and the `scope` to pass to a script. This is what a person sends instead of "that panel on the right".
- **highlight** outlines renders inside the area, live, with or without a recording — grey where the render changed
  no DOM. Turn it off for timing runs: a recording made with it on carries a warning, and `compare_recordings`
  complains if one side had it and the other did not.
- **`◎`** in a tree row follows a component by name through the recording: how many times it rendered and which root
  pulled it.
- **Note** is saved with the recording and shown in `list_recordings` — what this run was about.
- While recording, the panel names the roots leading so far; after Stop it shows the summary and `saved <id>`.

## MCP tools

| Tool | What it gives |
| --- | --- |
| `list_recordings` | sessions, newest first: status (`recording`, `done`, `interrupted`), area, commits, renders, top root |
| `get_recording` | `id` (`latest`, `latest-1`), `section`: `summary` (default), `actions`, `roots`, `outside`, `causes`, `components`, `timeline`, `frames`, `plugins`, `plugin:<name>`; `hooks: 'short'` cuts hook chains at the library call |
| `wait_for_recording` | waits for a person to finish (`until: 'done'`) or start (`'started'`) one; two minutes by default |
| `compare_recordings` | before and after: totals per second and per commit, roots that appeared, left or changed, causes, the same actions, plugin metrics; warns about a different viewport, page, area or conditions |

A recording cut short by a reload or a closed tab is still there: the server builds a partial one from the event
stream (`partial: true`), without hook names, component stats or plugin sections.

No `react-perf-recorder` tools in this session? The MCP server only starts with the session — from a terminal the
same data is `node node_modules/react-perf-recorder/dist/cli.js list | show [id] --section actions | pull`.

## Reading it

`references/reading-a-recording.md` — what each field means, in the order a diagnosis needs them: the root, its
reason with the hook chain, what scheduled the commit, renders that changed nothing, and the traps.

## Driving it from a script

`references/from-scripts.md` — the page API, options, CPU throttling, and what to return from a Playwright script.

## Before you finish

- The cause is not a guess: name the root, the reason and the `file:line` the recording gave you.
- "This component does not re-render" is a claim only after `watch` or `components` says so.
- Close the browser you opened, and say what you did not check.
