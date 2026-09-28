---
type: regex
target: { source: file, path: src/queries/members.ts }
pattern: 'console\.(count|log|time)'
match: not_contains
---
