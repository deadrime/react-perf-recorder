---
# The draft's state out of Layout: into a provider of its own below it, a store, or the box itself.
type: regex
target: { source: file, path: src/components/ChatView.tsx }
pattern: 'Layout = \(\) => \{[^}]*useState\('
match: not_contains
---
