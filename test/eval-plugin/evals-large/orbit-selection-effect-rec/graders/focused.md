---
type: regex
target: trace
pattern: '"file_path":"(?![^"]*/src/(?:features/issues/IssueTable\.tsx|features/issues/IssuesPage\.tsx|features/issues/IssuesToolbar\.tsx)")[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
