---
type: regex
target: { source: file, path: src/components/Settings.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
