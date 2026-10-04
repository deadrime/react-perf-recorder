# What a recording holds

- **Cascade roots** — a component that rendered while its parent did not: where a render started, how many renders
  it pulled (`perHit`), how many instances fired at once. A component whose parent handed it the same props
  (`children` passed through, equal props to `memo`) is a root of its own.
- **Reasons**
  - `state now`, `store useChatStore selectPrice`, `context Theme`, `props: value | new ref, same content: style, onClick`;
  - `SAME-CONTENT` — a new reference with the same content, almost always a subscription bug rather than new data;
  - `SILENT` — a store hook whose store changed before notifying React (or without notifying at all): it was read
    anew on a render something else caused, is not why the component rendered, and is listed last. `RESYNC` — React re-checked the store after a
    commit, found it changed, and rendered the component again itself; such a commit's cause is `core:store resync`.
    Both need React's updater sets (a DevTools hook present when react-dom loads, as with the Vite plugin);
  - hook chains, with `[package]` where the app's hooks hand over to a library:
    `useOrderForm › [react-hook-form] useController › useFormState › State @ src/Form.tsx:48`.
- **Per-component reasons**, renders a parent caused included: `parent: props equal` (a `memo` would skip it),
  `parent: props price | new ref, same content: style` (what broke `memo`).
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
  What none of them explains is read off the stack when React is told: `core:effect @ src/hooks/useSync.ts`, or
  `core:layout effect @ src/Tooltip.tsx` for a layout effect, which React renders again before the browser paints.
- **User actions** — clicks, typing (length only; secrets never), keys, scroll; each with the element, its component
  and file, and the commits it led to. The recording is cut into action → consequences segments: renders per typed
  character, reaction vs background, input latency.
- **An area** — only what renders inside the picked component; renders from above are kept as outside roots.
- **Memos** that keep recomputing, long animation frames with their scripts, commit lanes, memoized selectors' calls
  and recomputes.
- **Growth** — what a leak makes grow, sampled four times a second for the first 10 s, then once a second: DOM nodes, CSS rules, `<style>` elements, live
  intervals, listeners on window, document, `<html>` and `<body>`, and the JS heap where Chrome tells it. A count that
  kept rising through the second half of the recording is called growing; the intervals and listeners still there at
  Stop come with the line that added them, mapped by the dev server. New CSS rules, whichever CSS-in-JS wrote them,
  are grouped by their declarations with the numbers taken out, with the component whose element carries one and the
  properties that vary between them. Resize, intersection and mutation observers never disconnected, and
  WebSockets, EventSources and BroadcastChannels left open, come with the line that started them too. Components
  unmounted during the recording are followed by weak references to their setters' queues, refs and instances;
  after a garbage collection, one still in memory is held by something outside React — a listener, a timer, a
  store's subscriber list. `record_page` collects through CDP before Stop; the panel's Stop collects only in a
  Chrome started with `--js-flags=--expose-gc`, and otherwise tells how many were unmounted, not how many stayed.
  `growth: false` in the recording's options leaves it out.
- **CPU** — see [below](#cpu).

## CPU

Where the page's CPU went while it recorded, from a sampling profile: `record_page` with `cpu` takes one through CDP
every 0.5 ms; the panel in Chromium takes one in the page itself (the JS Self-Profiling API, every 10 ms), because the
dev server allows it with a `Document-Policy: js-profiling` header. The dev server resolves each frame through source
maps, those of pre-bundled dependencies included, so a shared `chunk-XYZ.js` is named by the npm package it came
from, and sums the samples up into `recording.cpu`:

- busy time and its share of the recording, GC apart;
- **packages** by the time spent in their own code and by the time they were on the stack; the app's own code is
  `(app)`;
- the **hottest functions** by their own time, the app's with `file:line`; a builtin such as `JSON.parse` counts for
  the function that called it;
- **renders** — each component by the time its renders took (the frame React called under `renderWithHooks`, so
  `memo(() => …)` is found too and named by what the line assigns it to), with what inside the render took the time:
  the innermost function of the app, or the package API the component called;
- **outside renders** — work in no render, by the app's function that started it (an event handler, a timer's
  callback, an effect), or by the package when the app has none on the stack (a socket's message).

The recorder's own work — its wrappers, its commit hook, its panel — and scripts evaluated into the page from outside
(the test driver's) are counted apart and in no list. The numbers come from the development build: React and
CSS-in-JS libraries do more work there than in production, so read their share as an upper bound; the app's own hot
functions, and a before/after under the same conditions, hold.

[A list sorted again on every render](https://zhenya.dev/react-perf-recorder/advanced/sort) is the example: both
sides render as often, and the CPU fold names `byName` as what the slow side's render spends its time on. The fold
needs the dev server, so run it locally (`npm run dev:pages`): the built site has none to read the profile.

## Sessions

`<outDir>/<id>/`:

- `session.json` — `status: recording | done | interrupted`, page, area, conditions;
- `events.ndjson` — streamed while recording, every ~2 s;
- `recording.json` — written on Stop (`schema: react-perf-recorder/recording`);
- `cpu.cpuprofile` — the CPU profile itself, with `record_page`'s `cpu: { raw: true }`; DevTools' Performance panel
  opens it.

A session whose page reloads or closes mid-recording stays readable: the MCP server rebuilds a partial recording
from its events. Hook names, components, ways and plugin sections exist only in the final recording.

Every URL a session keeps — the page, its conditions, each navigation — has tokens masked first, in the path, the
query and the fragment.
