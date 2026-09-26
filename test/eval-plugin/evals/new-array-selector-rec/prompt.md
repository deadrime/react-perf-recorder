---
max_turns: 80
timeout_seconds: 1500
allowed_tools: [Read, Grep, Glob, Skill, Agent]
---

A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the chat page stays busy even when nobody touches it — reactions and read receipts keep arriving.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether a component re-renders for nothing, and why. If one does, fix it in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
