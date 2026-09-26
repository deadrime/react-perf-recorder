---
type: regex
target: { source: file, path: src/components/ChatView.tsx }
pattern: 'const \[draft, setDraft\] = useState'
match: not_contains
---
