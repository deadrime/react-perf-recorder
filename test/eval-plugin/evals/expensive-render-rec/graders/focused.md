---
type: regex
target: trace
pattern: '"file_path":"(?![^"]*(?:ChannelStats\.tsx|[Mm]embers))[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
