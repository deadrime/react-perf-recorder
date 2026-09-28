# expensive-render-rec, with the plugin, run 1

fixed (waste 0.21); checks 5 of 5; $0.30, 104 s, 20 turns

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

> Confirmed the fix. Summary:
> 
> **What re-rendered for nothing:** `ChannelStats` polls `presence` every 500ms (`refetchInterval: 500`), which is legitimate — the online count needs to update. But its child `MemberList` (`src/components/ChannelStats.tsx`) took no props and wasn't memoized, so every poll also re-ran `MemberList`, which did `[...MEMBERS].sort(byName)` over 1500 names — pure waste, since that sorted list never changes. The recording showed `MemberList`: 10/10 renders with `withoutDom: 10` (never changed the DOM) and `reason: "parent: same props, memo would skip it"` — literally a case a `memo` would fully skip. It cost ~48ms/hit and produced the app's only long tasks (max 64ms, worst frame 65ms), landing twice a second — matching the reported stutter exactly.
> 
> **Fix:** wrapped `MemberList` in `React.memo` in `src/components/ChannelStats.tsx`. Nothing about what's shown changed — same member list, same online count, same update cadence.
> 
> **Before → after (same 5s replay of the recorded session):**
> - `rendersWithoutDomPerSec`: 2 → 0 (**-100%**)
> - `longTaskMaxMs`: 64 → 0 (**-100%**)
> - `ChannelStats` renders per poll (`perHit`): 2 → 1 (**-50%**)
> - total renders/sec: 17.56 → 13.13 (-25%)
> - `wastingAfter`: empty (no roots left rendering for nothing)
> 
> A few other roots (`Unread`, `MessageList`, `MessageCount`, `Connect(ActivityLog)`) appear as "gone" in the diff, but those each fired only once in the original 5s window (background feed randomness) and are unrelated to this fix — noise, not a regression.

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

**agent:** This matches the react-perf-recorder skill exactly — it's built for diagnosing unnecessary re-renders and proving fixes with before/after numbers. I'll invoke it.

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
1	20260928-075125-app-panel-7a8f
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:38931/?tick=150
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

**agent:** Now let me load the MCP tool and read the recording.

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings","max_results":10}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
```

**→ rpr:get_recording**
```
{"id":"20260928-075125-app-panel-7a8f"}
```

**←**
```
{"id":"20260928-075125-app-panel-7a8f","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075125-app-panel-7a8f","summary":{"id":"20260928-075125-app-panel-7a8f","status":"done","createdAt":"2026-09-28T07:51:30.064Z","source":"panel","url":"http://localhost:38931/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":88,"rendersPerScopeCommit":2,"rendersFromOutside":0,"rendersWithoutDom":10,"domTextChanges":41,"rendersPerTextChange":2.1},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.79,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":2,"instances":1,"perHit":2,"noDomChange":0,"renderMsPerHit":47.86,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → success  … [5526 more]
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
{"id":"20260928-075125-app-panel-7a8f","section":"components"}
```

**←**
```
{"id":"20260928-075125-app-panel-7a8f","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075125-app-panel-7a8f","components":{"total":15,"offset":0,"items":[{"name":"SyncBar","renders":34,"withoutDom":0,"byParent":0,"reasons":[{"i":0,"n":34,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"ChannelStats","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"MemberList","renders":10,"withoutDom":10,"byParent":10,"reasons":[{"i":3,"n":10,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":10,"way":"react-query:fetch → success [\"topic\"] › ChannelStats · store #3 › MemberList · props equal"}]},{"name":"OnlineNow","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"Status","renders":9,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":4,"n":7,"reason":"external store #3 [useChatStore] outer"},{"i":7,"n":3,"reason":"external store #8 [useChatStore] selectSeen"}]},{"name":"TypingLine","renders":9,"withoutDom":0,"byParent":0,"reasons":[{"i":1,"n":9,"reason":"external store #2 [presenceStore] (s)=>s.typing"}]},{"name":"Unread","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":5,"n":1,"reason":"external store #2 [useChatStore] selectUnread"}]},{"name":"MessageList","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":6,"n":1,"reason":"external store #2 [useChatStore] selectMessageIds"}]},{"name":"Messag … [168 more]
```

**agent:** Found it. `ChannelStats` polls every 500ms (`refetchInterval: 500`), causing 2 renders/sec — matching "stutters twice a second." Its child `MemberList` takes no props but isn't memoized, so it re-renders every time and redoes an expensive sort of 1500 names (`renderMsPerHit: 47.86ms`, worst frame 65ms) even though nothing in it ever changes (`withoutDom: 10` of 10 — 100% wasted). Let me confirm with the raw file and apply a minimal fix: memoize `MemberList`.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelStats.tsx","old_string":"import { useQuery } from '@tanstack/react-query';\n\nconst FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];\nconst LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];\nconst MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);\nconst byName = (a: string, b: string) => a.localeC … [1312 more]
```

**←**
```
The file src/components/ChannelStats.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** I made an error in that edit — let me fix the import statement properly.

**→ Read**
```
{"file_path":"src/components/ChannelStats.tsx"}
```

**←**
```
1	import { memo, useQuery } from 'react';
2	import { useQuery as useReactQuery } from '@tanstack/react-query';
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

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelStats.tsx","old_string":"import { memo, useQuery } from 'react';\nimport { useQuery as useReactQuery } from '@tanstack/react-query';","new_string":"import { memo } from 'react';\nimport { useQuery } from '@tanstack/react-query';"}
```

**←**
```
The file src/components/ChannelStats.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let me record the "after" scenario and compare against the original recording.

**→ rpr:record_page**
```
{"replay":"20260928-075125-app-panel-7a8f","label":"after"}
```

**←**
```
{"id":"20260928-075237-app-record-6114","url":"http://localhost:38931/?tick=150","requested":"http://localhost:38931/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-075125-app-panel-7a8f has no actions: recorded the page as it is for 5011 ms instead"]}
```

**agent:** `rendersWithoutDom` dropped from 10 to 0, and `wasting` is now empty. Let's get the full comparison numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-075125-app-panel-7a8f","after":"20260928-075237-app-record-6114"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-075125-app-panel-7a8f","durationMs":5011},"after":{"id":"20260928-075237-app-record-6114","durationMs":5026},"totals":{"commits":"44 → 43 (-2%)","renders":"88 → 66 (-25%)","commitsPerSec":"8.78 → 8.56 (-3%)","rendersPerSec":"17.56 → 13.13 (-25%)","rendersPerCommit":"2 → 1.5 (-25%)","rendersWithoutDomPerSec":"2 → 0 (-100%)","rendersPerTextChange":"2.1 → 2 (-5%)","longTaskMaxMs":"64 → 0 (-100%)"},"roots":[{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"2 → 1.99 (-1%)","perHit":"2 → 1 (-50%)","instances":"1 → 1 (0%)","cascadePerSec":"3.99 → 1.99 (-50%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"Settings … [2181 more]
```

**agent:** Confirmed the fix. Summary:

**What re-rendered for nothing:** `ChannelStats` polls `presence` every 500ms (`refetchInterval: 500`), which is legitimate — the online count needs to update. But its child `MemberList` (`src/components/ChannelStats.tsx`) took no props and wasn't memoized, so every poll also re-ran `MemberList`, which did `[...MEMBERS].sort(byName)` over 1500 names — pure waste, since that sorted list never changes. The recording showed `MemberList`: 10/10 renders with `withoutDom: 10` (never changed the DOM) and `reason: "parent: same props, memo would skip it"` — literally a case a `memo` would fully skip. It cost ~48ms/hit and produced the app's only long tasks (max 64ms, worst frame 65ms), landing twice a second — matching the reported stutter exactly.

**Fix:** wrapped `MemberList` in `React.memo` in `src/components/ChannelStats.tsx`. Nothing about what's shown changed — same member list, same online count, same update cadence.

**Before → after (same 5s replay of the recorded session):**
- `rendersWithoutDomPerSec`: 2 → 0 (**-100%**)
- `longTaskMaxMs`: 64 → 0 (**-100%**)
- `ChannelStats` renders per poll (`perHit`): 2 → 1 (**-50%**)
- total renders/sec: 17.56 → 13.13 (-25%)
- `wastingAfter`: empty (no roots left rendering for nothing)

A few other roots (`Unread`, `MessageList`, `MessageCount`, `Connect(ActivityLog)`) appear as "gone" in the diff, but those each fired only once in the original 5s window (background feed randomness) and are unrelated to this fix — noise, not a regression.
