# Cases: ideas for later

Not planned yet. Textbook and harder cases for the fixture app, and things the recorder got wrong while the last ones
were written.

## Cases

- **Class components.** A `PureComponent` handed an inline handler, `shouldComponentUpdate` that compares too little
  or too much, and `setState` in `componentDidUpdate` (the class form of state copied from props in an effect).
  Legacy code still has them, and the recorder reads their fibers differently: `memoizedState` is the instance's
  state object, not a hook list, so what `reasonsOf` says about them needs its own checks.
- **A React Compiler build.** The same page built with `babel-plugin-react-compiler`: its `useMemoCache` slots stand
  in for the `useMemo` and `useCallback` the textbook cases add by hand, so a basics page should show the broken side
  already skipping. The recorder then has to name a cache slot as a hook rather than an unknown one, and a case the
  compiler cannot fix (a mutated prop, a ref read in render) shows what is left to a person.

## What the recorder missed

- **A root that mostly mounts ranks low.** The cascade counts renders, not mounts, so a root whose cost is the
  subtree it mounts (a tooltip rendered in every card, a list that grows while it scrolls) comes after roots that
  render a few components for nothing.
- **A commit's `mounts` stays 0** while the components mounted in it are counted: a windowed list's scroll shows 41
  mounts on `Line` and none on the commits.
- **A cause of a neighbouring task.** A clock store's `setState` shows up among the causes of a click's commit now and
  then, probably when its interval fires in the same task.
