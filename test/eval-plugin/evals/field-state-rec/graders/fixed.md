---
# Either half of the waste gone counts: fieldState subscribing each field to every error, or the trigger() of the
# whole form on every key, whose rules read no other field. The page shows the same either way. Only a fieldState
# taken from useController counts, not the word in a comment.
type: regex
target: { source: file, path: src/components/Composer/index.tsx }
pattern: 'void trigger\(\);[\s\S]*\{[^}\n]*\bfieldState\b[^}\n]*\} = useController'
match: not_contains
---
