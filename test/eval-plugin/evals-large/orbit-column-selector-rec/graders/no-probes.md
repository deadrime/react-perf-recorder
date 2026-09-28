---
type: regex
target: { source: file, path: src/store/selectors.ts }
pattern: 'console\.(count|log|time)'
match: not_contains
---
