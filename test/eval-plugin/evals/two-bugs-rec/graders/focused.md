---
type: regex
target: trace
pattern: '"file_path":"(?![^"]*(?:Header\.tsx|selectors\.ts|TimeAgo\.tsx|clock\.ts))[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
