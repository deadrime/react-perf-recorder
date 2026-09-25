# Getting a recording

## The person records

Ask them to press **Rec** (or **Alt+Shift+R**), do the thing, press **Stop**. Call `wait_for_recording` meanwhile
(two minutes by default), then `get_recording`. Their recording is worth more than one you stage: it is the thing
that annoyed them. `references/panel.md` has what to tell them about the panel.

## You record: `record_page`

Its parameters — `script`, `setup`, `scope`, `watch`, `replay`, `sample` and the rest — are described by the tool
itself; read that description before writing a script or a setup. It needs the dev server up and `playwright` in the
project; without it, ask for a recording from the panel. What the description does not cover:

- One scenario, 3–12 seconds. Keep a run well under a minute.
- A page that re-renders a lot replaces its elements: look an element up again for each step (`page.locator`, not
  a handle kept from before). A form inside a frame is reached through `page.frameLocator(...)`; the recording
  follows a same-origin frame by itself, and a frame whose React runs in the parent page (`react-frame-component`)
  is the page's own tree.
- A backend the machine cannot reach is stubbed in `setup` with `page.route`.
- Another agent may record into the same folder: take the id `record_page` returns, give `wait_for_recording`
  an `afterId`, and filter `list_recordings` by `url` or `label` — never lean on `latest`.
- Keep `viewport` and `throttle` the same across runs that will be compared.

## Before and after

`references/measuring-a-fix.md`: replay or script, a worktree for the change, and how to read the comparison.

## Behind a sign-in

In this order:

1. `via` — a link that signs the browser in (a debug URL with a token, a magic link). It is opened first, not
   recorded, and nothing about it is stored.
2. A session saved once by `react-perf-recorder login <url>` — a real browser for a real sign-in, or
   `--for <selector>` / `--wait <ms>` when the link signs in by itself — used by default from then on.
3. `cdp` — a browser the person already has open and signed in. It is theirs and is never closed.

A page that redirects to a login says so instead of recording the login form; then ask the person to record from
the panel. A token never reaches a recording: every URL a session keeps is masked.
