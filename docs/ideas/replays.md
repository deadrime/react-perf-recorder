# Replays: ideas for later

Not planned. Where replays could go once the simple case — actions whose consequences happen in the page — has
been used for a while. For now a scenario that waits on the network is recorded twice with a `script` and compared
by whoever reads it, knowing the data and the timings may differ.

## Requests

- **Tie requests to the action that caused them, not to the time they happened.** Wrap `fetch` and XHR the way
  timers are wrapped: a call made during a person's event, in a timer scheduled during the action (a debounced
  search), or in an effect of a commit the action caused belongs to the action. Polling, analytics and the requests
  of a page load belong to nothing. A task in which a tied request's response arrives marks its `setState` calls
  with that request, and the recording already keeps where each update came from. Without AsyncContext some chains
  break inside libraries; a broken chain leaves the request untied rather than guessed, and the count of untied
  requests says how complete the picture is.
- **An action's cost including its responses**: renders during the event plus renders of the responses it caused,
  still counted, not timed, so a slow server does not change the number. The response time shown beside it.
- **A replay that waits for the previous step's requests** — only those tied to it, so polling never makes it wait
  forever — as well as for the person's pause, with an upper bound.
- **A warning in the comparison** when an action's requests took much longer in one run, or when renders inside an
  action's segment came without an event (likely responses) and are not in its number.
- **Recorded responses for `record_page`**: a HAR from the original run served to the replay (`routeFromHAR`), so
  the data and the timings are the same. Stale data and repeated POSTs make it an option, not the default. In the
  panel it would mean replacing `fetch`, which is riskier.

## The replay itself

- **Pin a baseline**: compare with a chosen recording instead of the one before, after several attempts at a fix.
- **Noise**: run the replay twice and show changes within the spread between the runs as noise.
- **What changed inside an action**: a row opens into the two or three roots before and after (`TodoRow ×40 → ×0`).
- **A replay as a Playwright test** with a budget — the same steps and `expect(renders per click) ≤ N` — so a fix
  becomes a regression test and CI gets a performance budget.
- **Typed text**: an opt-in to keep what was typed, for search and validation where the content changes the result.
- **Gestures a replay cannot do yet**: hover and drag are not recorded as actions; back and forward are skipped.
