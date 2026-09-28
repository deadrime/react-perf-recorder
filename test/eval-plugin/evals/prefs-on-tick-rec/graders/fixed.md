---
# The bug is a writer that hands every tick a new prefs object: gone when the call goes, or when the merge keeps prefs
# as they were.
type: regex
target: { source: file, path: src/store/chat.ts }
pattern: '=> \(\{ prefs: \{ \.\.\.DEFAULT_PREFS, \.\.\.s\.prefs \} \}\);[\s\S]*\.\.\.completePrefs\(s\)'
match: not_contains
---
