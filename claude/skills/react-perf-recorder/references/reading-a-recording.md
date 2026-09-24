# Reading a recording

The order below is the order a diagnosis needs: who started the cascade, why it rendered, what scheduled the
commit, and how much of it was wasted.

## Roots

A **cascade root** is a component that rendered while its parent did not — where a render started. `hits` is how
many commits it started, `cascade` the renders it pulled, `perHit` the renders per commit, `instances` how many
copies of it fired at once. `outsideRoots` are the roots above the recorded area that reached into it.

`mounts` on a root or a component counts components mounted inside it. Anything but zero on a page that only
changes text means remounting: a component declared inside a render, or a list with an unstable `key`.

`noDomChange` (per root) and `rendersWithoutDom` (in totals) count renders after which the DOM of that subtree did
not change. That is waste with no argument attached to it.

## Reasons

A reason says what changed for that component since its last render:

- `state #2`, `external store #3 [useStore] selectPrice`, `context Theme`, `props: value | same: style, onClick`;
- `SAME-CONTENT` — a new reference with the same content: almost always a subscription that asks for more than it
  shows, not new data;
- `bailout: state set to the same value` — React called the component and threw the result away.

**The hook chain** turns `#2` into the code that owns it:

```
state #2 SAME-CONTENT · useSLTPInput › [react-hook-form] useController › useFormState › State
  @ src/order/SLTPInput.tsx:48   const { fieldState } = useController(…)
```

`[package]` is the border: to its left the app's own hooks — that is where a fix goes — to its right the library's
insides. `hooks: 'short'` cuts the chain at the library call. The names come from running the component once more
on Stop, the way React DevTools does it, so side effects written in a render body run again.

`[useStore]` / `[priceStore]` in an `external store` reason names the store; what follows is the selector — the
name of a memoized one, `useShallow(<selector>)`, or the text of an inline arrow.

## Components

`section: components` has a reason per component, not only per root:

- `parent: props price | same: style, onClick` — what broke `memo`, and which props were only new references;
- `parent: props equal` — `memo` would have skipped this render entirely;
- `chains` — up to three ways its renders came down, as `way`: the root's leading cause, the root and its reason
  (a state by the name the code gives it), then the props each parent handed on — `react-query:fetch ["presence"] ›
  Stats · state online › Line · prop online › Badge · prop count`. Up to 20 links; a longer way keeps its root end and
  the last sixteen. The first link with `props equal` is where a `memo` stops the whole rest of the way. Fast
  recordings keep no ways;
- `section: timeline` gives each commit whose roots rendered anyone a `cascade`: the commit's tree as indented lines,
  busiest branch first (`CardWithClock · state useSecond` / `  Item · props equal ×4` / `    RenderCount · prop renders
  ×4`) — who rendered whom, and through which props, in that one commit;
- `library` / `wrapper` mark a component of a package and an unnamed one (`Anonymous`, `Memo`, `ForwardRef`). The
  app's own come first; the picker tree and root paths hide package internals and the providers that only hand a
  context down, each behind a checkbox. Which is which is decided by the file of the element a component rendered:
  app code is built with the dev JSX transform and its elements carry a file, a package's do not.

## Causes

What scheduled each commit, aimed at the components it actually updated:

| Cause | Means |
| --- | --- |
| `zustand:<action>` | a store write, with the keys it changed and a `SAME-CONTENT` mark |
| `react-query:<event> <key>` | a query cache event |
| `core:input <event>` | the person's click, keystroke, scroll |
| `core:message WebSocket` / `Worker` | a frame arrived |
| `core:timer setInterval <fn> @ src/…` | a timer, with the place it was started |
| `core:navigation push` | a navigation |
| `core:effect @ src/hooks/useX.ts` | a setState from an effect |
| `core:update <fn> @ src/…` | a plain call in the app's code; `(<package>)` when it came from inside a library |
| `core:none` | React scheduled the work itself — rare, and worth a second look |

A cause goes to the roots whose components it really updated: a subscriber of `priceStore` gets
`zustand:priceStore.setState`, not the action that happened to land in the same commit. A write that marked no work
at all steps aside when something else in the same task did mark some.

## Actions

`section: actions` cuts the recording into *action → consequences*: each action runs until the next one or a second
of quiet. `reaction` is the commits during the person's event, `background` everything else (ticks, polling,
deferred work). Typing gets renders per character, a click gets the input latency from Event Timing. Typed values
are never recorded, only their length; passwords and one-time codes not even that.

## Plugin sections

`plugin:proxy-memoize` — calls and recomputes per selector; `evicting` means a `memoizeWithArgs` cache keeps
pushing out answers still in use — more argument sets than slots, or a ring whose slots go round with recomputes
(`N after the answer was pushed out`). The fix is a memoized selector per row, not a bigger `size`. `plugin:zustand` — the stores it saw and the actions they fired.

## Traps

- **HMR during a recording** makes wide react-refresh commits: it is noted in `hmr` and `warnings`, and the run is
  better repeated.
- **Store writes that led to no commit are not in the recording.** There is no store journal; causes are attached
  to commits.
- **Two timers that updated the same component between commits** are attributed to the first of them.
- **One recording at a time**, panel or script: the second start gets an error naming the owner.
- **StrictMode** doubles render-time selector calls, so counts read double.
- **The highlight costs frame time**: a recording made with it on says so in `warnings`.
