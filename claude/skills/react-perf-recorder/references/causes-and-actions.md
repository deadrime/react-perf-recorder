# Causes, actions, plugins, traps

## Causes

What scheduled each commit, aimed at the components it actually updated:

| Cause                                 | Means                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `zustand:<action>`                    | a store write, with the keys it changed and a `SAME-CONTENT` mark                |
| `react-query:fetch → success <key>`   | a query's events, one cause per query and commit, on its subscribers' commit     |
| `core:input <event>`                  | the person's click, keystroke, scroll                                            |
| `core:message WebSocket` / `Worker`   | a frame arrived                                                                  |
| `core:timer setInterval <fn> @ src/…` | a timer, with the place it was started                                           |
| `core:navigation push`                | a navigation                                                                     |
| `core:effect @ src/hooks/useX.ts`     | a setState from an effect                                                        |
| `core:update <fn> @ src/…`            | a plain call in the app's code; `(<package>)` when it came from inside a library |
| `core:none`                           | React scheduled the work itself — rare, and worth a second look                  |

A cause goes to the roots whose components it updated: a subscriber of `priceStore` gets
`zustand:priceStore.setState`, not the action that landed in the same commit.

## Actions

`section: actions` cuts the recording into action → consequences: each action runs until the next one or a second
of quiet. `reaction` is the commits during the person's event, `background` everything else (ticks, polling,
deferred work). Typing gets renders per character, a click the input latency. Typed values are never recorded, only
their length.

## Plugin sections

- `plugin:proxy-memoize` — calls and recomputes per selector; `evicting` means a `memoizeWithArgs` cache keeps
  pushing out answers still in use. The fix is a memoized selector per row, not a bigger `size`. An unnamed selector
  goes by where it was created: `memoize in Row · Messages.tsx`.
- `plugin:zustand` — the stores it saw and the updates they made.
- `plugin:react-query` — query events by kind and key.

A plugin whose library is not on the page has `active: false` and is left out of the summary.

## Traps

- **HMR during a recording** makes wide react-refresh commits; it is noted in `warnings`, and the run is better
  repeated.
- **Store writes that led to no commit are not in the recording** — causes are attached to commits.
- **Two timers that updated the same component between commits** are attributed to the first.
- **One recording at a time**, panel or script: the second start gets an error naming the owner.
- **StrictMode** doubles render-time selector calls.
- **Highlights cost frame time**: a recording made with them on says so in `warnings`.
