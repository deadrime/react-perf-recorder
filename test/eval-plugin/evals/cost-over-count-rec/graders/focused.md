---
type: regex
target: trace
pattern: '"file_path":"(?![^"]*(?:OnlineNow\.tsx|useSortedMembers\.ts|/lib/members\.ts|Header\.tsx|/store/selectors\.ts))[^"]*/src/[^"]*","(?:old_string|old_text|new_string|new_text|content|contents)"'
match: not_contains
---
