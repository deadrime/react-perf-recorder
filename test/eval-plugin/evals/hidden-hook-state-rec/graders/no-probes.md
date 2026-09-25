---
type: regex
target: { source: file, path: src/components/TypingBadge.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
