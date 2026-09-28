# cost-over-count-rec, with the plugin, run 2

fixed (waste 0.37); checks 5 of 5; $0.40, 162 s, 22 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the idle page stutters about twice a second; scrolling the messages catches on it.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> ## Findings
> 
> Two things on the idle page were re-rendering for nothing, one of which was expensive enough to cause the visible stutter:
> 
> **1. `OnlineNow` (`src/components/OnlineNow.tsx`) — the stutter itself**
> `ChannelStats` polls the shared `['presence']` query every 500ms (`ChannelStats.tsx:25`), which also wakes `OnlineNow`'s read of the same query key — that part is legitimate, the online count really changes. But `OnlineNow` called `useSortedMembers({ sensitivity: 'base', numeric: true })` with a **new object literal every render**. That options object was the `useMemo` dependency inside `useSortedMembers` (`src/hooks/useSortedMembers.ts:5`), so the memo never hit and it re-sorted a 1,500-name roster with `localeCompare` on every single render — ~50ms of main-thread work, twice a second, which is exactly the "stutters twice a second, scrolling catches on it" symptom (it shows up as a long task blocking the frame).
> 
> Fix: hoist the options object to a module-level constant so the memo dependency is referentially stable. The sorted list, the online count, and everything shown on screen are unchanged — only the redundant sort is eliminated.
> 
> **2. `Unread` (`src/components/Header.tsx`) — a genuine wasted re-render**
> It read `useChatStore(selectWorkspace)`, i.e. the *whole* workspace object, but only displayed `workspace.unread`. The store replaces the workspace object on every tick (`store/chat.ts:72`) even though `unread` itself only changes once every 40 ticks. That made `Unread` re-render on every tick — 33 of 34 renders changed nothing in the DOM. A `selectUnread` selector already existed in `store/selectors.ts` but was unused. Switched to it, so zustand now bails out before scheduling a render unless `unread` actually changes.
> 
> ## Proof (same idle scenario, replayed via `record_page`)
> 
> | metric | before | after |
> |---|---|---|
> | renders/sec | 22.14 | 13.13 (**-41%**) |
> | renders that changed no DOM (/sec) | 6.58 | 0 (**-100%**) |
> | `Unread` cascade root | 6.78 hits/sec, 33/34 no-op | gone entirely |
> | `OnlineNow` render cost | 49.92 ms/hit | 0.38 ms/hit |
> | longest long task | 72ms (worst frame 80ms) | 0ms |
> | `wastingAfter` (recorder's own "still wasteful" list) | — | empty |
> 
> `ChannelStats` and `OnlineNow` still render exactly as often as before (1.99/sec each) — those renders are real data updates, untouched. Only the redundant recompute and the no-op `Unread` renders were removed.

## What it changed

```
diff -ruN a/src/components/Header.tsx b/src/components/Header.tsx
--- a/src/components/Header.tsx
+++ b/src/components/Header.tsx
@@ -1,17 +1,17 @@
 import { useStore } from 'zustand';
 import { useChatStore } from '../store/chat';
 import { draftStore } from '../store/draft';
-import { selectWorkspace } from '../store/selectors';
+import { selectUnread } from '../store/selectors';
 import { ChannelTopic } from './ChannelTopic';
 import { TimezoneBadge } from './Settings';
 import { TypingBadge } from './TypingBadge';
 import Workspace from './Workspace';
 
 const Unread = () => {
-  const workspace = useChatStore(selectWorkspace);
+  const unread = useChatStore(selectUnread);
   return (
     <span className="badge" data-testid="unread">
-      {workspace.unread} unread
+      {unread} unread
     </span>
   );
 };
diff -ruN a/src/components/OnlineNow.tsx b/src/components/OnlineNow.tsx
--- a/src/components/OnlineNow.tsx
+++ b/src/components/OnlineNow.tsx
@@ -1,10 +1,12 @@
 import { useQuery } from '@tanstack/react-query';
 import { useSortedMembers } from '../hooks/useSortedMembers';
 
+const SORT_ORDER: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
+
 /** The first few of the workspace by name, and how many of them are online now. */
 export const OnlineNow = () => {
   const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
-  const sorted = useSortedMembers({ sensitivity: 'base', numeric: true });
+  const sorted = useSortedMembers(SORT_ORDER);
   return (
     <p className="side-line" data-testid="online">
       {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-074724-app-panel-b6fe
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:44305/?tick=150
2	
```

**agent:** This matches a dedicated skill exactly for this task. Let me invoke it to analyze the recording and drive the fix.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Investigate idle-page stutter (~2x/sec) on http://localhost:44305/?tick=150 that interferes with scrolling messages. Existing recording id: 20260928-074724-app-panel-b6fe (captured via the recorder's panel in the page, reproduced by loading the page, waiting for messages to load, then leaving it idle for a few seconds). Read this recording to find any re-renders that happen for nothing, identify the cascade root and the hook/store causing it with file:line, and fix it in ./src without changing what the page renders/shows. Then prove th … [142 more]
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4787 more]

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
```

**→ rpr:get_recording**
```
{"id":"20260928-074724-app-panel-b6fe"}
```

**←**
```
{"id":"20260928-074724-app-panel-b6fe","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-074724-app-panel-b6fe","summary":{"id":"20260928-074724-app-panel-b6fe","status":"done","createdAt":"2026-09-28T07:47:29.673Z","source":"panel","url":"http://localhost:44305/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":111,"rendersPerScopeCommit":2.5,"rendersFromOutside":0,"rendersWithoutDom":33,"domTextChanges":41,"rendersPerTextChange":2.7},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.09,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":33,"renderMsPerHit":0.05,"reasons":["34× external store #2 [useChatStore] selectWorkspace · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Header.tsx:11 const workspace = useChatStore … [5794 more]
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
4	/** The first few of the workspace by name, and how many of them are online now. */
5	export const OnlineNow = () => {
6	  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
7	  const sorted = useSortedMembers({ sensitivity: 'base', numeric: true });
8	  return (
9	    <p className="side-line" data-testid="online">
10	      {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
11	    </p>
12	  );
13	};
14	
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
{"file_path":"src/components/Header.tsx"}
```

**←**
```
1	import { useStore } from 'zustand';
2	import { useChatStore } from '../store/chat';
3	import { draftStore } from '../store/draft';
4	import { selectWorkspace } from '../store/selectors';
5	import { ChannelTopic } from './ChannelTopic';
6	import { TimezoneBadge } from './Settings';
7	import { TypingBadge } from './TypingBadge';
8	import Workspace from './Workspace';
9	
10	const Unread = () => {
11	  const workspace = useChatStore(selectWorkspace);
12	  return (
13	    <span className="badge" data-testid="unread">
14	      {workspace.unread} unread
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

**→ Read**
```
{"file_path":"src/lib/members.ts"}
```

**←**
```
1	const FIRST = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ida', 'Jo', 'Kai', 'Liv', 'Max', 'Nia'];
2	const LAST = ['Ames', 'Bell', 'Cole', 'Dunn', 'Enns', 'Ford', 'Gray', 'Hart', 'Ives', 'Jett', 'Kerr', 'Lowe', 'Mace', 'Nash'];
3	
4	/** Everyone in the workspace. */
5	export const ROSTER = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 5) % FIRST.length]} ${LAST[(i * 3) % LAST.length]} ${i}`);
6	
7	export function sortMembers(names: string[], order: Intl.CollatorOptions): string[] {
8	  return [...names].sort((a, b) => a.localeCompare(b, 'en', order));
9	}
10	
```

**→ Read**
```
{"file_path":"src/store/selectors.ts"}
```

**←**
```
1	import { memoize } from 'proxy-memoize';
2	import type { Chat } from './chat';
3	
4	export const selectWorkspace = (s: Chat) => s.workspace;
5	export const selectUnread = (s: Chat) => s.workspace.unread;
6	
7	export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));
8	
9	export const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });
10	
11	export const selectSeen = (s: Chat) => s.workspace.unread < 13;
12	
```

**→ Read**
```
{"file_path":"src/store/chat.ts"}
```

**←**
```
1	import { create, type StateCreator } from 'zustand';
2	import { devtools } from 'zustand/middleware';
3	import { createStore } from 'zustand/vanilla';
4	
5	export type Person = 'Anna' | 'Boris' | 'Chen';
6	
7	export interface Message {
8	  id: string;
9	  from: Person;
10	  text: string;
11	  sentAt: number;
12	}
13	
14	/** The chat runs on a compressed clock: a message every 40 ticks, a reaction every 5, typing three ticks ahead. */
15	export const ARRIVAL_EVERY = 40;
16	export const TYPING_LEAD = 3;
17	const REACTION_EVERY = 5;
18	
19	const PEOPLE: Person[] = ['Anna', 'Boris', 'Chen'];
20	const ARRIVALS = [
21	  'One more thing before I forget — the picker keeps the scroll now',
22	  'Anyone else seeing the countdown flicker?',
23	  'Merged. The release notes are in the channel topic',
24	  'I moved the standup to 10:30 tomorrow',
25	];
26	
27	export const senderAt = (step: number): Person => PEOPLE[Math.floor(step / ARRIVAL_EVERY) % PEOPLE.length];
28	
29	interface FeedSlice {
30	  reactionsById: Record<string, number>;
31	  tick(step: number): void;
32	}
33	
34	export interface Prefs {
35	  timeFormat: '12h' | '24h';
36	  compact: boolean;
37	}
38	
39	export const DEFAULT_PREFS: Prefs = { timeFormat: '24h', compact: false };
40	
41	interface WorkspaceSlice {
42	  workspace: { id: string; name: string; unread: number; lastEventAt: number };
43	  prefs: Prefs;
44	  markRead(): void;
45	}
46	
47	interface MessagesSlice {
48	  messageById: Record<string, Message>;
49	  /**  … [3483 more]
```

**agent:** Found two real "renders for nothing" issues. Let me apply targeted fixes.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/OnlineNow.tsx","old_string":"import { useQuery } from '@tanstack/react-query';\nimport { useSortedMembers } from '../hooks/useSortedMembers';\n\n/** The first few of the workspace by name, and how many of them are online now. */\nexport const OnlineNow = () => {\n  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });\n  const sorted = useSortedMembers({ sensitivity: 'base', numeric: true });","new_string":"import { useQuery } from '@tanstack/react-query';\nimport { useSortedM … [391 more]
```

**←**
```
The file src/components/OnlineNow.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"import { selectWorkspace } from '../store/selectors';","new_string":"import { selectUnread } from '../store/selectors';"}
```

**←**
```
The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"const Unread = () => {\n  const workspace = useChatStore(selectWorkspace);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {workspace.unread} unread\n    </span>\n  );\n};","new_string":"const Unread = () => {\n  const unread = useChatStore(selectUnread);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {unread} unread\n    </span>\n  );\n};"}
```

**←**
```
The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's measure with a scripted replay of the same idle scenario, before vs after.

**→ rpr:record_page**
```
{"replay":"20260928-074724-app-panel-b6fe","label":"after"}
```

**←**
```
{"id":"20260928-074913-app-record-4a8a","url":"http://localhost:44305/?tick=150","requested":"http://localhost:44305/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-074724-app-panel-b6fe has no actions: recorded the page as it is for 5013 ms instead"]}
```

**agent:** No wasted roots left, and total renders dropped from 111 to 66. Let's get the full comparison for precise before/after numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-074724-app-panel-b6fe","after":"20260928-074913-app-record-4a8a"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-074724-app-panel-b6fe","durationMs":5013},"after":{"id":"20260928-074913-app-record-4a8a","durationMs":5028},"totals":{"commits":"44 → 43 (-2%)","renders":"111 → 66 (-41%)","commitsPerSec":"8.78 → 8.55 (-3%)","rendersPerSec":"22.14 → 13.13 (-41%)","rendersPerCommit":"2.5 → 1.5 (-40%)","rendersWithoutDomPerSec":"6.58 → 0 (-100%)","rendersPerTextChange":"2.7 → 2 (-26%)","longTaskMaxMs":"72 → 0 (-100%)"},"roots":[{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.78 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.78 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status": … [2197 more]
```

**→ rpr:get_recording**
```
{"id":"20260928-074913-app-record-4a8a"}
```

**←**
```
{"id":"20260928-074913-app-record-4a8a","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-074913-app-record-4a8a","summary":{"id":"20260928-074913-app-record-4a8a","status":"done","createdAt":"2026-09-28T07:49:18.865Z","label":"after","source":"script:record","url":"http://localhost:44305/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":43,"commitsPerSec":8.55,"commitsInScope":43,"renders":66,"rendersPerScopeCommit":1.5,"rendersFromOutside":0,"rendersWithoutDom":0,"domTextChanges":33,"rendersPerTextChange":2},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.56,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.12,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["33× zustand:feed/tick","33× core:message Worker"],"lanes":"Sync:33"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.18,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → succes … [3362 more]
```

**→ ToolSearch**
```
{"query":"playwright screenshot browser navigate","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**agent:** ## Findings

Two things on the idle page were re-rendering for nothing, one of which was expensive enough to cause the visible stutter:

**1. `OnlineNow` (`src/components/OnlineNow.tsx`) — the stutter itself**
`ChannelStats` polls the shared `['presence']` query every 500ms (`ChannelStats.tsx:25`), which also wakes `OnlineNow`'s read of the same query key — that part is legitimate, the online count really changes. But `OnlineNow` called `useSortedMembers({ sensitivity: 'base', numeric: true })` with a **new object literal every render**. That options object was the `useMemo` dependency inside `useSortedMembers` (`src/hooks/useSortedMembers.ts:5`), so the memo never hit and it re-sorted a 1,500-name roster with `localeCompare` on every single render — ~50ms of main-thread work, twice a second, which is exactly the "stutters twice a second, scrolling catches on it" symptom (it shows up as a long task blocking the frame).

Fix: hoist the options object to a module-level constant so the memo dependency is referentially stable. The sorted list, the online count, and everything shown on screen are unchanged — only the redundant sort is eliminated.

**2. `Unread` (`src/components/Header.tsx`) — a genuine wasted re-render**
It read `useChatStore(selectWorkspace)`, i.e. the *whole* workspace object, but only displayed `workspace.unread`. The store replaces the workspace object on every tick (`store/chat.ts:72`) even though `unread` itself only changes once every 40 ticks. That made `Unread` re-render on every tick — 33 of 34 renders changed nothing in the DOM. A `selectUnread` selector already existed in `store/selectors.ts` but was unused. Switched to it, so zustand now bails out before scheduling a render unless `unread` actually changes.

## Proof (same idle scenario, replayed via `record_page`)

| metric | before | after |
|---|---|---|
| renders/sec | 22.14 | 13.13 (**-41%**) |
| renders that changed no DOM (/sec) | 6.58 | 0 (**-100%**) |
| `Unread` cascade root | 6.78 hits/sec, 33/34 no-op | gone entirely |
| `OnlineNow` render cost | 49.92 ms/hit | 0.38 ms/hit |
| longest long task | 72ms (worst frame 80ms) | 0ms |
| `wastingAfter` (recorder's own "still wasteful" list) | — | empty |

`ChannelStats` and `OnlineNow` still render exactly as often as before (1.99/sec each) — those renders are real data updates, untouched. Only the redundant recompute and the no-op `Unread` renders were removed.
