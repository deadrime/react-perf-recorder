---
type: regex
target: { source: file, path: src/features/issues/CommentComposer.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
