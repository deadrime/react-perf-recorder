---
# selectors.ts or Messages.tsx, whichever the fix is in: an edit in the trace (a subagent's too).
type: regex
target: trace
pattern: '"file_path":"[^"]*selectors\.ts"(?:,"old_string":"(?:[^"\\]|\\.)*")?,"(?:new_string|content)":"(?:[^"\\]|\\.)*?memoizeWithArgs\(messageInfo,|"file_path":"[^"]*Messages\.tsx"(?:,"old_string":"(?:[^"\\]|\\.)*")?,"(?:new_string|content)":"(?:[^"\\]|\\.)*?memoize\('
---
