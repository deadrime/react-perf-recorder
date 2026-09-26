---
type: regex
target: { source: file, path: src/components/Messages.tsx }
pattern: 'useChatStore\(\(s\) => Object\.keys\(s\.messageById\)\)'
match: not_contains
---
