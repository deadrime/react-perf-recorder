# query-rest-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.32, 117 s, 22 turns

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

> Every remaining root now shows `noDomChange: 0` — every render actually changes what's on screen. Nothing left is wasting.
> 
> ## What was found
> 
> **`ChannelTopic`** (`src/components/ChannelTopic.tsx`, rendered from `Header.tsx:31`) was the only pure waste on the page: 13 renders in 5s, and **all 13 changed nothing in the DOM** (`noDomChange: 13/13`).
> 
> Cause: the component destructured the query result as `const { data, ...query } = useQuery(...)`. The `...query` rest-spread reads every property off React Query's result (`isFetching`, `fetchStatus`, `dataUpdatedAt`, etc.) via its getters. That defeats React Query's tracked-property optimization — instead of only re-rendering when `data`/`isError` actually change, it re-renders on *every* poll (`refetchInterval: 400`), even though the topic text (`'Release week: freeze on Thursday'`) never changes. The channel was quiet, but this component was doing full renders roughly every 400ms for nothing.
> 
> ## Fix
> 
> Destructured only what's actually rendered:
> 
> ```diff
> - const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
> + const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
>   return (
>     <span className="topic" data-testid="topic">
> -     {query.isError ? 'topic unavailable' : data?.topic ?? '…'}
> +     {isError ? 'topic unavailable' : data?.topic ?? '…'}
>     </span>
>   );
> ```
> 
> Same markup, same polling interval, same behavior on error/success — only the render trigger changed.
> 
> ## Before/after (5s idle recording, same URL)
> 
> | metric | before | after |
> |---|---|---|
> | commits | 57 | 43 (**-25%**) |
> | renders | 91 | 66 (**-27%**) |
> | renders/sec | 18.15 | 13.17 (**-27%**) |
> | renders with no DOM change /sec | 2.59 | **0** (**-100%**) |
> | `ChannelTopic` cascade | 2.59/s | **gone entirely** |
> | `wastingAfter` (roots still rendering for nothing) | — | **empty** |
> 
> Every other top-level root (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) already had `noDomChange: 0` before the fix — they're driven by real state changes (message worker ticks, presence polling with actually-changing counts, typing indicator) and were left untouched.

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

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-082829-app-panel-430c
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:45167/?tick=150
2	
```

**agent:** I'll invoke the react-perf-recorder skill, which is built exactly for this kind of "why does this page re-render" investigation with before/after proof.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Idle chat page keeps main thread busy in a quiet channel. Recording id: 20260928-082829-app-panel-430c (in ./recording.txt). Dev server: http://localhost:45167/?tick=150 (in ./dev-url.txt). Source in ./src. Find what re-renders for nothing and why, fix in ./src without changing what the page shows, and prove it with before/after numbers. If nothing does, say so and change nothing."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4489 more]

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
```

**→ rpr:get_recording**
```
{"id":"20260928-082829-app-panel-430c"}
```

**←**
```
{"id":"20260928-082829-app-panel-430c","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-082829-app-panel-430c","summary":{"id":"20260928-082829-app-panel-430c","status":"done","createdAt":"2026-09-28T08:28:34.717Z","source":"panel","url":"http://localhost:45167/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":57,"commitsPerSec":11.37,"commitsInScope":57,"renders":91,"rendersPerScopeCommit":1.6,"rendersFromOutside":0,"rendersWithoutDom":13,"domTextChanges":41,"rendersPerTextChange":2.2},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.13,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelTopic","source":"src/components/Header.tsx:31","path":"Header < SettingsBySync < Layout","hits":13,"hitsPerSec":2.59,"instances":1,"perHit":1,"noDomChange":13,"renderMsPerHit":0.19,"reasons":["13× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelTopic.tsx:7 const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetc … [5961 more]
```

**→ Read**
```
{"file_path":"src/components/ChannelTopic.tsx"}
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
29	  <header className="head" data-testid="header">
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

**→ Grep**
```
{"pattern":"\"@tanstack/react-query\"","path":"package.json","output_mode":"content"}
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

**→ Grep**
```
{"pattern":"\"react-query\"","output_mode":"files_with_matches"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"node_modules/@tanstack/react-query/package.json"}
```

**←**
```
No files found
```

**→ Read**
```
{"file_path":"src/components/ChannelStats.tsx"}
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

**→ Grep**
```
{"pattern":"\"version\"","path":".","glob":"**/@tanstack/query-core/package.json","output_mode":"content","head_limit":5}
```

**←**
```
No matches found
```

**→ Glob**
```
{"pattern":"**/@tanstack/**/package.json","path":"."}
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

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelTopic.tsx","old_string":"  const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });\n  return (\n    <span className=\"topic\" data-testid=\"topic\">\n      {query.isError ? 'topic unavailable' : data?.topic ?? '…'}\n    </span>\n  );","new_string":"  const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });\n  return (\n    <span className=\"topic\" data-testid=\"topic\">\n      {isError ? 'topic unavailable' : d … [39 more]
```

**←**
```
The file src/components/ChannelTopic.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's measure with a fresh recording, then compare against the original baseline.

**→ rpr:record_page**
```
{"url":"http://localhost:45167/?tick=150","ms":5000,"label":"after"}
```

**←**
```
{"id":"20260928-082948-app-record-ca83","url":"http://localhost:45167/?tick=150","requested":"http://localhost:45167/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":[]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-082829-app-panel-430c","after":"20260928-082948-app-record-ca83"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-082829-app-panel-430c","durationMs":5014},"after":{"id":"20260928-082948-app-record-ca83","durationMs":5013},"totals":{"commits":"57 → 43 (-25%)","renders":"91 → 66 (-27%)","commitsPerSec":"11.37 → 8.58 (-25%)","rendersPerSec":"18.15 → 13.17 (-27%)","rendersPerCommit":"1.6 → 1.5 (-6%)","rendersWithoutDomPerSec":"2.59 → 0 (-100%)","rendersPerTextChange":"2.2 → 2 (-9%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"ChannelTopic","source":"src/components/Header.tsx:31","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"2.59 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"2.59 → 0 (-100%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.2 (-14%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.79 → 1.2 (-33%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.79 → 1.4 (-22%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.79 → 1.4 (-22%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"cha … [2400 more]
```

**→ rpr:get_recording**
```
{"id":"20260928-082948-app-record-ca83","section":"roots"}
```

**←**
```
{"id":"20260928-082948-app-record-ca83","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-082948-app-record-ca83","roots":{"total":5,"offset":0,"items":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.58,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.12,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["33× zustand:feed/tick","33× core:message Worker"],"lanes":"Sync:33","hooks":{"2":{"type":"useSyncExternalStore","path":["useBoundStore","useStore","useSyncExternalStoreWithSelector","SyncExternalStore"],"library":"zustand","libraryAt":0,"site":"src/components/ChatView.tsx:44","code":"const at = useChatStore((s) => s.workspace.lastEventAt);"}}},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.19,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → success [\"topic\"]","10× react-query:fetch → success [\"presence\"]"],"lanes":"Sync:10","hooks":{"3":{"type":"useSyncExternalStore","pa … [2580 more]
```

**agent:** Every remaining root now shows `noDomChange: 0` — every render actually changes what's on screen. Nothing left is wasting.

## What was found

**`ChannelTopic`** (`src/components/ChannelTopic.tsx`, rendered from `Header.tsx:31`) was the only pure waste on the page: 13 renders in 5s, and **all 13 changed nothing in the DOM** (`noDomChange: 13/13`).

Cause: the component destructured the query result as `const { data, ...query } = useQuery(...)`. The `...query` rest-spread reads every property off React Query's result (`isFetching`, `fetchStatus`, `dataUpdatedAt`, etc.) via its getters. That defeats React Query's tracked-property optimization — instead of only re-rendering when `data`/`isError` actually change, it re-renders on *every* poll (`refetchInterval: 400`), even though the topic text (`'Release week: freeze on Thursday'`) never changes. The channel was quiet, but this component was doing full renders roughly every 400ms for nothing.

## Fix

Destructured only what's actually rendered:

```diff
- const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
+ const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
  return (
    <span className="topic" data-testid="topic">
-     {query.isError ? 'topic unavailable' : data?.topic ?? '…'}
+     {isError ? 'topic unavailable' : data?.topic ?? '…'}
    </span>
  );
```

Same markup, same polling interval, same behavior on error/success — only the render trigger changed.

## Before/after (5s idle recording, same URL)

| metric | before | after |
|---|---|---|
| commits | 57 | 43 (**-25%**) |
| renders | 91 | 66 (**-27%**) |
| renders/sec | 18.15 | 13.17 (**-27%**) |
| renders with no DOM change /sec | 2.59 | **0** (**-100%**) |
| `ChannelTopic` cascade | 2.59/s | **gone entirely** |
| `wastingAfter` (roots still rendering for nothing) | — | **empty** |

Every other top-level root (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) already had `noDomChange: 0` before the fix — they're driven by real state changes (message worker ticks, presence polling with actually-changing counts, typing indicator) and were left untouched.
