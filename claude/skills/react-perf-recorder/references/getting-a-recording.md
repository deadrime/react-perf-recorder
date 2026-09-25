# Getting a recording

Which tool, when. What each one takes is in its own description.

- **The person can reproduce it** — best: their recording is the thing that annoyed them. Ask them to press **Rec**
  (or **Alt+Shift+R**), do it, press **Stop**; meanwhile `wait_for_recording`, then `get_recording`.
  `references/panel.md` has what to tell them about the panel.
- **You drive the page** — `record_page`, with a `script` for the clicks and typing and a `setup` for what has to
  exist first. No `playwright` in the project: ask for a recording from the panel instead.
- **Several agents record into one folder** — keep the id `record_page` returns; find recordings with
  `list_recordings`.
- **Behind a sign-in** — `record_page` through a signing link, then a session saved once by
  `react-perf-recorder login <url>`, then a browser the person has open; none of them — ask the person to record from
  the panel.
- **Before and after a fix** — `references/measuring-a-fix.md`.
