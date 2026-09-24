# Getting a recording

## The person records

Ask them to press **Rec** (or **Alt+Shift+R**), do the thing, press **Stop**. Call `wait_for_recording` meanwhile
(two minutes by default), then `get_recording`. Their recording is worth more than one you stage: it is the thing
that annoyed them. `references/panel.md` has what to tell them about the panel.

## You record: `record_page`

It opens the page in a browser of its own, records and returns the session id. It needs the dev server up and
`playwright` in the project — not a dependency of this package; its absence is an answer, then ask for a recording
from the panel.

- `ms` — 3–12 seconds of one scenario; `fromLoad` records the page load from its first commit.
- `script` — a module with `export default async (page) => {…}`, run while recording: clicks, typing. Wait for what
  shows the result (a list, a spinner gone), not for a time.
- `scope: 'MessageList'` — only what renders inside that component; a render from above is kept as an outside root
  with its reason. Read the component's file and take the name it is exported under. An area not on the page
  answers with the names that are.
- `watch: ['MessageList']` — the whole page recorded, that component's renders counted and attributed on top.
- `sample: true` — about twice as fast on lists of thousands: parent-caused reasons are a sample (`sampled` on a
  component), counts are exact, no ways or commit cascades are kept.
- `viewport`, `throttle` (CPU slowdown) — keep them the same across runs that will be compared.

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
