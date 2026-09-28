---
type: regex
target: { source: file, path: src/components/layout/Sidebar.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
