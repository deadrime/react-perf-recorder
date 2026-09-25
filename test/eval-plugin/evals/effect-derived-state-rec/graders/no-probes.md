---
type: regex
target: { source: file, path: src/components/ChatPanel.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
