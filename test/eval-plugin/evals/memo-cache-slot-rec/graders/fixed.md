---
# selectors.ts or Messages.tsx, whichever the fix is in: an edit in the trace, a subagent's included.
type: regex
target: trace
pattern: '"file_path":"[^"]*selectors\.ts"(?:,"(?:old_string|old_text)":"(?:[^"\\]|\\.)*")?,"(?:new_string|new_text|content|contents)":"(?:[^"\\]|\\.)*?memoizeWithArgs\(messageInfo,|"file_path":"[^"]*Messages\.tsx"(?:,"(?:old_string|old_text)":"(?:[^"\\]|\\.)*")?,"(?:new_string|new_text|content|contents)":"(?:[^"\\]|\\.)*?memoize\('
---
