# decoys-rec, with the plugin, run 1

fixed (waste 0); checks 5 of 5; $0.22, 97 s, 13 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: a code review found several things that "re-render too much", but the idle page is still busy.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> ## Findings
> 
> The idle-page churn was one real culprit: **`TypingBadge`** (`src/components/TypingBadge.tsx`).
> 
> Its `useQuietSoon()` hook polls every 250ms via `setInterval` and calls `setState({ soon: ... })` — wrapping the boolean in a **new object every tick**. Since the object reference is always new, React can never bail out, so the component re-renders ~4×/sec forever, even though `QUIET_AT` is an hour away and the rendered text never changes. The recording flagged all 20 of its hits in the 5s window as `SAME-CONTENT` / `noDomChange`.
> 
> Everything else in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`, etc.) had `noDomChange: 0` — their renders were driven by real data changes (worker messages, query fetches, presence updates) and actually updated the DOM, so those are not "for nothing" and were left alone.
> 
> ## Fix
> 
> `src/components/TypingBadge.tsx`: store the primitive boolean directly instead of a wrapper object, so React's built-in `Object.is` bailout can skip re-renders when the value hasn't actually changed:
> 
> ```diff
>  function useQuietSoon() {
> -  const [state, setState] = useState({ soon: false });
> +  const [soon, setSoon] = useState(false);
>    useEffect(() => {
> -    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);
> +    const id = setInterval(() => setSoon(QUIET_AT - Date.now() < 60_000), 250);
>      return () => clearInterval(id);
>    }, []);
> -  return state.soon;
> +  return soon;
>  }
> ```
> 
> Displayed text and update timing (when it actually would flip) are unchanged — only the needless re-renders are removed.
> 
> ## Before/after (replaying the recorded idle scenario, ~5s)
> 
> | metric | before | after |
> |---|---|---|
> | commits | 63 (12.45/s) | 43 (8.5/s) — **‑32%** |
> | renders | 86 (17/s) | 66 (13.05/s) — **‑23%** |
> | renders that changed nothing in the DOM | 20 (3.95/s) | **0** — ‑100% |
> | `TypingBadge` root | 20 hits, 20 no-op | **gone entirely** |
> | every other root (SyncBar, ChannelStats, OnlineNow, TypingLine, Status) | — | unchanged, 0% delta |
> 
> `wastingAfter` came back empty — the recorder found nothing left rendering for nothing. All other cascade roots' hit rates are identical before/after, confirming no behavior changed, only the wasted renders were eliminated.

## What it changed

```
diff -ruN a/src/components/TypingBadge.tsx b/src/components/TypingBadge.tsx
--- a/src/components/TypingBadge.tsx
+++ b/src/components/TypingBadge.tsx
@@ -3,12 +3,12 @@
 const QUIET_AT = Date.now() + 60 * 60_000;
 
 function useQuietSoon() {
-  const [state, setState] = useState({ soon: false });
+  const [soon, setSoon] = useState(false);
   useEffect(() => {
-    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);
+    const id = setInterval(() => setSoon(QUIET_AT - Date.now() < 60_000), 250);
     return () => clearInterval(id);
   }, []);
-  return state.soon;
+  return soon;
 }
 
 export const TypingBadge = () => {
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-074724-app-panel-71f1
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:39831/?tick=150
2	
```

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"recording id: 20260928-074724-app-panel-71f1"}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4150 more]

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**→ rpr:get_recording**
```
{"id":"20260928-074724-app-panel-71f1"}
```

**←**
```
{"id":"20260928-074724-app-panel-71f1","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-074724-app-panel-71f1","summary":{"id":"20260928-074724-app-panel-71f1","status":"done","createdAt":"2026-09-28T07:47:29.919Z","source":"panel","url":"http://localhost:39831/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":64,"commitsPerSec":12.68,"commitsInScope":64,"renders":98,"rendersPerScopeCommit":1.5,"rendersFromOutside":0,"rendersWithoutDom":20,"domTextChanges":41,"rendersPerTextChange":2.4},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.74,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"TypingBadge","source":"src/components/Header.tsx:34","path":"Header < SettingsBySync < Layout","hits":20,"hitsPerSec":3.96,"instances":1,"perHit":1,"noDomChange":20,"renderMsPerHit":0.07,"reasons":["20× state #0 SAME-CONTENT · useQuietSoon › State @ src/components/TypingBadge.tsx:15 const quiet = useQuietSoon();"],"causes":["20× core:timer setInterval @ src/components/TypingBadge.tsx"],"lanes":"De … [6128 more]
```

**→ Read**
```
{"file_path":"src/components/TypingBadge.tsx"}
```

**←**
```
1	import { useEffect, useState } from 'react';
2	
3	const QUIET_AT = Date.now() + 60 * 60_000;
4	
5	function useQuietSoon() {
6	  const [state, setState] = useState({ soon: false });
7	  useEffect(() => {
8	    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);
9	    return () => clearInterval(id);
10	  }, []);
11	  return state.soon;
12	}
13	
14	export const TypingBadge = () => {
15	  const quiet = useQuietSoon();
16	  return (
17	    <span className="badge muted" data-testid="typing-badge">
18	      {quiet ? 'quiet hours soon' : 'everyone is around'}
19	    </span>
20	  );
21	};
22	
```

**→ Read**
```
{"file_path":"src/components/Header.tsx"}
```

**←**
```
1	import { useStore } from 'zustand';
2	import { useChatStore } from '../store/chat';
3	import { draftStore } from '../store/draft';
4	import { selectUnread } from '../store/selectors';
5	import { ChannelTopic } from './ChannelTopic';
6	import { TimezoneBadge } from './Settings';
7	import { TypingBadge } from './TypingBadge';
8	import Workspace from './Workspace';
9	
10	const Unread = () => {
11	  const unread = useChatStore(selectUnread);
12	  return (
13	    <span className="badge" data-testid="unread">
14	      {unread} unread
15	    </span>
16	  );
17	};
18	
19	const DraftBadge = () => {
20	  const hasDraft = useStore(draftStore, (s) => s.hasDraft);
21	  return hasDraft ? (
22	    <span className="badge muted" data-testid="draft">
23	      draft
24	    </span>
25	  ) : null;
26	};
27	
28	export const Header = () => (
29	  <header className="head" data-testid="header" style={{ alignItems: 'center' }}>
30	    <Workspace />
31	    <ChannelTopic />
32	    <Unread />
33	    <TimezoneBadge />
34	    <TypingBadge />
35	    <DraftBadge />
36	  </header>
37	);
38	
```

**→ rpr:record_page**
```
{"replay":"20260928-074724-app-panel-71f1","label":"before"}
```

**←**
```
{"id":"20260928-074815-app-record-3ab2","url":"http://localhost:39831/?tick=150","requested":"http://localhost:39831/?tick=150","durationSec":5.1,"commits":63,"renders":86,"rendersWithoutDom":20,"rendersPerCommit":1.4,"topRoot":"SyncBar ×33","wasting":[{"root":"TypingBadge","source":"src/components/Header.tsx:34","hits":20,"instances":1,"noDomChange":20}],"warnings":["20260928-074724-app-panel-71f1 has no actions: recorded the page as it is for 5046 ms instead"]}
```

**agent:** Confirmed baseline: `TypingBadge` renders 20 times in ~5s and every single one changes nothing in the DOM. Now applying the fix.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/TypingBadge.tsx","old_string":"function useQuietSoon() {\n  const [state, setState] = useState({ soon: false });\n  useEffect(() => {\n    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);\n    return () => clearInterval(id);\n  }, []);\n  return state.soon;\n}","new_string":"function useQuietSoon() {\n  const [soon, setSoon] = useState(false);\n  useEffect(() => {\n    const id = setInterval(() => setSoon(QUIET_AT - Date.now() < 60_000), 250);\n    return () => clearInterval( … [36 more]
```

**←**
```
The file src/components/TypingBadge.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ rpr:record_page**
```
{"replay":"20260928-074724-app-panel-71f1","label":"after"}
```

**←**
```
{"id":"20260928-074827-app-record-ca6d","url":"http://localhost:39831/?tick=150","requested":"http://localhost:39831/?tick=150","durationSec":5.1,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-074724-app-panel-71f1 has no actions: recorded the page as it is for 5046 ms instead"]}
```

**agent:** TypingBadge no longer appears at all — `rendersWithoutDom` dropped from 20 to 0 and `wasting` is empty. Let's get the full comparison numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-074815-app-record-3ab2","after":"20260928-074827-app-record-ca6d"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-074815-app-record-3ab2","durationMs":5059},"after":{"id":"20260928-074827-app-record-ca6d","durationMs":5056},"totals":{"commits":"63 → 43 (-32%)","renders":"86 → 66 (-23%)","commitsPerSec":"12.45 → 8.5 (-32%)","rendersPerSec":"17 → 13.05 (-23%)","rendersPerCommit":"1.4 → 1.5 (+7%)","rendersWithoutDomPerSec":"3.95 → 0 (-100%)","rendersPerTextChange":"2.6 → 2 (-23%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"TypingBadge","source":"src/components/Header.tsx:34","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"3.95 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"3.95 → 0 (-100%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.52 → 6.53 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.52 → 6.53 (0%)"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.98 → 1.98 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.98 → 1.98 (0%)"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.98 → 1.98 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.98 → 1.98 (0%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"change … [1456 more]
```

**agent:** ## Findings

The idle-page churn was one real culprit: **`TypingBadge`** (`src/components/TypingBadge.tsx`).

Its `useQuietSoon()` hook polls every 250ms via `setInterval` and calls `setState({ soon: ... })` — wrapping the boolean in a **new object every tick**. Since the object reference is always new, React can never bail out, so the component re-renders ~4×/sec forever, even though `QUIET_AT` is an hour away and the rendered text never changes. The recording flagged all 20 of its hits in the 5s window as `SAME-CONTENT` / `noDomChange`.

Everything else in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`, etc.) had `noDomChange: 0` — their renders were driven by real data changes (worker messages, query fetches, presence updates) and actually updated the DOM, so those are not "for nothing" and were left alone.

## Fix

`src/components/TypingBadge.tsx`: store the primitive boolean directly instead of a wrapper object, so React's built-in `Object.is` bailout can skip re-renders when the value hasn't actually changed:

```diff
 function useQuietSoon() {
-  const [state, setState] = useState({ soon: false });
+  const [soon, setSoon] = useState(false);
   useEffect(() => {
-    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);
+    const id = setInterval(() => setSoon(QUIET_AT - Date.now() < 60_000), 250);
     return () => clearInterval(id);
   }, []);
-  return state.soon;
+  return soon;
 }
```

Displayed text and update timing (when it actually would flip) are unchanged — only the needless re-renders are removed.

## Before/after (replaying the recorded idle scenario, ~5s)

| metric | before | after |
|---|---|---|
| commits | 63 (12.45/s) | 43 (8.5/s) — **‑32%** |
| renders | 86 (17/s) | 66 (13.05/s) — **‑23%** |
| renders that changed nothing in the DOM | 20 (3.95/s) | **0** — ‑100% |
| `TypingBadge` root | 20 hits, 20 no-op | **gone entirely** |
| every other root (SyncBar, ChannelStats, OnlineNow, TypingLine, Status) | — | unchanged, 0% delta |

`wastingAfter` came back empty — the recorder found nothing left rendering for nothing. All other cascade roots' hit rates are identical before/after, confirming no behavior changed, only the wasted renders were eliminated.
