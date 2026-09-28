---
type: regex
target: { source: file, path: src/context/AuthContext.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
