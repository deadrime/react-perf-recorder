---
type: regex
target: { source: file, path: src/components/Composer/index.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
