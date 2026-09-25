---
# A memoized value in Settings.tsx, or the tick subscription gone from ChatView.tsx: an edit in the trace.
type: regex
target: trace
pattern: '"file_path":"[^"]*Settings\.tsx"(?:,"old_string":"(?:[^"\\]|\\.)*")?,"(?:new_string|content)":"(?:[^"\\]|\\.)*?useMemo\(|"file_path":"[^"]*ChatView\.tsx","old_string":"(?:[^"\\]|\\.)*?lastEventAt\) < 0'
---
