# How it works

- Commits are caught by a setter on `FiberRoot.current`: React assigns it once per commit. The lanes of that commit
  are the bits it took back off `pendingLanes`. The DevTools hook is left to its owners (react-grab, React DevTools).
- A fiber rendered when its props, hook list or context dependencies changed since the last commit it was seen in;
  untouched subtrees (`child === alternate.child`) are skipped.
- A render's way down is a chain of links interned in one trie (parent → name → reason), so a render costs three map
  lookups and no strings, whatever the chain's length.
- Hook names come from re-running the component with a stand-in dispatcher, as React DevTools does — only on Stop,
  only for components in the report, never inside a commit. It knows React 19's hooks too (`use`,
  `useActionState`, `useOptimistic`, `useMemoCache`).
- A component's file comes from the fiber on React 18 and from its owner stack on React 19, where the position is
  the built module's: the dev server maps it back, and reads a memo's dependency array from the source.
- Timers are wrapped once at page boot, so intervals started on mount are seen; a callback becomes a cause only when
  React marked new work during it, and the cause goes to the components that work belongs to.
- The app's `react-dom/client` is proxied so the recorder learns of a root the moment `createRoot` returns — that is
  what makes recording from the page load possible.
- Store and memoizer plugins replace `zustand` and `proxy-memoize` for the app's imports only, so libraries keep the
  originals and memoization behaves the same.
- The panel is a preact view in a shadow root on `<html>`, never the app's React; the outlines are drawn on one
  canvas with `pointer-events: none`.

## Limits

- React 18.2+ and 19.1+, dev builds. React 19.0 dropped `_debugSource` before owner stacks landed in 19.1, so there
  is no file for a component there; a recording made on it says so.
- Store writes that did not lead to a commit in the area are not recorded — there is no store journal by design.
- Two timers that update the same component between commits are attributed to the first of them.
- Only the top level of a module is named: a `memo` inside a function keeps React's `Memo`.
- StrictMode doubles render-time selector calls.
- Hook names re-run the component: side effects in render run once more.
- State names are known for the roots whose hooks are named at Stop (the top 30 inside the area, 10 outside), and
  dependency names for the memos of the 15 components inspected; the rest keep their number. A dependency is named
  only when the array is a literal in the app's code, and inside a custom hook only when it has one memo.
