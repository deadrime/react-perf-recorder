---
type: regex
target: { source: file, path: src/components/ActivityLog.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
