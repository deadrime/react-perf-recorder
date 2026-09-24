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

| The situation                                          | What to do                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| The person reproduces the problem in their own browser | Ask them to press **Rec**, do the thing, press **Stop**. Meanwhile call `wait_for_recording`, then `get_recording`. |
| You drive the page yourself                            | `record_page` — one call, one recording; a scenario of clicks goes in a `script` module.                            |
| The problem is the page load                           | `?rpr=rec` in the URL, or the panel's `↺` next to `● Rec`: recording starts before the first commit.                  |
| Before and after a fix, nothing waits on the network  | `record_page` with `replay: <id of the recording with the problem>` after the change → `compare_recordings`.        |
| Before and after a fix, actions wait on requests       | Two `record_page` runs with the same `script`, the change in between; compare them yourself (see below).            |

The panel is hidden in automated browsers (`navigator.webdriver`) unless the URL says `?rpr=panel`; the shortcuts
work either way.

**Measuring a fix** is `record_page` with `replay` set to the recording that showed the problem — the person's own
clicks and typing, done again from the page load, in the same area — then `compare_recordings` with that one. No
script to write. It needs the dev server up and `playwright` in the project.

A replay keeps the person's pauses; it does not wait for data. Use it when what follows the actions happens in the
page: tabs, client-side filters and sorting, typing, forms that are not sent, modals, toggles, store updates. When
an action waits on a request — server search, paging, saving, loading on click, a sign-in — write a `script` that
waits for what shows the data is there (the list, the spinner gone), not for a time, run `record_page` with it before
and after the change, and compare the two yourself: the data and the response times can differ between runs, and
the answer says which numbers that may have moved. The recording tells the two apart: renders inside an action's
segment that came without an event (its `background`), or `query:` causes from the react-query plugin, mean the
action waited on the network.

`memos` in the summary names a useMemo or useCallback that keeps recomputing — which dependency moves, whether
into the same content, and the line. "A new object with the same content every time" is a dependency written in
render: the fix is to make it once (a constant, or its own useMemo), not to add another memo.

On a page with lists of thousands, `record_page` with `sample: true` records about twice as fast; the reasons of
parent-caused renders are then a sample (`sampled` on a component), the counts are not.

**One component, not the whole page.** When the ask is about a particular component, read its file, take the name
it is exported under, and pass it as the area: `scope: 'MessageList'`. Only what renders inside it is recorded, and
a render that came from above is kept as an outside root with its reason, so the cause is not lost by narrowing.
`watch: ['MessageList']` is the lighter half of the same idea: the whole page is recorded, and that component's
renders are counted and attributed on top. An area that is not on the page answers with the names that are.

**Behind a sign-in**, in the order to try: `via` — a link that signs the browser in (a debug url with a token in
it, a magic link); it is opened first, is not recorded, and nothing about it is stored. Then a session saved once
by `react-perf-recorder login <url>` — a real browser for a real sign-in, or `--for <selector>` / `--wait <ms>`
when the link signs itself in — used by default from then on. Then `cdp`, a browser the person already has open and
signed in, which is theirs and is never closed. A page that redirects to a login says so instead of recording the
login form; then ask the person to record it from the panel. **A token never reaches a recording**: the url kept in
a session is masked, in the path, the query and the fragment alike. Driving the engine by hand is still possible —
`references/from-scripts.md` — but it is the long way.

## The panel

- **Alt+Shift+R** records and stops, **Alt+Shift+S** picks an area.
- The panel is dragged by its header, and the dot it collapses to by itself; both stick to the nearest edge, the
  same gap from any of the four, at the place along it they were let go of. Where it sits is remembered.
- **`⌖ Pick`** (nothing picked means the whole app) — click an element, or a row of the tree it opens,
  and it becomes the area, with the component tree open around it: parents above,
  neighbours beside, children inside. `↑`/`↓` move the area, `→` goes in, `←` goes up, `Enter` or a click on a row
  keeps it, `Esc` puts the old one back. **The page does not react to clicks while the picker is open.** Only what
  renders inside the area is recorded; a render that came from above is kept as an _outside root_ — the component
  that started the cascade, with its reason.
- **`⧉`** copies the area as text for a chat: component, file and line, the path above it, its DOM, what is inside,
  and the `scope` to pass to a script. This is what a person sends instead of "that panel on the right".
- **highlights** outlines renders inside the area, live, with or without a recording — grey where the render changed
  no DOM. Turn it off for timing runs: a recording made with it on carries a warning, and `compare_recordings`
  complains if one side had it and the other did not.
- **`◎`** in a tree row follows a component by name through the recording: how many times it rendered and which root
  pulled it.
- **`label`** is what a run was about, shown in `list_recordings`. Scripts and `record_page` set it; the panel's note
  field is off for now, so a recording made from the panel comes without one.
- While recording, the panel names the roots leading so far; after Stop it shows the summary and `saved <id>`.

## MCP tools

| Tool              | What it gives                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_recordings` | sessions, newest first: status (`recording`, `done`, `interrupted`), area, commits, renders, top root |
| `get_recording` | `id` (`latest`, `latest-1`) and `section`; `hooks: 'short'` cuts hook chains at the library call |
| `wait_for_recording` | waits for a person to finish (`until: 'done'`) or start (`'started'`) one; two minutes by default |
| `compare_recordings` | before and after: totals per second and per commit, roots that appeared, left or changed, causes, the same actions (median per time done, per character for typing), plugin metrics; warns about a different viewport, page, area or conditions |

**One call usually holds the whole answer.** The default `summary` carries the totals, the cascade roots with the
reason, the hook chain and the `file:line` behind each one, what scheduled the commits, the costliest actions and
the plugins' own highlights — a line like `selectX: 792/792 recomputes, 36 argument sets > cache size 32` *is* the
diagnosis. Read the file it points at, and go to another section only for what the summary leaves open.

Sections of `get_recording`: `summary` (the default), `actions`, `roots`, `outside`, `causes`, `components`,
`timeline`, `watch`, `zones`, `segments`, `frames`, `navigations`, `conditions`, `warnings`, `plugins`,
`plugin:<name>`. `top` and `offset` page through the long ones.

A reason is data rather than a sentence: the recording keeps every one of them once, and each root, component and
commit points at it by id — its kind (`state`, `store`, `context`, `props`, `parent`, `bailout`), the hook it came
through, the props that changed and the ones that are only a new reference. The sections that answer "why" —
`summary`, `roots`, `outside`, `timeline`, `actions` — hand it over as words already. `timeline` is one record per
commit: when, how many rendered, how many changed nothing, the lane, the action and the causes behind it, and each
root with the reasons it gave — the section for "what happened at 2.4s" and "what did that click set off".

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
