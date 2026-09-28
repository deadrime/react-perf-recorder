---
type: regex
target: trace
pattern: '"file_path":"(?![^"]*/src/(?:store/selectors\.ts|features/board/BoardColumn\.tsx)")[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
