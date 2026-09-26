---
max_turns: 80
timeout_seconds: 1500
allowed_tools: [Read, Grep, Glob, Skill, Agent]
---

A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: typing a message lags, and the whole page seems to redraw with every letter.
To reproduce: open the page, click the message box at the bottom and type a short message, "see you at five".
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether a component re-renders for nothing, and why. If one does, fix it in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
