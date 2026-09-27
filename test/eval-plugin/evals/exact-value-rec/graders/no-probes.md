---
type: regex
target: { source: file, path: src/components/TimeAgo.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
