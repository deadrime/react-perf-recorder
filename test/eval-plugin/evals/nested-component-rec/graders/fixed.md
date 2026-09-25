---
type: regex
target: { source: file, path: src/components/Messages.tsx }
pattern: '\n[ \t]+const NestedCount\b'
match: not_contains
---
