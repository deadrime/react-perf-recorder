# MCP tools

| Tool                 | What it gives                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_recordings`    | Sessions, newest first: status (`recording`, `done`, `interrupted`), area, commits, renders, top root                                                                    |
| `get_recording`      | `id` (`latest`, `latest-1`) and `section`; `hooks: 'short'` cuts hook chains at the library call; `top` and `offset` page through long sections                          |
| `record_page`        | Records a page in a browser of its own — `references/getting-a-recording.md`                                                                                             |
| `wait_for_recording` | Waits for a person to finish (`until: 'done'`) or start (`'started'`) one                                                                                                |
| `compare_recordings` | Before and after: totals per second and per commit, roots that appeared, left or changed, causes, the same actions, plugin metrics; warns about a different page or area |

## Sections of `get_recording`

- `summary` (default) — totals, roots with reason, hook chain and `file:line`, causes, costliest actions, memos,
  plugin highlights.
- `roots`, `outside` — every cascade root, inside the area and from above it.
- `components` — each component's reasons, and its `chains`: the ways its renders came down.
- `timeline` — one record per commit: when, how many rendered, the action and causes, each root with its reasons,
  and a `cascade` tree of who rendered whom — for "what happened at 2.4s".
- `actions`, `segments` — the person's actions and what each set off.
- `causes`, `memos`, `watch`, `zones`, `frames`, `navigations`, `conditions`, `warnings`.
- `plugins`, `plugin:<name>` — a plugin's own data.

Sections hand reasons over as words; `recording.json` keeps them as ids — read sections, not the file.

A recording cut short by a reload or a closed tab is rebuilt from its event stream (`partial: true`), without hook
names, component stats, ways or plugin sections.

## Without the MCP server

The server starts with the session. From a terminal the same data is:

```sh
node node_modules/react-perf-recorder/dist/cli.js list
node node_modules/react-perf-recorder/dist/cli.js show latest --section roots
node node_modules/react-perf-recorder/dist/cli.js pull   # waits for the next finished recording
```
