# cost-over-count-rec, with the plugin, run 1

fixed (waste 0.42); checks 5 of 5; $0.34, 133 s, 21 turns

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
> The idle-page stutter was real and traced to `OnlineNow` (src/components/OnlineNow.tsx). It renders twice a second — that's expected, since it displays `data?.online` from a react-query cache entry (`['presence']`) that `ChannelStats` polls every 500ms (`refetchInterval: 500` in ChannelStats.tsx:25). The problem wasn't that it rendered, but what happened on each render: `useSortedMembers({ sensitivity: 'base', numeric: true })` (OnlineNow.tsx:7) passed a **new object literal every render**, invalidating the `useMemo` inside `useSortedMembers` and forcing a full locale-aware sort of the 1500-member roster on every one of those renders — the recording showed the memo "recomputed 10 of 10 renders... `order` is a new object with the same content every time."
> 
> While digging in, the recording also flagged `Unread` (src/components/Header.tsx) rendering on every socket tick (~6.8/sec) with its DOM never changing — it selected the whole `workspace` object (`selectWorkspace`), which gets a new reference whenever *any* workspace field changes (e.g. `lastEventAt`, ticking every event), even though `Unread` only displays `workspace.unread`.
> 
> ## Fixes (no behavior change)
> 
> 1. **OnlineNow.tsx** — hoisted the collator-options object to a module-level constant so it's referentially stable, letting the sort memo actually memoize.
> 2. **Header.tsx** — swapped `selectWorkspace` (whole object) for the existing-but-unused `selectUnread` selector, so `Unread` only resubscribes when `unread` itself changes.
> 
> ## Before / after (same 5s idle recording, replayed)
> 
> | metric | before | after |
> |---|---|---|
> | `OnlineNow` render cost | 44.96 ms/hit | 0.46 ms/hit |
> | longest task | 66 ms | 0 ms |
> | worst frame | 79 ms | 0 ms (no long frames) |
> | `Unread` hits (all no-op) | 6.78/sec, 0 DOM changes | root gone — no longer re-renders |
> | total renders/sec | 22.15 | 13.14 (-41%) |
> | renders with no DOM change /sec | 6.58 | 0 (-100%) |
> | roots still "wasting" | `Unread` | none |
> 
> Both roots that rendered for nothing are now fixed at their cause (stable memo input, narrower selector) rather than papered over with `memo()`. The remaining renders (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) all still change their DOM on (nearly) every hit — nothing left to trim without changing what the page shows.

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
 
+const MEMBER_ORDER: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
+
 /** The first few of the workspace by name, and how many of them are online now. */
 export const OnlineNow = () => {
   const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
-  const sorted = useSortedMembers({ sensitivity: 'base', numeric: true });
+  const sorted = useSortedMembers(MEMBER_ORDER);
   return (
     <p className="side-line" data-testid="online">
       {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
```

## The steps

**agent:** This task matches the react-perf-recorder skill exactly — it's built for finding unnecessary re-renders and proving fixes with before/after numbers. Let me invoke it.

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

A dev-only Vite plugin that records React re-renders from the page. Re … [3952 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-000859-app-panel-47b0
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:33663/?tick=150
2	
```

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
{"id":"20260928-000859-app-panel-47b0"}
```

**←**
```
{"id":"20260928-000859-app-panel-47b0","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-000859-app-panel-47b0","summary":{"id":"20260928-000859-app-panel-47b0","status":"done","createdAt":"2026-09-28T00:09:04.945Z","source":"panel","url":"http://localhost:33663/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":111,"rendersPerScopeCommit":2.5,"rendersFromOutside":0,"rendersWithoutDom":33,"domTextChanges":41,"rendersPerTextChange":2.7},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.13,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":33,"renderMsPerHit":0.01,"reasons":["34× external store #2 [useChatStore] selectWorkspace · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Header.tsx:11 const workspace = useChatStore … [5789 more]
```

**agent:** OnlineNow stands out: it renders 10 times in 5 seconds (~2/sec — matches "twice a second" stutter) at ~45ms per render, with a memo that recomputes every time despite `enabled: false` on its query. Let me look at the source.

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

**agent:** Found it — this is a two-part issue in `OnlineNow.tsx` (src/components/OnlineNow.tsx:6-7):

1. `OnlineNow` shares the `['presence']` react-query cache key with `ChannelStats`, which polls every 500ms (`refetchInterval: 500` in ChannelStats.tsx:25) — that's the "twice a second" cadence. Since `OnlineNow` displays `data?.online`, this re-render is legitimate (the value it shows does change).
2. But each of those re-renders also calls `useSortedMembers({ sensitivity: 'base', numeric: true })` with a **new object literal every render**. `useSortedMembers`'s `useMemo` depends on that object by reference, so it recomputes — resorting the 1500-member roster with locale-aware comparison — every single time, even though the sort order never actually changes. That's the wasted work behind the 44.96ms render (worst frame 79ms, 5 long tasks) causing the stutter.

The fix: hoist the options object to a stable module-level constant so the memo dependency never changes.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/OnlineNow.tsx","old_string":"import { useQuery } from '@tanstack/react-query';\nimport { useSortedMembers } from '../hooks/useSortedMembers';\n\n/** The first few of the workspace by name, and how many of them are online now. */\nexport const OnlineNow = () => {\n  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });\n  const sorted = useSortedMembers({ sensitivity: 'base', numeric: true });","new_string":"import { useQuery } from '@tanstack/react-query';\nimport { useSortedM … [395 more]
```

**←**
```
The file src/components/OnlineNow.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's prove the fix with a before/after recording, replaying the same idle scenario.

**→ rpr:record_page**
```
{"replay":"20260928-000859-app-panel-47b0","label":"after"}
```

**←**
```
{"id":"20260928-000958-app-record-1452","url":"http://localhost:33663/?tick=150","requested":"http://localhost:33663/?tick=150","durationSec":5,"commits":43,"renders":99,"rendersWithoutDom":33,"rendersPerCommit":2.3,"topRoot":"SyncBar ×33","wasting":[{"root":"Unread","source":"src/components/Header.tsx:32","hits":33,"instances":1,"noDomChange":33}],"warnings":["20260928-000859-app-panel-47b0 has no actions: recorded the page as it is for 5012 ms instead"]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-000859-app-panel-47b0","after":"20260928-000958-app-record-1452"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-000859-app-panel-47b0","durationMs":5012},"after":{"id":"20260928-000958-app-record-1452","durationMs":5027},"totals":{"commits":"44 → 43 (-2%)","renders":"111 → 99 (-11%)","commitsPerSec":"8.78 → 8.55 (-3%)","rendersPerSec":"22.15 → 19.69 (-11%)","rendersPerCommit":"2.5 → 2.3 (-8%)","rendersWithoutDomPerSec":"6.58 → 6.56 (0%)","rendersPerTextChange":"2.7 → 3 (+11%)","longTaskMaxMs":"66 → 0 (-100%)"},"roots":[{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.78 → 6.56 (-3%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.78 → 6.56 (-3%)"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySy … [2305 more]
```

**→ rpr:get_recording**
```
{"id":"20260928-000958-app-record-1452"}
```

**←**
```
{"id":"20260928-000958-app-record-1452","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-000958-app-record-1452","summary":{"id":"20260928-000958-app-record-1452","status":"done","createdAt":"2026-09-28T00:10:03.564Z","label":"after","source":"script:record","url":"http://localhost:33663/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":43,"commitsPerSec":8.55,"commitsInScope":43,"renders":99,"rendersPerScopeCommit":2.3,"rendersFromOutside":0,"rendersWithoutDom":33,"domTextChanges":33,"rendersPerTextChange":3},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.56,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.15,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["33× zustand:feed/tick","33× core:message Worker"],"lanes":"Sync:33"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","hits":33,"hitsPerSec":6.56,"instances":1,"perHit":1,"noDomChange":33,"renderMsPerHit":0.06,"reasons":["33× external store #2 [useChatStore] selectWorkspace · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Header.tsx:11 const workspace = useChatStore(s … [3872 more]
```

**agent:** The stutter's fixed, but the recording flags one more root that renders for nothing: `Unread` (Header.tsx:32) fires on every tick with zero DOM change. Let me check whether that's also fixable without altering the page.

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

**→ Grep**
```
{"pattern":"selectWorkspace","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/store/selectors.ts:4:export const selectWorkspace = (s: Chat) => s.workspace;
src/components/Header.tsx:4:import { selectWorkspace } from '../store/selectors';
src/components/Header.tsx:11:  const workspace = useChatStore(selectWorkspace);
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

**agent:** `selectUnread` already exists and is unused elsewhere. I'll switch `Unread` to use it directly instead of the whole workspace object.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"import { selectWorkspace } from '../store/selectors';\nimport { ChannelTopic } from './ChannelTopic';\nimport { TimezoneBadge } from './Settings';\nimport { TypingBadge } from './TypingBadge';\nimport Workspace from './Workspace';\n\nconst Unread = () => {\n  const workspace = useChatStore(selectWorkspace);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {workspace.unread} unread\n    </span>\n  );\n};","new_string":"import { selectUnread } from '../store/select … [369 more]
```

**←**
```
The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's re-verify with another before/after comparison to confirm both fixes hold.

**→ rpr:record_page**
```
{"replay":"20260928-000859-app-panel-47b0","label":"after2"}
```

**←**
```
{"id":"20260928-001037-app-record-ab12","url":"http://localhost:33663/?tick=150","requested":"http://localhost:33663/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-000859-app-panel-47b0 has no actions: recorded the page as it is for 5012 ms instead"]}
```

**agent:** `wasting: []` — no root left rendering for nothing. Let's pull the full comparison against the original for final numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-000859-app-panel-47b0","after":"20260928-001037-app-record-ab12"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-000859-app-panel-47b0","durationMs":5012},"after":{"id":"20260928-001037-app-record-ab12","durationMs":5024},"totals":{"commits":"44 → 43 (-2%)","renders":"111 → 66 (-41%)","commitsPerSec":"8.78 → 8.56 (-3%)","rendersPerSec":"22.15 → 13.14 (-41%)","rendersPerCommit":"2.5 → 1.5 (-40%)","rendersWithoutDomPerSec":"6.58 → 0 (-100%)","rendersPerTextChange":"2.7 → 2 (-26%)","longTaskMaxMs":"66 → 0 (-100%)"},"roots":[{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.78 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.78 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status": … [2181 more]
```

**agent:** ## Findings

The idle-page stutter was real and traced to `OnlineNow` (src/components/OnlineNow.tsx). It renders twice a second — that's expected, since it displays `data?.online` from a react-query cache entry (`['presence']`) that `ChannelStats` polls every 500ms (`refetchInterval: 500` in ChannelStats.tsx:25). The problem wasn't that it rendered, but what happened on each render: `useSortedMembers({ sensitivity: 'base', numeric: true })` (OnlineNow.tsx:7) passed a **new object literal every render**, invalidating the `useMemo` inside `useSortedMembers` and forcing a full locale-aware sort of the 1500-member roster on every one of those renders — the recording showed the memo "recomputed 10 of 10 renders... `order` is a new object with the same content every time."

While digging in, the recording also flagged `Unread` (src/components/Header.tsx) rendering on every socket tick (~6.8/sec) with its DOM never changing — it selected the whole `workspace` object (`selectWorkspace`), which gets a new reference whenever *any* workspace field changes (e.g. `lastEventAt`, ticking every event), even though `Unread` only displays `workspace.unread`.

## Fixes (no behavior change)

1. **OnlineNow.tsx** — hoisted the collator-options object to a module-level constant so it's referentially stable, letting the sort memo actually memoize.
2. **Header.tsx** — swapped `selectWorkspace` (whole object) for the existing-but-unused `selectUnread` selector, so `Unread` only resubscribes when `unread` itself changes.

## Before / after (same 5s idle recording, replayed)

| metric | before | after |
|---|---|---|
| `OnlineNow` render cost | 44.96 ms/hit | 0.46 ms/hit |
| longest task | 66 ms | 0 ms |
| worst frame | 79 ms | 0 ms (no long frames) |
| `Unread` hits (all no-op) | 6.78/sec, 0 DOM changes | root gone — no longer re-renders |
| total renders/sec | 22.15 | 13.14 (-41%) |
| renders with no DOM change /sec | 6.58 | 0 (-100%) |
| roots still "wasting" | `Unread` | none |

Both roots that rendered for nothing are now fixed at their cause (stable memo input, narrower selector) rather than papered over with `memo()`. The remaining renders (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) all still change their DOM on (nearly) every hit — nothing left to trim without changing what the page shows.
