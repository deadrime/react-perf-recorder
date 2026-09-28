---
type: regex
target: trace
pattern: '"file_path":"(?![^"]*/src/(?:context/AuthContext\.tsx|queries/members\.ts|features/issues/IssuesPage\.tsx)")[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
