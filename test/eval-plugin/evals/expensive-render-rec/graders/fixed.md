---
type: regex
target: { source: file, path: src/components/ChannelStats.tsx }
pattern: 'const MemberList = \(\) => \{\n  const \w+ = \[\.\.\.MEMBERS\]\.sort'
match: not_contains
---
