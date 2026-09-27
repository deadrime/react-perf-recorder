---
type: regex
target: { source: file, path: src/components/OnlineNow.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
