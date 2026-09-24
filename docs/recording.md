# What a recording holds

- **Cascade roots** — a component that rendered while its parent did not: where a render started, how many renders
  it pulled (`perHit`), how many instances fired at once. A component whose parent handed it the same props
  (`children` passed through, equal props to `memo`) is a root of its own.
- **Reasons**
  - `state now`, `store useChatStore selectPrice`, `context Theme`, `props: value | same: style, onClick`;
  - `SAME-CONTENT` — a new reference with the same content, almost always a subscription bug rather than new data;
  - hook chains, with `[package]` where the app's hooks hand over to a library:
    `useOrderForm › [react-hook-form] useController › useFormState › State @ src/Form.tsx:48`.
- **Per-component reasons**, renders a parent caused included: `parent: props equal` (a `memo` would skip it),
  `parent: props price | same: style` (what broke `memo`).
- **Ways and cascades** — for each component, up to three ways its renders came down from a root, up to 20 links
  each; for each commit, its cascade as a tree (the 30 busiest links and those above them).
- **The app's components apart from the packages'** — told by the file of the element a component rendered, so a UI
  kit's components are found without naming them. The app's lead the report; the picker tree hides package internals
  and providers behind checkboxes.
- **The page load** — recording can start before the first commit.
- **Wasted renders and mounts** — renders that changed nothing in the DOM; a component declared inside a render or
  an unstable `key` remounts its subtree every time.
- **Causes** — what scheduled each commit, aimed at the components it updated: store actions with the keys they
  changed, query events (one per query and commit: `fetch → success ["presence"]`), timers
  (`timer setInterval useCountdown @ src/hooks/useCountdown.ts`), socket and worker messages, navigations, input.
  What none of them explains is read off the stack when React is told: `core:effect @ src/hooks/useSync.ts`.
- **User actions** — clicks, typing (length only; secrets never), keys, scroll; each with the element, its component
  and file, and the commits it led to. The recording is cut into action → consequences segments: renders per typed
  character, reaction vs background, input latency.
- **An area** — only what renders inside the picked component; renders from above are kept as outside roots.
- **Memos** that keep recomputing, long animation frames with their scripts, commit lanes, memoized selectors' calls
  and recomputes.

## Sessions

`<outDir>/<id>/`:

- `session.json` — `status: recording | done | interrupted`, page, area, conditions;
- `events.ndjson` — streamed while recording, every ~2 s;
- `recording.json` — written on Stop (`schema: react-perf-recorder/recording`).

A session whose page reloads or closes mid-recording stays readable: the MCP server rebuilds a partial recording
from its events. Hook names, components, ways and plugin sections exist only in the final recording.

Every URL a session keeps — the page, its conditions, each navigation — has tokens masked first, in the path, the
query and the fragment.
