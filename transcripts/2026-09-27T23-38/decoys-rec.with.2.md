# decoys-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.38, 201 s, 28 turns

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

> ## Finding
> 
> One thing on the page re-rendered for nothing: **`TypingBadge`** (`src/components/TypingBadge.tsx`).
> 
> Its `useQuietSoon()` hook ran a `setInterval` every 250ms for the whole life of the page and called `setState({ soon: ... })` with a **brand-new object every tick** — even though the boolean it computes (`QUIET_AT - Date.now() < 60_000`) can't flip for another hour. Since it's a new object reference every time, React couldn't bail out, so the component re-rendered 4×/sec forever, producing zero DOM change each time (`reason: SAME-CONTENT`, `noDomChange: 20/20`). This is the exact busy-idle-page symptom: `rendersWithoutDom: 20` in the recorded 5s window, *all* traceable to this one root.
> 
> Everything else in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) had `noDomChange: 0` — they're driven by the simulated live feed/query traffic and actually update visible text each time, so they're legitimate and untouched.
> 
> ## Fix
> 
> `src/components/TypingBadge.tsx` — the interval's updater now returns the previous state object when the value hasn't changed, so React bails out instead of re-rendering:
> 
> ```ts
> setState((prev) => {
>   const soon = QUIET_AT - Date.now() < 60_000;
>   return prev.soon === soon ? prev : { soon };
> });
> ```
> 
> Page output is unchanged — same text, same timing of real updates.
> 
> ## Before/after (same 5s idle scenario, scripted for reproducibility)
> 
> | metric | before | after |
> |---|---|---|
> | commits | 63 (12.57/s) | 43 (8.58/s) — **‑32%** |
> | renders | 86 (17.16/s) | 66 (13.16/s) — **‑23%** |
> | renders without DOM change | 3.99/s | **0/s (‑100%)** |
> | `TypingBadge` cascade | 3.99/s | gone entirely |
> | every other root (SyncBar, ChannelStats, OnlineNow, TypingLine, Status) | unchanged (0% diff) | unchanged |
> 
> All the real, visible updates (sync bar, presence/online counts, typing indicator, message status) are bit-for-bit unchanged in rate and count — only the wasted, invisible re-render loop is gone.

## What it changed

```
diff -ruN a/src/components/TypingBadge.tsx b/src/components/TypingBadge.tsx
--- a/src/components/TypingBadge.tsx
+++ b/src/components/TypingBadge.tsx
@@ -5,7 +5,12 @@
 function useQuietSoon() {
   const [state, setState] = useState({ soon: false });
   useEffect(() => {
-    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);
+    const id = setInterval(() => {
+      setState((prev) => {
+        const soon = QUIET_AT - Date.now() < 60_000;
+        return prev.soon === soon ? prev : { soon };
+      });
+    }, 250);
     return () => clearInterval(id);
   }, []);
   return state.soon;
```

## The steps

**agent:** This task matches the react-perf-recorder skill exactly (recording exists, need to find why re-renders happen, fix, and prove with numbers). Let me invoke it.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder"}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [3506 more]

**→ Read**
```
{"file_path":"./recording.txt"}
```

**←**
```
1	20260927-233915-app-panel-8ef7
2	
```

**→ Read**
```
{"file_path":"./dev-url.txt"}
```

**←**
```
1	http://localhost:39825/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
```

**→ rpr:get_recording**
```
{"id":"20260927-233915-app-panel-8ef7"}
```

**←**
```
{"id":"20260927-233915-app-panel-8ef7","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-233915-app-panel-8ef7","summary":{"id":"20260927-233915-app-panel-8ef7","status":"done","createdAt":"2026-09-27T23:39:21.022Z","source":"panel","url":"http://localhost:39825/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":64,"commitsPerSec":12.71,"commitsInScope":64,"renders":98,"rendersPerScopeCommit":1.5,"rendersFromOutside":0,"rendersWithoutDom":20,"domTextChanges":41,"rendersPerTextChange":2.4},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.75,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.12,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"TypingBadge","source":"src/components/Header.tsx:34","path":"Header < SettingsBySync < Layout","hits":20,"hitsPerSec":3.97,"instances":1,"perHit":1,"noDomChange":20,"renderMsPerHit":0.1,"reasons":["20× state #0 SAME-CONTENT · useQuietSoon › State @ src/components/TypingBadge.tsx:15 const quiet = useQuietSoon();"],"causes":["20× core:timer setInterval @ src/components/TypingBadge.tsx"],"lanes":"Def … [6122 more]
```

**→ Read**
```
{"file_path":"./src/components/TypingBadge.tsx"}
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
{"file_path":"./src/components/ChatView.tsx"}
```

**←**
```
1	import type { ReactNode } from 'react';
2	import { useFeed } from '../feed';
3	import ActivityLog from './ActivityLog';
4	import { useChatStore } from '../store/chat';
5	import { ChannelStats } from './ChannelStats';
6	import { ChatPanel } from './ChatPanel';
7	import { Composer } from './Composer';
8	import { Header } from './Header';
9	import { MessageCount } from './MessageCount';
10	import { OnlineNow } from './OnlineNow';
11	import { PrefsLine } from './PrefsLine';
12	import { SettingsProvider } from './Settings';
13	import { TypingLine } from './TypingLine';
14	import { WebhookForm } from './WebhookForm';
15	
16	function useChatLayout() {
17	  return { wide: true };
18	}
19	
20	export const ChatView = () => {
21	  const { wide } = useChatLayout();
22	  return (
23	    <main className={wide ? 'chat wide' : 'chat'}>
24	      <div className="thread">
25	        <ChatPanel />
26	        <Composer />
27	      </div>
28	      <aside className="side" data-testid="side-panel">
29	        <h3>Channel</h3>
30	        <ChannelStats />
31	        <MessageCount />
32	        <OnlineNow />
33	        <PrefsLine />
34	        <h3>Activity</h3>
35	        <ActivityLog />
36	        <h3>Webhook</h3>
37	        <WebhookForm />
38	      </aside>
39	    </main>
40	  );
41	};
42	
43	const SyncBar = () => {
44	  const at = useChatStore((s) => s.workspace.lastEventAt);
45	  return (
46	    <span className="sync" title="Live">
47	      <span className="sync-fill" style={{ width: `${(at % 20) … [577 more]
```

**→ Read**
```
{"file_path":"./src/components/OnlineNow.tsx"}
```

**←**
```
1	import { useQuery } from '@tanstack/react-query';
2	import { useSortedMembers } from '../hooks/useSortedMembers';
3	
4	const ORDER: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
5	
6	/** The first few of the workspace by name, and how many of them are online now. */
7	export const OnlineNow = () => {
8	  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
9	  const sorted = useSortedMembers(ORDER);
10	  return (
11	    <p className="side-line" data-testid="online">
12	      {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
13	    </p>
14	  );
15	};
16	
```

**→ Read**
```
{"file_path":"./src/components/ChannelStats.tsx"}
```

**←**
```
1	import { useQuery } from '@tanstack/react-query';
2	import { memo } from 'react';
3	
4	const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
5	const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
6	const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
7	const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
8	const SORTED = [...MEMBERS].sort(byName);
9	
10	const MemberList = memo(() => (
11	  <ul className="members" data-testid="members">
12	    {SORTED.slice(0, 8).map((name) => (
13	      <li key={name}>{name}</li>
14	    ))}
15	    <li className="more">and {SORTED.length - 8} more</li>
16	  </ul>
17	));
18	
19	let polls = 0;
20	
21	export const ChannelStats = () => {
22	  const { data } = useQuery({
23	    queryKey: ['presence'],
24	    queryFn: async () => ({ online: 3 + (++polls % 4) }),
25	    refetchInterval: 500,
26	  });
27	  return (
28	    <>
29	      <p className="side-line" data-testid="stats">
30	        <b>{data?.online ?? '…'}</b> people online
31	      </p>
32	      <MemberList />
33	    </>
34	  );
35	};
36	
```

**→ Read**
```
{"file_path":"./src/hooks/useSortedMembers.ts"}
```

**←**
```
1	import { useMemo } from 'react';
2	import { ROSTER, sortMembers } from '../lib/members';
3	
4	export function useSortedMembers(order: Intl.CollatorOptions) {
5	  return useMemo(() => sortMembers(ROSTER, order), [order]);
6	}
7	
```

**→ Read**
```
{"file_path":"./src/components/Header.tsx"}
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

**→ Read**
```
{"file_path":"./src/components/TypingLine.tsx"}
```

**←**
```
1	import { useMemo } from 'react';
2	import { useStore } from 'zustand';
3	import { presenceStore, type Person } from '../store/chat';
4	
5	const line = (typing: Person[]) => {
6	  if (typing.length === 0) return ' ';
7	  const names = typing.length > 1 ? `${typing.slice(0, -1).join(', ')} and ${typing.at(-1)}` : typing[0];
8	  return `${names} ${typing.length > 1 ? 'are' : 'is'} typing…`;
9	};
10	
11	export const TypingLine = () => {
12	  const typing = useStore(presenceStore, (s) => s.typing);
13	  const text = useMemo(() => line(typing), [typing]);
14	  return (
15	    <small className="connection" data-testid="typing">
16	      {text}
17	    </small>
18	  );
19	};
20	
```

**→ Grep**
```
{"pattern":"setInterval|setTimeout","path":"./src","output_mode":"content","-n":true}
```

**←**
```
src/store/clock.ts:6:setInterval(() => clockStore.setState({ now: Date.now() }), 1000);
src/feed.ts:8:const source = `let step = 0; setInterval(() => postMessage({ step: ++step }), ${everyMs});`;
src/components/TypingBadge.tsx:8:    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);
```

**→ Read**
```
{"file_path":"./src/store/clock.ts"}
```

**←**
```
1	import { createStore } from 'zustand/vanilla';
2	
3	/** One clock for the whole page: every relative time reads it. */
4	export const clockStore = createStore(() => ({ now: Date.now() }));
5	
6	setInterval(() => clockStore.setState({ now: Date.now() }), 1000);
7	
8	export function timeAgo(now: number, sentAt: number): string {
9	  const seconds = Math.max(0, Math.round((now - sentAt) / 1000));
10	  if (seconds < 5) return 'just now';
11	  if (seconds < 45) return 'a few seconds ago';
12	  if (seconds < 90) return 'a minute ago';
13	  const mins = Math.round(seconds / 60);
14	  return mins < 60 ? `${mins} minutes ago` : `${Math.round(mins / 60)} hours ago`;
15	}
16	
```

**→ Grep**
```
{"pattern":"clockStore","path":"./src","output_mode":"content","-n":true}
```

**←**
```
src/store/clock.ts:4:export const clockStore = createStore(() => ({ now: Date.now() }));
src/store/clock.ts:6:setInterval(() => clockStore.setState({ now: Date.now() }), 1000);
src/components/TimeAgo.tsx:2:import { clockStore, timeAgo } from '../store/clock';
src/components/TimeAgo.tsx:5:  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
```

**agent:** Found it. `rendersWithoutDom: 20` across the whole recording maps exactly to `TypingBadge`'s 20/20 hits, all reason `SAME-CONTENT`, driven by a `setInterval(..., 250)` in `useQuietSoon()` that calls `setState({ soon: ... })` with a brand-new object every 250ms — even when the boolean hasn't changed (it won't change for another hour, per `QUIET_AT`). That's the whole "idle page still busy" symptom: 4 pointless re-renders/sec forever.

The other top roots (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) all show `noDomChange: 0` — they're driven by the simulated feed/query traffic and actually change the DOM each time, so they're legitimate, not waste.

Let me fix `useQuietSoon` to bail out when the value hasn't changed.

**→ Edit**
```
{"replace_all":false,"file_path":"./src/components/TypingBadge.tsx","old_string":"  useEffect(() => {\n    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);\n    return () => clearInterval(id);\n  }, []);","new_string":"  useEffect(() => {\n    const id = setInterval(() => {\n      setState((prev) => {\n        const soon = QUIET_AT - Date.now() < 60_000;\n        return prev.soon === soon ? prev : { soon };\n      });\n    }, 250);\n    return () => clearInterval(id);\n  }, []);"}
```

**←**
```
The file ./src/components/TypingBadge.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let me record a fresh "after" scenario to prove the fix, using the same idle-wait steps.

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**→ rpr:record_page**
```
{"replay":"20260927-233915-app-panel-8ef7","label":"after"}
```

**✗ error**
```
20260927-233915-app-panel-8ef7 has no actions to replay
```

**→ rpr:record_page**
```
{"url":"http://localhost:39825/?tick=150","setup":"async (page) => { await page.goto(page.url()); await page.waitForSelector('[data-testid=\"stats\"]'); await page.waitForTimeout(500); }","ms":5000,"label":"before-refix-check"}
```

**✗ error**
```
page.waitForSelector: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('[data-testid="stats"]') to be visible[22m
```

**→ rpr:record_page**
```
{"url":"http://localhost:39825/?tick=150","setup":"async (page) => { await page.goto('http://localhost:39825/?tick=150'); await page.waitForSelector('[data-testid=\"stats\"]'); await page.waitForTimeout(500); }","ms":5000,"label":"after-fix"}
```

**←**
```
{"id":"20260927-234135-app-record-ca68","url":"http://localhost:39825/?tick=150","requested":"http://localhost:39825/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** Fix confirms `rendersWithoutDom` dropped to 0. Let me also produce a like-for-like "before" recording (same scripted scenario) so the comparison is apples-to-apples, by temporarily reverting the fix.

**→ Edit**
```
{"file_path":"./src/components/TypingBadge.tsx","old_string":"  useEffect(() => {\n    const id = setInterval(() => {\n      setState((prev) => {\n        const soon = QUIET_AT - Date.now() < 60_000;\n        return prev.soon === soon ? prev : { soon };\n      });\n    }, 250);\n    return () => clearInterval(id);\n  }, []);","old_string_is_regex":false,"new_string":"  useEffect(() => {\n    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);\n    return () => clearInterval(id);\n  }, []);"}
```

**✗ error**
```
<tool_use_error>InputValidationError: Edit failed due to the following issue:
An unexpected parameter `old_string_is_regex` was provided</tool_use_error>
```

**→ Edit**
```
{"replace_all":false,"file_path":"./src/components/TypingBadge.tsx","old_string":"  useEffect(() => {\n    const id = setInterval(() => {\n      setState((prev) => {\n        const soon = QUIET_AT - Date.now() < 60_000;\n        return prev.soon === soon ? prev : { soon };\n      });\n    }, 250);\n    return () => clearInterval(id);\n  }, []);","new_string":"  useEffect(() => {\n    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);\n    return () => clearInterval(id);\n  }, []);"}
```

**←**
```
The file ./src/components/TypingBadge.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ rpr:record_page**
```
{"url":"http://localhost:39825/?tick=150","setup":"async (page) => { await page.goto('http://localhost:39825/?tick=150'); await page.waitForSelector('[data-testid=\"stats\"]'); await page.waitForTimeout(500); }","ms":5000,"label":"before-fix"}
```

**←**
```
{"id":"20260927-234154-app-record-5e7c","url":"http://localhost:39825/?tick=150","requested":"http://localhost:39825/?tick=150","durationSec":5,"commits":63,"renders":86,"rendersWithoutDom":20,"rendersPerCommit":1.4,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** Good, that reproduces the bug (rendersWithoutDom: 20). Now let me reapply the fix and use the compare tool for a clean before/after report.

**→ Edit**
```
{"replace_all":false,"file_path":"./src/components/TypingBadge.tsx","old_string":"  useEffect(() => {\n    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);\n    return () => clearInterval(id);\n  }, []);","new_string":"  useEffect(() => {\n    const id = setInterval(() => {\n      setState((prev) => {\n        const soon = QUIET_AT - Date.now() < 60_000;\n        return prev.soon === soon ? prev : { soon };\n      });\n    }, 250);\n    return () => clearInterval(id);\n  }, []);"}
```

**←**
```
The file ./src/components/TypingBadge.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":3}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ rpr:compare_recordings**
```
{"before":"20260927-234154-app-record-5e7c","after":"20260927-234135-app-record-ca68"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260927-234154-app-record-5e7c","durationMs":5012},"after":{"id":"20260927-234135-app-record-ca68","durationMs":5014},"totals":{"commits":"63 → 43 (-32%)","renders":"86 → 66 (-23%)","commitsPerSec":"12.57 → 8.58 (-32%)","rendersPerSec":"17.16 → 13.16 (-23%)","rendersPerCommit":"1.4 → 1.5 (+7%)","rendersWithoutDomPerSec":"3.99 → 0 (-100%)","rendersPerTextChange":"2.6 → 2 (-23%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"TypingBadge","source":"src/components/Header.tsx:34","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"3.99 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"3.99 → 0 (-100%)"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"2 → 1.99 (-1%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"2 → 1.99 (-1%)"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"2 → 1.99 (-1%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"2 → 1.99 (-1%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.58 → 6.58 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.58 → 6.58 (0%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed"," … [1410 more]
```

**agent:** ## Finding

One thing on the page re-rendered for nothing: **`TypingBadge`** (`src/components/TypingBadge.tsx`).

Its `useQuietSoon()` hook ran a `setInterval` every 250ms for the whole life of the page and called `setState({ soon: ... })` with a **brand-new object every tick** — even though the boolean it computes (`QUIET_AT - Date.now() < 60_000`) can't flip for another hour. Since it's a new object reference every time, React couldn't bail out, so the component re-rendered 4×/sec forever, producing zero DOM change each time (`reason: SAME-CONTENT`, `noDomChange: 20/20`). This is the exact busy-idle-page symptom: `rendersWithoutDom: 20` in the recorded 5s window, *all* traceable to this one root.

Everything else in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) had `noDomChange: 0` — they're driven by the simulated live feed/query traffic and actually update visible text each time, so they're legitimate and untouched.

## Fix

`src/components/TypingBadge.tsx` — the interval's updater now returns the previous state object when the value hasn't changed, so React bails out instead of re-rendering:

```ts
setState((prev) => {
  const soon = QUIET_AT - Date.now() < 60_000;
  return prev.soon === soon ? prev : { soon };
});
```

Page output is unchanged — same text, same timing of real updates.

## Before/after (same 5s idle scenario, scripted for reproducibility)

| metric | before | after |
|---|---|---|
| commits | 63 (12.57/s) | 43 (8.58/s) — **‑32%** |
| renders | 86 (17.16/s) | 66 (13.16/s) — **‑23%** |
| renders without DOM change | 3.99/s | **0/s (‑100%)** |
| `TypingBadge` cascade | 3.99/s | gone entirely |
| every other root (SyncBar, ChannelStats, OnlineNow, TypingLine, Status) | unchanged (0% diff) | unchanged |

All the real, visible updates (sync bar, presence/online counts, typing indicator, message status) are bit-for-bit unchanged in rate and count — only the wasted, invisible re-render loop is gone.
