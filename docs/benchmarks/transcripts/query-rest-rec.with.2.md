# query-rest-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.31, 118 s, 22 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the idle chat page keeps the main thread busy, even in a quiet channel.
To reproduce: open the page and leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> Confirmed and fixed. Summary:
> 
> **Root cause**: `ChannelTopic` (`src/components/ChannelTopic.tsx:7`) polls `useQuery` every 400ms. The topic text never changes in a quiet channel, but the component destructured `const { data, ...query } = useQuery(...)`. Spreading the result with `...query` forces a read of *every* field on react-query's tracked-query proxy (`isFetching`, `fetchStatus`, `dataUpdatedAt`, etc.), which flip on every poll — defeating react-query's per-property render tracking. So the component re-rendered on every 400ms tick even though it only ever displays `data.topic` and `isError`, both of which stayed constant.
> 
> **Fix**: read only the two fields actually used, `const { data, isError } = useQuery(...)`, instead of spreading the rest. Same JSX, same displayed output.
> 
> **Before → after** (5s idle recording, same scenario, no fix vs. fixed):
> - Total commits: 55 → 43 (**-22%**)
> - Total renders: 78 → 66 (**-15%**)
> - Renders with zero DOM change: 2.39/s → **0/s (-100%)**
> - `ChannelTopic` as a re-render root: 2.39 hits/s → **gone entirely**
> - Every other root (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) unchanged at 0% — confirming nothing the page actually shows was affected.
> 
> No other component in the recording showed wasted renders: `ChannelStats`/`OnlineNow` update a genuinely changing presence count, `SyncBar`/`TypingLine` reflect genuinely changing store state — all had `noDomChange: 0`, so those were left alone.

## What it changed

```
diff -ruN a/src/components/ChannelTopic.tsx b/src/components/ChannelTopic.tsx
--- a/src/components/ChannelTopic.tsx
+++ b/src/components/ChannelTopic.tsx
@@ -4,10 +4,10 @@
 
 /** The topic can be changed from elsewhere, so it is polled. */
 export const ChannelTopic = () => {
-  const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
+  const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
   return (
     <span className="topic" data-testid="topic">
-      {query.isError ? 'topic unavailable' : data?.topic ?? '…'}
+      {isError ? 'topic unavailable' : data?.topic ?? '…'}
     </span>
   );
 };
```

## The steps

**agent:** This matches the react-perf-recorder skill exactly — let me use it to analyze the recording and find the cause.

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
1	20260927-235634-app-panel-7a10
2	
```

**→ Read**
```
{"file_path":"./dev-url.txt"}
```

**←**
```
1	http://localhost:40829/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**→ rpr:get_recording**
```
{"id":"20260927-235634-app-panel-7a10"}
```

**←**
```
{"id":"20260927-235634-app-panel-7a10","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235634-app-panel-7a10","summary":{"id":"20260927-235634-app-panel-7a10","status":"done","createdAt":"2026-09-27T23:56:39.344Z","source":"panel","url":"http://localhost:40829/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":57,"commitsPerSec":11.36,"commitsInScope":57,"renders":91,"rendersPerScopeCommit":1.6,"rendersFromOutside":0,"rendersWithoutDom":13,"domTextChanges":41,"rendersPerTextChange":2.2},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.19,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelTopic","source":"src/components/Header.tsx:31","path":"Header < SettingsBySync < Layout","hits":13,"hitsPerSec":2.59,"instances":1,"perHit":1,"noDomChange":13,"renderMsPerHit":0.21,"reasons":["13× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelTopic.tsx:7 const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetc … [5938 more]
```

**→ Read**
```
{"file_path":"./src/components/ChannelTopic.tsx"}
```

**←**
```
1	import { useQuery } from '@tanstack/react-query';
2	
3	const fetchTopic = async () => ({ topic: 'Release week: freeze on Thursday' });
4	
5	/** The topic can be changed from elsewhere, so it is polled. */
6	export const ChannelTopic = () => {
7	  const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
8	  return (
9	    <span className="topic" data-testid="topic">
10	      {query.isError ? 'topic unavailable' : data?.topic ?? '…'}
11	    </span>
12	  );
13	};
14	
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

**→ Grep**
```
{"pattern":"\"@tanstack/react-query\"","path":"./package.json"}
```

**✗ error**
```
Path does not exist: ./package.json. Note: your current working directory is ..
```

**→ Grep**
```
{"pattern":"\"@tanstack/react-query\"","path":"package.json"}
```

**✗ error**
```
Path does not exist: package.json. Note: your current working directory is ..
```

**→ Glob**
```
{"pattern":"**/package.json"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"*"}
```

**←**
```
src/app.css
src/components/TypingLine.tsx
src/components/ActivityLog.tsx
src/components/PrefsLine.tsx
src/components/ChannelStats.tsx
src/components/Composer/useFieldError.ts
src/components/Composer/index.tsx
src/components/WebhookForm.tsx
src/components/Header.tsx
src/components/TypingBadge.tsx
src/components/Settings.tsx
src/components/Messages.tsx
src/components/MessageCount.tsx
src/components/ChatView.tsx
src/components/Workspace.tsx
src/components/ChatPanel.tsx
src/components/OnlineNow.tsx
src/components/TimeAgo.tsx
src/hooks/useSortedMembers.ts
src/hooks/useMessageCount.ts
src/feed.ts
src/vite-env.d.ts
src/main.tsx
src/store/clock.ts
src/store/activity.ts
src/store/chat.ts
src/store/selectors.ts
src/store/draft.ts
src/lib/members.ts
src/lib/channel.ts
index.html
src/components/ChannelTopic.tsx
recording.txt
recording.json
dev-url.txt
```

**→ Grep**
```
{"pattern":"\"version\"","path":"node_modules/@tanstack/react-query/package.json"}
```

**✗ error**
```
Permission to use Grep has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Read**
```
{"file_path":"node_modules/@tanstack/react-query/package.json","limit":5}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**agent:** Found it: `ChannelTopic` (`src/components/ChannelTopic.tsx:7`) polls every 400ms via react-query, and its data never changes in a quiet channel — yet it re-rendered 13 times with **zero DOM change** in the 5s recording (100% waste). Other components in the sidebar (ChannelStats, OnlineNow, SyncBar, TypingLine) all show real data changes each render, so they're not the issue.

The cause: `const { data, ...query } = useQuery(...)` spreads the *entire* query result into `query`, which forces a read of every property (`isFetching`, `fetchStatus`, `dataUpdatedAt`, etc.) — even though the component only uses `query.isError`. React Query's per-property render tracking only skips a re-render for props that were *never read*; spreading defeats that, so the component re-renders on every poll tick even when the topic text is identical.

Let me capture a baseline recording of the current behavior before fixing it.

**→ rpr:record_page**
```
{"url":"http://localhost:40829/?tick=150","ms":5000,"label":"before"}
```

**←**
```
{"id":"20260927-235751-app-record-f518","url":"http://localhost:40829/?tick=150","requested":"http://localhost:40829/?tick=150","durationSec":5,"commits":55,"renders":78,"rendersWithoutDom":12,"rendersPerCommit":1.4,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** Baseline confirmed (12 wasted renders in this run). Now applying the fix.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelTopic.tsx","old_string":"  const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });\n  return (\n    <span className=\"topic\" data-testid=\"topic\">\n      {query.isError ? 'topic unavailable' : data?.topic ?? '…'}\n    </span>\n  );","new_string":"  const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });\n  return (\n    <span className=\"topic\" data-testid=\"topic\">\n      {isError ? 'topic unavailable' : data?.topic ?? '…'}\n    </span>\n … [6 more]
```

**←**
```
The file src/components/ChannelTopic.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ rpr:record_page**
```
{"url":"http://localhost:40829/?tick=150","ms":5000,"label":"after"}
```

**←**
```
{"id":"20260927-235803-app-record-ac0e","url":"http://localhost:40829/?tick=150","requested":"http://localhost:40829/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** Wasted renders dropped from 12 → 0. Let's get the full comparison for the numbers.

**→ rpr:compare_recordings**
```
{"before":"20260927-235751-app-record-f518","after":"20260927-235803-app-record-ac0e"}
```

**✗ error**
```
ENOENT: no such file or directory, stat '/tmp/tmp.tWwgk7hfQ4/20260927-235805-app-panel-ddb6/.session.json.17875.tmp'
```

**→ rpr:compare_recordings**
```
{"before":"20260927-235751-app-record-f518","after":"20260927-235803-app-record-ac0e"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260927-235751-app-record-f518","durationMs":5016},"after":{"id":"20260927-235803-app-record-ac0e","durationMs":5018},"totals":{"commits":"55 → 43 (-22%)","renders":"78 → 66 (-15%)","commitsPerSec":"10.96 → 8.57 (-22%)","rendersPerSec":"15.55 → 13.15 (-15%)","rendersPerCommit":"1.4 → 1.5 (+7%)","rendersWithoutDomPerSec":"2.39 → 0 (-100%)","rendersPerTextChange":"2.4 → 2 (-17%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"ChannelTopic","source":"src/components/Header.tsx:31","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"2.39 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"2.39 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.4 → 1.39 (-1%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.4 → 1.39 (-1%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.58 → 6.58 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.58 → 6.58 (0%)"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 1.99 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.99 → 1.99 (0%)"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"c … [1422 more]
```

**agent:** Confirmed and fixed. Summary:

**Root cause**: `ChannelTopic` (`src/components/ChannelTopic.tsx:7`) polls `useQuery` every 400ms. The topic text never changes in a quiet channel, but the component destructured `const { data, ...query } = useQuery(...)`. Spreading the result with `...query` forces a read of *every* field on react-query's tracked-query proxy (`isFetching`, `fetchStatus`, `dataUpdatedAt`, etc.), which flip on every poll — defeating react-query's per-property render tracking. So the component re-rendered on every 400ms tick even though it only ever displays `data.topic` and `isError`, both of which stayed constant.

**Fix**: read only the two fields actually used, `const { data, isError } = useQuery(...)`, instead of spreading the rest. Same JSX, same displayed output.

**Before → after** (5s idle recording, same scenario, no fix vs. fixed):
- Total commits: 55 → 43 (**-22%**)
- Total renders: 78 → 66 (**-15%**)
- Renders with zero DOM change: 2.39/s → **0/s (-100%)**
- `ChannelTopic` as a re-render root: 2.39 hits/s → **gone entirely**
- Every other root (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) unchanged at 0% — confirming nothing the page actually shows was affected.

No other component in the recording showed wasted renders: `ChannelStats`/`OnlineNow` update a genuinely changing presence count, `SyncBar`/`TypingLine` reflect genuinely changing store state — all had `noDomChange: 0`, so those were left alone.
