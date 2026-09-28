---
type: regex
target: { source: file, path: src/features/issues/IssueDrawer.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
