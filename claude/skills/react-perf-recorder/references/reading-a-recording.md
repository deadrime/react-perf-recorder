# Reading a recording

In the order a diagnosis needs: who started the cascade, why it rendered, how it reached the component, and how much
of it was wasted. What scheduled the commit: `causes-and-actions.md`.

## Roots

A **cascade root** is a component that rendered while its parent did not — where a render started. `hits` is how
many commits it started, `cascade` the renders it pulled, `perHit` the renders per commit, `instances` how many
copies fired at once. `outsideRoots` are roots above the recorded area that reached into it.

`noDomChange` (per root) and `rendersWithoutDom` (in totals) count renders after which the DOM did not change —
waste with no argument attached. `ownDomUnchanged`, when a root has it, counts its hits that changed none of the elements it
renders itself nor anything a child drew from a value the root passed it in props: what changed was in children that
render on their own anyway, so the root's own render was spent handing them what they had. `mounts` other than zero on a page that only changes text means remounting: a
component declared inside a render, or an unstable `key`.

A `warnings` line starting `React warned:` is React's own dev warning, caught since the page loaded: a list without
keys, two children with one key, a component setting another's state while it renders, an update loop. It names the
component; ", before the recording" means React printed it at load and prints it once, so it holds whether or not
the steps repeated it.

## Reasons

- `state now` (the name the code gives it; `#2` when it is not known), `external store #3 [useStore] selectPrice`,
  `context Theme`, `props: value | new ref, same content: style, onClick`;
- `SAME-CONTENT` — a new reference with the same content: almost always a subscription that asks for more than it
  shows, not new data;
- `bailout: state set to the same value` — React called the component and threw the result away.
- `SILENT` on an `external store` — the store changed before telling React, or without telling it at all (a query
  refetched and brought equal data, so only its status fields moved); the component was rendered by the other
  reason next to it, not by this one, and the mark is listed last. `RESYNC` — React re-checked the store after a commit, found such a change, and rendered the
  component once more itself, under the cause `core:store resync`; look where the store changes without
  notifying (a refetch on mount, a write in an effect), not at the component.
- `#17` in `state #17` or `external store #17` is the hook's place in that component's own list: the same number
  in two components is two unrelated hooks.

**The hook chain** turns the reason into the code that owns it:

```
state #2 SAME-CONTENT · useSLTPInput › [react-hook-form] useController › useFormState › State
  @ src/order/SLTPInput.tsx:48   const { fieldState } = useController(…)
```

`[package]` is the border: to its left the app's own hooks — where a fix goes — to its right the library's insides.
In an `external store` reason, `[useStore]` names the store and what follows is the selector.

## Components and their ways

`section: components` has a reason per component, parent-caused renders included:

- `parent: props price | new ref, same content: style, onClick` — the component did render: `price` changed, `style`
  and `onClick` were new references to equal values, which is what breaks `memo`. A render that `memo` skipped is
  never counted or listed;
- `parent: props equal` — a `memo` would have skipped this render. Ask first whether the parent had to render: when
  it did not, the fix is there, and a `memo` here only hides it;
- `chains` — up to three ways its renders came down, as `way`: the root's leading cause, the root and its reason,
  then the props each parent handed on:
  `react-query:fetch ["presence"] › Stats · state online › Line · prop online › Badge · prop count`. The first link
  with `props equal` is where a `memo` stops the rest of the way. Up to 20 links; none in fast recordings.

`section: timeline` gives a commit whose roots rendered anyone a `cascade`: that commit's tree as indented lines,
busiest branch first — who rendered whom, through which props, and how many milliseconds each link took with its
subtree (`Item ×800 42.2ms`), when the build times renders. Dev builds render slower than production: read the
times as shares of the commit, not as what users wait.

`library` / `wrapper` mark a package's component and an unnamed one (`Anonymous`, `Memo`); the app's own come first.

## Memos

`memos` names a `useMemo` or `useCallback` that recomputed on at least half of its renders: which dependency moved
(by its name in the code when it can be read), whether into the same content, and the line. "A new object with the
same content every time" is a dependency written in render: make it once — a constant, or its own `useMemo` — rather
than adding another memo. A memo `inside` a package — zustand's around an inline selector, say — is the library's own: what the
call passes is new each render, which costs a recompute, not a render. Leave it unless that argument does heavy work.

## Growth

`section: growth` is what the page held more of at the end: DOM nodes, CSS rules, `<style>` elements, live
intervals, listeners on window/document/`<html>`/`<body>`, and the JS heap where Chrome reports it — start, end,
peak and slope per minute. `growing` marks a count that rose past noise and was still rising in the second half; a
burst that settled is a page loading, not a leak. The intervals and listeners left behind come with the line that
added them (`window resize @ src/Popover.tsx:45 window.addEventListener('resize', place)`): a missing cleanup in that
effect. CSS rules that keep growing are values put into CSS-in-JS styles (emotion, styled-components, goober, JSS —
any of them): `styles` groups the new rules by sheet and by their declarations with the numbers taken out, names the
component whose element carries one and the property that varies (`LeakyProgress (style[data-emotion]) varying
width ×100`): move that value into `style` or a CSS variable. `observers` and `connections` are observers never
disconnected and sockets or channels left open, by the line that started them. `retained` is about components
unmounted during the recording: with `collected: true` (record_page collects the garbage before Stop), `retained`
per component counts those still in memory — something outside React holds a setter, a ref or a callback of theirs,
usually the listener, timer or subscription in `listeners`/`intervals` above (`LeakyPopover 5 of 5`). With
`collected: false` only `unmounted` means anything: record with record_page to know what stayed. One recording shows growth; a leak is growth that repeats with the scenario —
record the same steps twice and compare, `compare_recordings` sets the growth of the two side by side.

## CPU

`section: cpu`, when the recording was profiled (`record_page` with `cpu`, or the panel in Chromium), says where the
CPU went; the summary has one line of it. `renders` is the part to read first: each component by the time its
renders took, with `hot` — the app's function inside the render that took it (a parser, a sort, a selector), or the
package API the component called (a CSS-in-JS style call, a form library's hook). A `hot` function of the app is the
fix: out of render — computed once, lazily (`useState(() => …)`), memoized on what it depends on — or made cheaper.
`functions` is the hottest code by its own time; a selector high in `total` across many components is one shared
subscription doing the work for all of them. `entries` is work in no render, by the app function that started it or
the package that did (a socket's parser, a chart). `gcMs` that stands out is allocation in a hot loop. The recorder's
own share is counted apart: it is the measurement's cost, not the page's. The numbers come from the development
build, where React and CSS-in-JS libraries do extra work: read their share as an upper bound; the app's own functions
and a before/after taken the same way hold. The panel samples every 10 ms: a line saying there were few samples means
rough shares — record longer, or with `throttle`.
