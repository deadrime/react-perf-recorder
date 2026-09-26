---
type: regex
target: { source: file, path: src/components/Messages.tsx }
pattern: '\n[ \t]+const Reactions = \(\) =>'
match: not_contains
---
