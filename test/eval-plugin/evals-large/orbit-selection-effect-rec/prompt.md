---
max_turns: 80
timeout_seconds: 1500
allowed_tools: [Read, Grep, Glob, Skill, Agent]
---

A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: ticking issues in the list feels sluggish, and the count in the toolbar trails the checkboxes.
To reproduce: open the issue list and tick the checkboxes of the first eight issues, one after another.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
