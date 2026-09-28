---
type: regex
target: { source: file, path: src/hooks/useDebouncedCallback.ts }
pattern: 'console\.(count|log|time)'
match: not_contains
---
