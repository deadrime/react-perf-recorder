# Web vitals: ideas for later

Not planned yet. After layout shifts (`shifts`) and the largest paint (`lcp`): the other numbers a page is graded
by, what a recording already holds for them, and what naming the component behind each would take.

Lighthouse 10 to 12 weighs its performance score as TBT 30%, LCP 25%, CLS 25%, FCP 10% and Speed Index 10%. INP is
not in it: a page load has no interactions, so TBT stands in for it. INP is one of the three Core Web Vitals, with
LCP and CLS, which Google takes from real visits (CrUX, Search Console).

## INP

- **What is there.** `latency` keeps the worst Event Timing entry of each interaction with its input delay,
  processing and presentation, and actions and shifts already link to it.
- **What it needs.** The recording's INP: the worst interaction, or past 50 of them the one Chrome takes (one skipped
  per 50). Then which of the three parts was long, and what filled it: before the handler ran (a timer, a commit of
  something else, a long frame), in the handlers (the renders they caused, by component), after them (the commit,
  layout and paint). A summary line, a section in `get_recording`, a delta in `compare_recordings`, a tile in the
  panel.
- **Traps.** The observer sees nothing under 16 ms (`durationThreshold`), which is fine for INP. Entry durations
  are rounded to 8 ms. A scroll or a drag is no interaction.

## TBT

- **What is there.** `frames.loaf` with each long frame's blocking time and its scripts, `longTasks`, and in
  `record_page` with `cpu` the profile.
- **What it needs.** For a recording from the load: blocking time summed from FCP to the page going quiet (5 s
  without long tasks and with at most 2 requests in flight, as Lighthouse counts TTI), and per blocking task the
  commits and components that rendered in it and the scripts by package. The largest share of the score, and the
  one a React app loses most to: hydration and a large first render.
- **Traps.** Lighthouse simulates a slow CPU and network: the number from `record_page` is comparable only to itself,
  and with CPU throttling (4× in Lighthouse) closer to it.

## FCP

- **What it needs.** The `paint` entry `first-contentful-paint`, buffered. For a client-rendered app it is the first
  commit that puts content into an empty root: the recording could say FCP waited for React's first commit, which
  waited for the script that holds it, with phases like LCP's (TTFB, scripts, the first render).

## Speed Index

- Needs a filmstrip of the load, which only `record_page` could take (CDP screencast). It moves with FCP and LCP and
  points at no code of its own. Not planned.
