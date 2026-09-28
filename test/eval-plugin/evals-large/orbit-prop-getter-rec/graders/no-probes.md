---
type: regex
target: { source: file, path: src/hooks/useListbox.ts }
pattern: 'console\.(count|log|time)'
match: not_contains
---
