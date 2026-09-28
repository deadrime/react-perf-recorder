# expensive-render-rec, with the plugin, run 1

fixed (waste 0.21); checks 5 of 5; $0.34, 134 s, 21 turns

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

> ## What I found
> 
> `ChannelStats` (`src/components/ChatView.tsx:30`) polls `queryKey: ['presence']` every 500ms — that's the "twice a second" cadence. Every one of those polls re-rendered `ChannelStats`, which re-rendered its inline child `MemberList` — a component that sorts a static 1,500-name array and builds 8 `<li>`s, taking ~47ms per render — even though `MemberList` takes no props and its output never changes. The recording flagged this precisely: `MemberList` rendered 10/10 times with `withoutDom: 10` and reason `parent: same props, memo would skip it`.
> 
> ## Fix
> 
> `src/components/ChannelStats.tsx` — wrapped `MemberList` in `React.memo`. Since it takes no props, this makes it render exactly once and skip on every subsequent poll. Nothing about what's shown changes (the sort is a pure function of a constant array).
> 
> ## Proof (same 5s idle scenario, replayed against the fixed page)
> 
> | metric | before | after |
> |---|---|---|
> | total renders | 88 | 66 (**-25%**) |
> | renders that changed no DOM | 1.99/s | **0** |
> | `ChannelStats` renders per poll (`perHit`) | 2 | **1** |
> | `ChannelStats` cascade per sec | 3.99 | **1.99** |
> | worst long task | 56ms | **0ms** |
> | roots still wasting after fix | — | **none** (`wastingAfter: []`) |
> 
> The other roots that shifted between runs (`Unread`, `MessageList`, `MessageCount`, `Connect(ActivityLog)` going, `Status` instances dropping) are one-off background events (a feed message tick, a Redux activity add) that happened to land in one 5-second window and not the other — noise, not caused by the fix; nothing else in the code was touched.

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

**agent:** This is exactly what the react-perf-recorder skill is built for — it'll read the recording and pinpoint the wasted re-renders with file/line detail. Let me invoke it.

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
1	20260928-081709-app-panel-6c9d
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

**agent:** Now let me pull the recording's summary.

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
{"id":"20260928-081709-app-panel-6c9d"}
```

**←**
```
{"id":"20260928-081709-app-panel-6c9d","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081709-app-panel-6c9d","summary":{"id":"20260928-081709-app-panel-6c9d","status":"done","createdAt":"2026-09-28T08:17:14.695Z","source":"panel","url":"http://localhost:42721/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":88,"rendersPerScopeCommit":2,"rendersFromOutside":0,"rendersWithoutDom":10,"domTextChanges":41,"rendersPerTextChange":2.1},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":2,"noDomChange":0,"renderMsPerHit":47.39,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → succe … [5529 more]
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
{"id":"20260928-081709-app-panel-6c9d","section":"components","top":30}
```

**←**
```
{"id":"20260928-081709-app-panel-6c9d","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081709-app-panel-6c9d","components":{"total":15,"offset":0,"items":[{"name":"SyncBar","renders":34,"withoutDom":0,"byParent":0,"reasons":[{"i":0,"n":34,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"ChannelStats","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"MemberList","renders":10,"withoutDom":10,"byParent":10,"reasons":[{"i":3,"n":10,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":10,"way":"react-query:fetch → success [\"topic\"] › ChannelStats · store #3 › MemberList · props equal"}]},{"name":"OnlineNow","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"Status","renders":9,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":4,"n":7,"reason":"external store #3 [useChatStore] outer"},{"i":7,"n":3,"reason":"external store #8 [useChatStore] selectSeen"}]},{"name":"TypingLine","renders":9,"withoutDom":0,"byParent":0,"reasons":[{"i":1,"n":9,"reason":"external store #2 [presenceStore] (s)=>s.typing"}]},{"name":"Unread","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":5,"n":1,"reason":"external store #2 [useChatStore] selectUnread"}]},{"name":"MessageList","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":6,"n":1,"reason":"external store #2 [useChatStore] selectMessageIds"}]},{"name":"Messag … [995 more]
```

**→ Grep**
```
{"pattern":"topic","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/store/chat.ts:23:  'Merged. The release notes are in the channel topic',
src/components/ChannelTopic.tsx:3:const fetchTopic = async () => ({ topic: 'Release week: freeze on Thursday' });
src/components/ChannelTopic.tsx:5:/** The topic can be changed from elsewhere, so it is polled. */
src/components/ChannelTopic.tsx:7:  const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
src/components/ChannelTopic.tsx:9:    <span className="topic" data-testid="topic">
src/components/ChannelTopic.tsx:10:      {isError ? 'topic unavailable' : data?.topic ?? '…'}
```

**agent:** Confirmed: `ChannelStats` polls every 500 ms (the "twice a second" cadence), and its inline `MemberList` child — which sorts a static 1,500-name array on every render — is not memoized despite taking no props. The recording shows this directly: `MemberList` renders 10/10 times with `withoutDom: 10` and reason `parent: same props, memo would skip it`. That's the stutter: a 47ms render every ~500ms for output that never changes.

Let me confirm the sort really is static (MEMBERS never changes) before fixing, then wrap it in `memo`.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelStats.tsx","old_string":"import { useQuery } from '@tanstack/react-query';\n\nconst FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];\nconst LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];\nconst MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);\nconst byName = (a: string, b: string) => a.localeC … [1328 more]
```

**←**
```
The file src/components/ChannelStats.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** That import was wrong — let me fix it to just pull `memo` from React and keep the original `useQuery` import.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelStats.tsx","old_string":"import { memo, useQuery } from './react-query-shim';\nimport { useQuery as useQueryOriginal } from '@tanstack/react-query';","new_string":"import { memo } from 'react';\nimport { useQuery } from '@tanstack/react-query';"}
```

**←**
```
The file src/components/ChannelStats.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Read**
```
{"file_path":"src/components/ChannelStats.tsx"}
```

**←**
```
1	import { memo } from 'react';
2	import { useQuery } from '@tanstack/react-query';
3	
4	const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
5	const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
6	const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
7	const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
8	const MemberList = memo(() => {
9	  const sorted = [...MEMBERS].sort(byName);
10	  return (
11	    <ul className="members" data-testid="members">
12	      {sorted.slice(0, 8).map((name) => (
13	        <li key={name}>{name}</li>
14	      ))}
15	      <li className="more">and {sorted.length - 8} more</li>
16	    </ul>
17	  );
18	});
19	
20	let polls = 0;
21	
22	export const ChannelStats = () => {
23	  const { data } = useQuery({
24	    queryKey: ['presence'],
25	    queryFn: async () => ({ online: 3 + (++polls % 4) }),
26	    refetchInterval: 500,
27	  });
28	  return (
29	    <>
30	      <p className="side-line" data-testid="stats">
31	        <b>{data?.online ?? '…'}</b> people online
32	      </p>
33	      <MemberList />
34	    </>
35	  );
36	};
37	
```

**agent:** Good, the file is correct now. Now let's measure before/after to prove it. Let me check the measuring reference first.

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/measuring-a-fix.md"}
```

**←**
````
1	# Measuring a fix
2	
3	Two recordings of one scenario — the code as it was, and the change — then `compare_recordings`. Do it when the cause
4	is a guess or numbers were asked for; a recording that names the root, reason and `file:line` is an answer already.
5	
6	## Route
7	
8	1. The recording with the problem — the person's, or `record_page`. Keep its id.
9	2. The change, in a git worktree when there is git (below); otherwise in place, and put back afterwards.
10	3. The same scenario on the change — `compare_recordings`' description says how to record it.
11	4. `compare_recordings` with `before: <id>`, `after: <new id>`.
12	5. A change that is not kept leaves nothing behind: `git worktree remove`, or the file as it was.
13	
14	## Worktree
15	
16	The working tree may hold someone else's changes; do not edit it for a measurement.
17	
18	```sh
19	git worktree add --detach ../<app>-fix && cd ../<app>-fix && npm ci
20	REACT_PERF_RECORDER_DIR=<abs path of the first checkout>/.agent-artifacts/perf-recorder npm run dev -- --port <other port>
21	```
22	
23	- `--detach`: no branch is made, and none is switched to.
24	- The worktree is the last commit, without uncommitted changes. When `git status` shows changes to files the page
25	  uses, record "before" in the worktree as well, before editing, so the sides differ by the fix alone.
26	- The variable puts both servers' sessions in the folder the MCP server reads; an `outDir` in the project's config
27	  overrides it — then set the s … [1124 more]
````

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**agent:** The original recording was left idle (no actions), so I can replay it against the now-fixed page to get a matching "after" recording, same duration and conditions.

**→ rpr:record_page**
```
{"replay":"20260928-081709-app-panel-6c9d","label":"after"}
```

**←**
```
{"id":"20260928-081854-app-record-d071","url":"http://localhost:42721/?tick=150","requested":"http://localhost:42721/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-081709-app-panel-6c9d has no actions: recorded the page as it is for 5013 ms instead"]}
```

**agent:** Renders dropped from 88 to 66, and `rendersWithoutDom` went from 10 to 0, with no roots left wasting. Let's get the full comparison for precise numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-081709-app-panel-6c9d","after":"20260928-081854-app-record-d071"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-081709-app-panel-6c9d","durationMs":5013},"after":{"id":"20260928-081854-app-record-d071","durationMs":5025},"totals":{"commits":"44 → 43 (-2%)","renders":"88 → 66 (-25%)","commitsPerSec":"8.78 → 8.56 (-3%)","rendersPerSec":"17.55 → 13.13 (-25%)","rendersPerCommit":"2 → 1.5 (-25%)","rendersWithoutDomPerSec":"1.99 → 0 (-100%)","rendersPerTextChange":"2.1 → 2 (-5%)","longTaskMaxMs":"56 → 0 (-100%)"},"roots":[{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 1.99 (0%)","perHit":"2 → 1 (-50%)","instances":"1 → 1 (0%)","cascadePerSec":"3.99 → 1.99 (-50%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"Set … [2190 more]
```

**agent:** ## What I found

`ChannelStats` (`src/components/ChatView.tsx:30`) polls `queryKey: ['presence']` every 500ms — that's the "twice a second" cadence. Every one of those polls re-rendered `ChannelStats`, which re-rendered its inline child `MemberList` — a component that sorts a static 1,500-name array and builds 8 `<li>`s, taking ~47ms per render — even though `MemberList` takes no props and its output never changes. The recording flagged this precisely: `MemberList` rendered 10/10 times with `withoutDom: 10` and reason `parent: same props, memo would skip it`.

## Fix

`src/components/ChannelStats.tsx` — wrapped `MemberList` in `React.memo`. Since it takes no props, this makes it render exactly once and skip on every subsequent poll. Nothing about what's shown changes (the sort is a pure function of a constant array).

## Proof (same 5s idle scenario, replayed against the fixed page)

| metric | before | after |
|---|---|---|
| total renders | 88 | 66 (**-25%**) |
| renders that changed no DOM | 1.99/s | **0** |
| `ChannelStats` renders per poll (`perHit`) | 2 | **1** |
| `ChannelStats` cascade per sec | 3.99 | **1.99** |
| worst long task | 56ms | **0ms** |
| roots still wasting after fix | — | **none** (`wastingAfter: []`) |

The other roots that shifted between runs (`Unread`, `MessageList`, `MessageCount`, `Connect(ActivityLog)` going, `Status` instances dropping) are one-off background events (a feed message tick, a Redux activity add) that happened to land in one 5-second window and not the other — noise, not caused by the fix; nothing else in the code was touched.
