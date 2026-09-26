---
type: regex
target: { source: file, path: src/components/ChatView.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
