---
type: regex
target: { source: file, path: src/features/issues/IssueTable.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
