---
type: regex
target: trace
pattern: '"file_path":"(?![^"]*/src/(?:features/issues/IssueDrawer\.tsx|components/withPermission\.tsx)")[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
