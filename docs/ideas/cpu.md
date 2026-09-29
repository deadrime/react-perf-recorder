# CPU: ideas for later

Not planned yet. What the first version of CPU in recordings (busy time, packages, functions, renders, work outside
renders; `record_page` with `cpu` and the panel in Chromium) left out on purpose, to come back to once it has been
used. The review behind these choices: why each was left, and what it needs.

## Time

- **CPU per commit.** Put the profile on the recording's clock: `Performance.getMetrics`' `NavigationStart` is on the
  profile's clock and matched a spinning marker within 0.3–0.6 ms; the recording needs its own start in
  `performance.now()` (`t0` is kept inside the recorder, not saved). Then `cpuMs` per commit in the timeline, and
  samples cut to the recording's window instead of the profiler's. Traps: passive effects of commit N run in the
  next task, a transition's render is split across tasks, and commit times are rounded to 1 ms — so a commit's CPU
  is a window between commits, not the commit's own.
- **A check of the clocks**: long animation frames (`frames.loaf`) should fall on dense runs of samples; a
  mismatch larger than the interval is a warning.
- **The timeline's own CPU lane**: busy time per frame under the commit bars.

## Comparing

- **CPU in `compare_recordings`**: busy per second, packages, the app's functions and renders side by side, with a
  warning when one side was not profiled or the interval or throttling differ (they are already in `conditions`).
- **In the panel's Before → after**, the same for the CPU fold.

## Grouping

- **The project's own groups**: `perfRecorder({ cpu: { groups: { chart: ['charting_library/**'], math:
['src/lib/math/**'] } } })`, matched by source path or package, never by function name, so a group survives
  minification and a dependency update. The dev server reads the plugin's options itself, so nothing has to pass
  through the page.
- **React's own work split** into render, commit and passive effects by React's known functions
  (`renderRootSync`/`performUnitOfWork`, `commitRoot`, `flushPassiveEffects`).

## Where it is taken

- **The components list with its CPU** (`components[].hot`): needs the component's file in the recording, which today
  only roots carry (their JSX call site, not the declaration).
- **A per-component file of the CPU**: the panel's Tree could show a component's render time next to its renders.
- **Frames of static files** (a bundle served from `public/`) are named by their folder; a source map next to such a
  bundle could name its package too.

## Cost

- **The recorder's own share** shows now: on the fixture, a third or more of the busy time during a recording of
  quick renders, most of it stack capture for timers and listeners (`captureStack`, `parseStack`) and the commit
  scan. Worth a look of its own: the report shows it as `recorder`, and every recording pays it.
- **Overhead of the profilers** on the page: a measurement of 250/500/1000 µs through CDP, and of the page's own
  sampler, in `docs/benchmarks.md`, to pick the default on numbers.
- **The benchmark**: cases where the page is slow because a render is, not because it comes often (an unmemoized
  sort, a parser in render, CSS-in-JS built every render), to see whether the agent reaches for `cpu` by itself.
