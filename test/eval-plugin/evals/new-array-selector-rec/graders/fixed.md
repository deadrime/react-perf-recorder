---
type: regex
target: { source: file, path: src/components/Messages.tsx }
pattern: 'selectFreshIds = \(s: Chat\) => Object\.keys\(s\.messageById\);[\s\S]*useChatStore\(selectFreshIds\)'
match: not_contains
---
