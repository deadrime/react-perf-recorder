---
# Either half of the waste gone counts: fieldState subscribing each field to every error, or the trigger() of the
# whole form on every key, whose rules read no other field. The page shows the same either way.
type: regex
target: { source: file, path: src/components/Composer/index.tsx }
pattern: 'void trigger\(\);[\s\S]*fieldState'
match: not_contains
---
