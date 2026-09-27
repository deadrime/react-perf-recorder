---
type: regex
target: { source: file, path: src/store/chat.ts }
pattern: 'console\.(count|log|time)'
match: not_contains
---
