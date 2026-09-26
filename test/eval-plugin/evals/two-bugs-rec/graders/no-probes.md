---
type: regex
target: { source: file, path: src/components/Header.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
