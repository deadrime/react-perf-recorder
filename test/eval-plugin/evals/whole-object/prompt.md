---
max_turns: 80
timeout_seconds: 1200
allowed_tools: [Read, Grep, Glob, Skill, Agent]
---

A React app runs on its dev server at http://localhost:5395/case/0?tick=150, and its source is in ./src.
The complaint: the chat page stays busy even when nobody touches it — reactions and read receipts keep arriving.
Find which component re-renders for nothing and why: the component, the reason, and the file:line to change.
Do not edit the app.
