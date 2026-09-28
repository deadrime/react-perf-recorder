# expensive-render-rec, with the plugin, run 2

fixed (waste 0.22); checks 5 of 5; $0.31, 136 s, 18 turns

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

> Found it, fixed it, and confirmed with recordings.
> 
> **The cause:** `ChannelStats` (`src/components/ChannelStats.tsx`) polls a `presence` query every 500ms (`refetchInterval: 500`) — that's your "twice a second." Each poll updates `data.online`, which correctly re-renders `ChannelStats`. But the same render also re-ran `MemberList`, an inline child with no props, which did `[...MEMBERS].sort(byName)` — sorting a 1500-entry array from scratch, every single tick, even though the member list never changes and has nothing to do with the online count. That's the jank: a full re-sort of 1500 names twice a second, unrelated to what actually changed.
> 
> **The fix:** sort the (constant) member list once at module load instead of on every render, and wrap `MemberList` in `memo` so React skips it entirely when its (nonexistent) props haven't changed. Same markup, same order, same count — nothing the page shows changes.
> 
> **Before/after** (same 5s scenario replayed both times):
> | metric | before | after |
> |---|---|---|
> | renders/sec | 15.11 | 13.13 (−13%) |
> | renders-without-DOM-change /sec | 1.99 | 0 (−100%) |
> | longest blocking task | 60ms | 0ms (−100%) |
> | `ChannelStats` renders per poll hit | 2 | 1 (−50%) |
> 
> Everything else on the page (`SyncBar`, `OnlineNow`, `TypingLine`, `Status`) is unchanged (0% delta) — confirming the fix was isolated and nothing else's behavior shifted. The recorder's `wastingAfter` came back empty: no more wasted re-renders on the page.

## What it changed

```
diff -ruN a/src/components/ChannelStats.tsx b/src/components/ChannelStats.tsx
--- a/src/components/ChannelStats.tsx
+++ b/src/components/ChannelStats.tsx
@@ -1,20 +1,19 @@
+import { memo } from 'react';
 import { useQuery } from '@tanstack/react-query';
 
 const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
 const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
 const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
 const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
-const MemberList = () => {
-  const sorted = [...MEMBERS].sort(byName);
-  return (
-    <ul className="members" data-testid="members">
-      {sorted.slice(0, 8).map((name) => (
-        <li key={name}>{name}</li>
-      ))}
-      <li className="more">and {sorted.length - 8} more</li>
-    </ul>
-  );
-};
+const SORTED_MEMBERS = [...MEMBERS].sort(byName);
+const MemberList = memo(() => (
+  <ul className="members" data-testid="members">
+    {SORTED_MEMBERS.slice(0, 8).map((name) => (
+      <li key={name}>{name}</li>
+    ))}
+    <li className="more">and {SORTED_MEMBERS.length - 8} more</li>
+  </ul>
+));
 
 let polls = 0;
```

## The steps

**agent:** This is exactly what the react-perf-recorder skill is built for — it'll read the existing recording, find the re-render cascade root, and help me verify a fix with numbers.

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
1	20260928-001417-app-panel-f8b2
2	
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/reading-a-recording.md"}
```

**←**
```
1	# Reading a recording
2	
3	In the order a diagnosis needs: who started the cascade, why it rendered, how it reached the component, and how much
4	of it was wasted. What scheduled the commit: `causes-and-actions.md`.
5	
6	## Roots
7	
8	A **cascade root** is a component that rendered while its parent did not — where a render started. `hits` is how
9	many commits it started, `cascade` the renders it pulled, `perHit` the renders per commit, `instances` how many
10	copies fired at once. `outsideRoots` are roots above the recorded area that reached into it.
11	
12	`noDomChange` (per root) and `rendersWithoutDom` (in totals) count renders after which the DOM did not change —
13	waste with no argument attached. `ownDomUnchanged`, when a root has it, counts its hits that changed none of the elements it
14	renders itself nor anything a child drew from a value the root passed it in props: what changed was in children that
15	render on their own anyway, so the root's own render was spent handing them what they had. `mounts` other than zero on a page that only changes text means remounting: a
16	component declared inside a render, or an unstable `key`.
17	
18	A `warnings` line starting `React warned:` is React's own dev warning, caught since the page loaded: a list without
19	keys, two children with one key, a component setting another's state while it renders, an update loop. It names the
20	component; ", before the recording" means React printed it at load and prints it once, so it ho … [3287 more]
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/causes-and-actions.md"}
```

**←**
```
1	# Causes, actions, plugins, traps
2	
3	## Causes
4	
5	What scheduled each commit, aimed at the components it actually updated:
6	
7	| Cause                                 | Means                                                                            |
8	| ------------------------------------- | -------------------------------------------------------------------------------- |
9	| `zustand:<action>`                    | a store write, with the keys it changed and a `SAME-CONTENT` mark                |
10	| `redux:<action type>`                 | a Redux action that changed the store, with the slices it changed                |
11	| `react-query:fetch → success <key>`   | a query's events, one cause per query and commit, on its subscribers' commit     |
12	| `core:input <event>`                  | the person's click, keystroke, scroll                                            |
13	| `core:message WebSocket` / `Worker`   | a frame arrived                                                                  |
14	| `core:timer setInterval <fn> @ src/…` | a timer, with the place it was started                                           |
15	| `core:navigation push`                | a navigation                                                                     |
16	| `core:effect @ src/hooks/useX.ts`     | a setState from an effect                                                        |
17	| `core:update <fn> @ src/…`            | a plain call in the app's code; `(<package>)`  … [1888 more]
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
```

**agent:** Now let me read the recording's summary.

**→ rpr:get_recording**
```
{"id":"20260928-001417-app-panel-f8b2"}
```

**←**
```
{"id":"20260928-001417-app-panel-f8b2","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-001417-app-panel-f8b2","summary":{"id":"20260928-001417-app-panel-f8b2","status":"done","createdAt":"2026-09-28T00:14:22.201Z","source":"panel","url":"http://localhost:33829/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":88,"rendersPerScopeCommit":2,"rendersFromOutside":0,"rendersWithoutDom":10,"domTextChanges":41,"rendersPerTextChange":2.1},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.13,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":2,"noDomChange":0,"renderMsPerHit":38.9,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → succes … [5531 more]
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

**→ Glob**
```
{"pattern":"src/hooks/useSortedMembers*"}
```

**←**
```
src/hooks/useSortedMembers.ts
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:33829/?tick=150
2	
```

**→ rpr:record_page**
```
{"replay":"20260928-001417-app-panel-f8b2","label":"before"}
```

**←**
```
{"id":"20260928-001547-app-record-2839","url":"http://localhost:33829/?tick=150","requested":"http://localhost:33829/?tick=150","durationSec":5,"commits":43,"renders":76,"rendersWithoutDom":10,"rendersPerCommit":1.8,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-001417-app-panel-f8b2 has no actions: recorded the page as it is for 5014 ms instead"]}
```

**agent:** Baseline captured. Now applying the fix — `MemberList` in `ChannelStats.tsx` re-sorts a 1500-name list from scratch on every 500ms presence poll, even though the member list never changes and isn't affected by the poll.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelStats.tsx","old_string":"import { useQuery } from '@tanstack/react-query';\n\nconst FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];\nconst LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];\nconst MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);\nconst byName = (a: string, b: string) => a.localeC … [1277 more]
```

**←**
```
The file src/components/ChannelStats.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now recording the same scenario again to measure the effect.

**→ rpr:record_page**
```
{"replay":"20260928-001417-app-panel-f8b2","label":"after"}
```

**←**
```
{"id":"20260928-001605-app-record-5eb5","url":"http://localhost:33829/?tick=150","requested":"http://localhost:33829/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-001417-app-panel-f8b2 has no actions: recorded the page as it is for 5014 ms instead"]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-001547-app-record-2839","after":"20260928-001605-app-record-5eb5"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-001547-app-record-2839","durationMs":5031},"after":{"id":"20260928-001605-app-record-5eb5","durationMs":5026},"totals":{"commits":"43 → 43 (0%)","renders":"76 → 66 (-13%)","commitsPerSec":"8.55 → 8.56 (0%)","rendersPerSec":"15.11 → 13.13 (-13%)","rendersPerCommit":"1.8 → 1.5 (-17%)","rendersWithoutDomPerSec":"1.99 → 0 (-100%)","rendersPerTextChange":"2.3 → 2 (-13%)","longTaskMaxMs":"60 → 0 (-100%)"},"roots":[{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 1.99 (0%)","perHit":"2 → 1 (-50%)","instances":"1 → 1 (0%)","cascadePerSec":"3.98 → 1.99 (-50%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.56 → 6.57 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.56 → 6.57 (0%)"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 1.99 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.99 → 1.99 (0%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.39 → 1.39 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.39 → 1.39 (0%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < Messag … [1150 more]
```

**agent:** Found it, fixed it, and confirmed with recordings.

**The cause:** `ChannelStats` (`src/components/ChannelStats.tsx`) polls a `presence` query every 500ms (`refetchInterval: 500`) — that's your "twice a second." Each poll updates `data.online`, which correctly re-renders `ChannelStats`. But the same render also re-ran `MemberList`, an inline child with no props, which did `[...MEMBERS].sort(byName)` — sorting a 1500-entry array from scratch, every single tick, even though the member list never changes and has nothing to do with the online count. That's the jank: a full re-sort of 1500 names twice a second, unrelated to what actually changed.

**The fix:** sort the (constant) member list once at module load instead of on every render, and wrap `MemberList` in `memo` so React skips it entirely when its (nonexistent) props haven't changed. Same markup, same order, same count — nothing the page shows changes.

**Before/after** (same 5s scenario replayed both times):
| metric | before | after |
|---|---|---|
| renders/sec | 15.11 | 13.13 (−13%) |
| renders-without-DOM-change /sec | 1.99 | 0 (−100%) |
| longest blocking task | 60ms | 0ms (−100%) |
| `ChannelStats` renders per poll hit | 2 | 1 (−50%) |

Everything else on the page (`SyncBar`, `OnlineNow`, `TypingLine`, `Status`) is unchanged (0% delta) — confirming the fix was isolated and nothing else's behavior shifted. The recorder's `wastingAfter` came back empty: no more wasted re-renders on the page.
