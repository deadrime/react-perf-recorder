# Recording it yourself

Only when there is no recording of the person's and they cannot make one: a recording you stage is a guess at what
annoyed them. What `record_page` takes is in its own description; this is how to use it well.

- **The scenario is the person's steps**, as they described them: the page, what they did, what felt slow. One
  scenario, 3–12 seconds. Nothing to reproduce means nothing to measure — ask for the steps.
- **About one component** ("this list", a file): read the file and take the name it is exported under — that is
  what `scope` and `watch` take. A component the scenario itself brings up is not mounted when the recording
  starts: record the whole page with `watch` instead.
- **What has to exist first** — data, a sign-in, a backend stubbed with `page.route` — goes in `setup`, not in the
  scenario, so it is not in the recording.
- **The same conditions on both sides of a fix**: viewport, throttling, data, account, area. A fix is proved with
  `replay: <id>` of the first recording, or the same `script` run again, then `compare_recordings` —
  `references/measuring-a-fix.md`.
- A run fails: read what it says about the page (its url, text, screenshot) before calling it again with a guess.
- Driving the page with a Playwright of your own rather than `record_page`: `references/from-scripts.md`; close the
  browser you opened, even when the run failed.
