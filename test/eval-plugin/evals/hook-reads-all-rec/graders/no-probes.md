---
type: regex
target: { source: file, path: src/lib/channel.ts }
pattern: 'console\.(count|log|time)'
match: not_contains
---
