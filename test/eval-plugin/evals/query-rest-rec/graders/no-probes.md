---
type: regex
target: { source: file, path: src/components/ChannelTopic.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
