# The panel and the report

## The panel

The panel is one row. **● Rec** records; **↺ Page load** reloads the page and records from its first render (the
area and the followed components survive the reload; `?rpr=rec` does the same from a link). **■ Stop** ends it.

Next to them is the area. **⌖ Pick** chooses the part of the page to record — with no area it opens the tree of the
whole app; a click on the page takes the component under the cursor and opens the tree around it. In the tree `↑`/`↓`
move, `→` goes inside, `←` goes up, `Enter` keeps the area, `Esc` puts back the one before. Once an area is picked,
its name opens the tree again, `⧉` copies it as text for an assistant (component, file and line, path, DOM, the
`scope` for scripts), and `×` goes back to the whole app. `◎` in the tree follows a component by name through the
recording. While recording the area cannot change, and Pick is hidden.

In the header:

- **highlights** outlines renders inside the area on the page, while recording and between recordings — green for a
  few in a row, yellow for often, red for all the time, grey where the DOM did not change, dashed for a mount. A
  recording made with it on says so, since drawing costs frame time.
- **fast** (off by default) works out the reason of a parent-caused render for 50 instances of a component a
  commit, not all of them: about half the cost on lists of thousands. Counts stay exact; ways and cascade trees are
  not recorded.

Drag the panel by its header, or the dot it collapses to; it sticks to the nearest edge. In automated browsers
(`navigator.webdriver`) the panel is hidden unless the URL has `?rpr=panel`.

## The report

After Stop the report leads with the answer: commits, renders, wasted renders (after which the DOM did not change),
the slowest action, and the root to fix — the one whose renders changed nothing most often — opened on its reason,
hook chain and line. Then warnings, actions, the other roots, and:

- **Timeline** — tracks over one axis: actions, commits, and a lane per root. A bar is a commit, as wide as React
  took and as tall as it rendered, coloured by its cause; the causes above are the legend and light up their
  commits. Drag across the overview to zoom, drag the tracks to move, the wheel zooms at the pointer. A picked
  commit shows its causes, its roots with their reasons, its render time as a **flame chart** — a row a level, each
  component as wide as it took with its subtree, yellow where its props were equal — and its **cascade** as a tree — who rendered whom, through
  which props, the busiest branch first — and outlines its components on the page; the live outlines step aside until
  **Show all**. A picked action lights up every commit it caused and says what it cost.
- **Components** — every component's renders, and the **ways** its renders came down from their roots: the cause,
  the root and why it rendered, then the props each parent handed on, one link a line. A link with equal props is
  marked: a `memo` there stops the rest of the way.
- **Memos that miss** — a `useMemo` or `useCallback` that recomputed on at least half of its renders, how often it
  kept its value, the dependency that moved by its name in the code, whether it moved to a new object with the same
  content, and the line.
- **Plugins** — what the store, query and memoizer plugins saw; a library that is not on the page is left out.

The bottom bar keeps the id, **Copy id**, **↻ Repeat**, **Download**, **⤢ Wide** and **Dismiss** in reach however far
the report is scrolled.

## Before → after

A second recording of the same page and area is set against the one before it: the same actions side by side, as
renders per time each was done (per character for typing), so the runs need not match click for click.

**↻ Repeat** makes them match anyway: it reloads the page and does the report's actions again at their pace — the
clicks, the keys, as many characters as were typed — while recording. Events are dispatched the way the browser
dispatches a person's, so React schedules the work as it did the first time; a step whose element is gone stops
the replay and says which. For scenarios whose network timing matters, record two scripted runs instead —
[Measuring a fix](measuring-a-fix.md) has the whole route, a worktree for the change, and how to read the result.
