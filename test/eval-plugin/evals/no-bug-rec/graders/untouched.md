---
# Nothing in this app renders for nothing: the right answer changes no file.
type: regex
target: trace
pattern: '"file_path":"[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
