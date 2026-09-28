---
type: regex
target: { source: file, path: src/features/dashboard/ThroughputChart.tsx }
pattern: 'console\.(count|log|time)'
match: not_contains
---
