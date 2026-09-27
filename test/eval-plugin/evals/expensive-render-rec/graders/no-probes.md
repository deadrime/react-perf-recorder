---
type: regex
target: { source: file, path: src/components/ChannelStats.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
