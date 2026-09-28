---
type: regex
target: { source: file, path: src/features/board/IssueCard.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
