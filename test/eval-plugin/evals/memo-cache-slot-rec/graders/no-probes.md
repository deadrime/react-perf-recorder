---
type: regex
target: { source: file, path: src/components/Messages.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
