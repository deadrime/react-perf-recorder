# Driving the recorder from a script

The page carries the engine at `window.__REACT_PERF_RECORDER__.engine`, so a Playwright or CDP script can record
without touching the panel. `docs/mcp.md` in the repository has the full API; this is what a measuring run
needs.

**This is for a script of your own, outside `record_page`.** A `script` given to `record_page` is not this: that
tool's description says what goes in one.

```js
// Playwright: an `async (page) => {}` script
await page.goto('http://localhost:5173/some/page');
await page.getByTestId('ready').waitFor();

const recording = await page.evaluate(async () => {
  const { engine } = window.__REACT_PERF_RECORDER__;
  engine.start({ source: 'script', label: 'tab switch', highlight: false });
  document.querySelector('[data-testid="tab-orders"]').click();
  await new Promise((r) => setTimeout(r, 1500));
  return engine.stop(); // the Recording, and it is saved to the sessions folder too
});
```

- `engine.record(ms, options)` is start, wait, stop in one call; `engine.last` keeps the last recording.
- Options: `scope` (an area — `{ names: ['OrdersPanel', 'PositionTable'] }` or `{ selector }`), `watch` (component
  names to follow), `zones` (named parts of the page, by selector), `label`, `highlight`, `sampleReasons` (fast),
  `frames`, `hookNames`,
  `prune`, `actions`, `bigCommit`, `timeline` (how many commits to keep), `meta`.
- The answer carries `id`: read the whole thing later with `get_recording`, and compare two runs with
  `compare_recordings`.
- No engine on the page means the Vite plugin is not there — say so instead of measuring something else.

**Conditions decide whether two runs can be compared.** Same viewport, same data, same CPU throttling, same
account. Throttle through CDP (`Emulation.setCPUThrottlingRate`) if the machine is too fast to show the problem,
and say in the answer what the conditions were.

**A click under CPU throttling can hang** a Playwright call: it waits for the element to stop moving, and a page
that re-renders constantly never does. Click from inside the page (`element.click()` in `evaluate`) or turn the
throttling off for the click.
