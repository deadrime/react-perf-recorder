# Reading a recording

In the order a diagnosis needs: who started the cascade, why it rendered, how it reached the component, and how much
of it was wasted. What scheduled the commit: `causes-and-actions.md`.

## Roots

A **cascade root** is a component that rendered while its parent did not — where a render started. `hits` is how
many commits it started, `cascade` the renders it pulled, `perHit` the renders per commit, `instances` how many
copies fired at once. `outsideRoots` are roots above the recorded area that reached into it.

`noDomChange` (per root) and `rendersWithoutDom` (in totals) count renders after which the DOM did not change —
waste with no argument attached. `mounts` other than zero on a page that only changes text means remounting: a
component declared inside a render, or an unstable `key`.

## Reasons

- `state now` (the name the code gives it; `#2` when it is not known), `external store #3 [useStore] selectPrice`,
  `context Theme`, `props: value | new ref, same content: style, onClick`;
- `SAME-CONTENT` — a new reference with the same content: almost always a subscription that asks for more than it
  shows, not new data;
- `bailout: state set to the same value` — React called the component and threw the result away.
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
