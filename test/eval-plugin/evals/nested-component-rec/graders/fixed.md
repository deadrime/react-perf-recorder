---
type: regex
target: { source: file, path: src/components/Composer/index.tsx }
pattern: '\n[ \t]+const Field = \(\) =>'
match: not_contains
---
