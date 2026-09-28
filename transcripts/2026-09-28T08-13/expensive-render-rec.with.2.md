# expensive-render-rec, with the plugin, run 2

fixed (waste 0.15); checks 5 of 5; $0.23, 82 s, 17 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the page stutters about twice a second even when nobody touches it — scrolling the messages jerks.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> Confirmed and fixed. Here's what was happening and what changed.
> 
> **Root cause:** `ChannelStats` polls `react-query` every 500ms (twice a second, matching your complaint exactly). Each poll updates `data.online`, which legitimately re-renders the `<b>{online}</b>` text — but it also dragged its sibling `MemberList` along for the ride. `MemberList` takes no props and always renders identically, yet on every single poll it re-sorted a 1500-name array (`[...MEMBERS].sort(byName)`) for no visible change — 10/10 of its renders left the DOM completely unchanged. That's the stutter: a ~44ms unnecessary sort landing twice a second, producing a 50ms long frame.
> 
> **Fix:** wrapped `MemberList` in `React.memo` (`src/components/ChannelStats.tsx`) so React skips it when its props haven't changed, which they never do. Nothing about what's rendered changed — same markup, same data, same `data-testid`s.
> 
> **Before → after** (same 5s scenario, replayed):
> - `rendersWithoutDom`/sec: 2 → 0 (**-100%**)
> - Longest task: 50ms → 0ms (**-100%**)
> - `ChannelStats` cascade: 2 renders/hit → 1 render/hit (**-50%**, `MemberList` no longer rides along)
> - Total renders/sec: 17.6 → 13.1 (**-25%**)
> - Recorder's `wasting` list: `[MemberList]` → `[]` (empty — no root renders for nothing anymore)
> 
> I also checked `OnlineNow`, which shows a similar member list but already memoizes the sort via `useSortedMembers`'s `useMemo` — that one was fine and untouched. No other roots in the recording render without a DOM change, so this was the only fix needed.

## What it changed

```
diff -ruN a/src/components/ChannelStats.tsx b/src/components/ChannelStats.tsx
--- a/src/components/ChannelStats.tsx
+++ b/src/components/ChannelStats.tsx
@@ -1,10 +1,11 @@
+import { memo } from 'react';
 import { useQuery } from '@tanstack/react-query';
 
 const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
 const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
 const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
 const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
-const MemberList = () => {
+const MemberList = memo(() => {
   const sorted = [...MEMBERS].sort(byName);
   return (
     <ul className="members" data-testid="members">
@@ -14,7 +15,7 @@
       <li className="more">and {sorted.length - 8} more</li>
     </ul>
   );
-};
+});
 
 let polls = 0;
```

## The steps

**agent:** This task matches the react-perf-recorder skill exactly — let me use it to analyze the recording and find the cause of the stutter.

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

A dev-only Vite plugin that records React re-renders from the page. Re … [4093 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-081800-app-panel-053b
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:38631/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording","max_results":3}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
```

**→ rpr:get_recording**
```
{"id":"20260928-081800-app-panel-053b"}
```

**←**
```
{"id":"20260928-081800-app-panel-053b","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081800-app-panel-053b","summary":{"id":"20260928-081800-app-panel-053b","status":"done","createdAt":"2026-09-28T08:18:05.046Z","source":"panel","url":"http://localhost:38631/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":88,"rendersPerScopeCommit":2,"rendersFromOutside":0,"rendersWithoutDom":10,"domTextChanges":41,"rendersPerTextChange":2.1},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.79,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.1,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":2,"instances":1,"perHit":2,"noDomChange":0,"renderMsPerHit":44,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → success [\"t … [5540 more]
```

**→ Read**
```
{"file_path":"src/components/ChannelStats.tsx"}
```

**←**
```
1	import { useQuery } from '@tanstack/react-query';
2	
3	const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
4	const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
5	const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
6	const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
7	const MemberList = () => {
8	  const sorted = [...MEMBERS].sort(byName);
9	  return (
10	    <ul className="members" data-testid="members">
11	      {sorted.slice(0, 8).map((name) => (
12	        <li key={name}>{name}</li>
13	      ))}
14	      <li className="more">and {sorted.length - 8} more</li>
15	    </ul>
16	  );
17	};
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
{"file_path":"src/components/OnlineNow.tsx"}
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
{"file_path":"src/components/ChatView.tsx"}
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
{"file_path":"src/hooks/useSortedMembers.ts"}
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

**→ rpr:get_recording**
```
{"id":"20260928-081800-app-panel-053b","section":"components"}
```

**←**
```
{"id":"20260928-081800-app-panel-053b","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081800-app-panel-053b","components":{"total":15,"offset":0,"items":[{"name":"SyncBar","renders":34,"withoutDom":0,"byParent":0,"reasons":[{"i":0,"n":34,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"ChannelStats","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"MemberList","renders":10,"withoutDom":10,"byParent":10,"reasons":[{"i":3,"n":10,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":10,"way":"react-query:fetch → success [\"topic\"] › ChannelStats · store #3 › MemberList · props equal"}]},{"name":"OnlineNow","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"Status","renders":9,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":4,"n":7,"reason":"external store #3 [useChatStore] outer"},{"i":7,"n":3,"reason":"external store #8 [useChatStore] selectSeen"}]},{"name":"TypingLine","renders":9,"withoutDom":0,"byParent":0,"reasons":[{"i":1,"n":9,"reason":"external store #2 [presenceStore] (s)=>s.typing"}]},{"name":"Unread","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":5,"n":1,"reason":"external store #2 [useChatStore] selectUnread"}]},{"name":"MessageList","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":6,"n":1,"reason":"external store #2 [useChatStore] selectMessageIds"}]},{"name":"Messag … [168 more]
```

**agent:** The recorder confirms `MemberList` inside `ChannelStats.tsx` re-renders 10/10 times with **unchanged DOM** — its own note says "parent: same props, memo would skip it". This lines up exactly with the complaint: `ChannelStats` polls every 500ms (twice a second) via react-query, and each poll drags the sibling `MemberList` along, which re-sorts a 1500-name array for nothing (44ms/hit, causing the observed 50ms long frame). Meanwhile `OnlineNow`'s sibling list uses `useMemo` and stays cheap (0.4ms/hit) despite re-rendering the same number of times — proof this is fixable without changing what's shown.

Let me apply the fix: memoize `MemberList` so it skips re-rendering when its (nonexistent) props don't change.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelStats.tsx","old_string":"import { useQuery } from '@tanstack/react-query';","new_string":"import { memo } from 'react';\nimport { useQuery } from '@tanstack/react-query';"}
```

**←**
```
The file src/components/ChannelStats.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelStats.tsx","old_string":"const MemberList = () => {\n  const sorted = [...MEMBERS].sort(byName);\n  return (\n    <ul className=\"members\" data-testid=\"members\">\n      {sorted.slice(0, 8).map((name) => (\n        <li key={name}>{name}</li>\n      ))}\n      <li className=\"more\">and {sorted.length - 8} more</li>\n    </ul>\n  );\n};","new_string":"const MemberList = memo(() => {\n  const sorted = [...MEMBERS].sort(byName);\n  return (\n    <ul className=\"members\" data-testid=\"members\">\n      {sor … [166 more]
```

**←**
```
The file src/components/ChannelStats.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let me record a fresh session to prove the fix worked, using the same reload-and-wait scenario.

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ rpr:record_page**
```
{"replay":"20260928-081800-app-panel-053b","label":"after"}
```

**←**
```
{"id":"20260928-081856-app-record-9a14","url":"http://localhost:38631/?tick=150","requested":"http://localhost:38631/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-081800-app-panel-053b has no actions: recorded the page as it is for 5011 ms instead"]}
```

**agent:** `wasting: []` and `rendersWithoutDom: 0` (down from 10). Let's get the full comparison numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-081800-app-panel-053b","after":"20260928-081856-app-record-9a14"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-081800-app-panel-053b","durationMs":5011},"after":{"id":"20260928-081856-app-record-9a14","durationMs":5028},"totals":{"commits":"44 → 43 (-2%)","renders":"88 → 66 (-25%)","commitsPerSec":"8.78 → 8.55 (-3%)","rendersPerSec":"17.56 → 13.13 (-25%)","rendersPerCommit":"2 → 1.5 (-25%)","rendersWithoutDomPerSec":"2 → 0 (-100%)","rendersPerTextChange":"2.1 → 2 (-5%)","longTaskMaxMs":"50 → 0 (-100%)"},"roots":[{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"2 → 1.99 (-1%)","perHit":"2 → 1 (-50%)","instances":"1 → 1 (0%)","cascadePerSec":"3.99 → 1.99 (-50%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"Settings … [2182 more]
```

**agent:** Confirmed and fixed. Here's what was happening and what changed.

**Root cause:** `ChannelStats` polls `react-query` every 500ms (twice a second, matching your complaint exactly). Each poll updates `data.online`, which legitimately re-renders the `<b>{online}</b>` text — but it also dragged its sibling `MemberList` along for the ride. `MemberList` takes no props and always renders identically, yet on every single poll it re-sorted a 1500-name array (`[...MEMBERS].sort(byName)`) for no visible change — 10/10 of its renders left the DOM completely unchanged. That's the stutter: a ~44ms unnecessary sort landing twice a second, producing a 50ms long frame.

**Fix:** wrapped `MemberList` in `React.memo` (`src/components/ChannelStats.tsx`) so React skips it when its props haven't changed, which they never do. Nothing about what's rendered changed — same markup, same data, same `data-testid`s.

**Before → after** (same 5s scenario, replayed):
- `rendersWithoutDom`/sec: 2 → 0 (**-100%**)
- Longest task: 50ms → 0ms (**-100%**)
- `ChannelStats` cascade: 2 renders/hit → 1 render/hit (**-50%**, `MemberList` no longer rides along)
- Total renders/sec: 17.6 → 13.1 (**-25%**)
- Recorder's `wasting` list: `[MemberList]` → `[]` (empty — no root renders for nothing anymore)

I also checked `OnlineNow`, which shows a similar member list but already memoizes the sort via `useSortedMembers`'s `useMemo` — that one was fine and untouched. No other roots in the recording render without a DOM change, so this was the only fix needed.
