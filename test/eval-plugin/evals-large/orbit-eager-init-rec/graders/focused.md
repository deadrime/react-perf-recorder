---
type: regex
target: trace
pattern: '"file_path":"(?![^"]*/src/(?:features/issues/CommentComposer\.tsx|lib/search\.ts)")[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
