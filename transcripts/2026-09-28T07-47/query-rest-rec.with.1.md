# query-rest-rec, with the plugin, run 1

fixed (waste 0); checks 5 of 5; $0.32, 149 s, 2 turns

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

> Confirmed — the fix is applied and verified in `src/components/ChannelTopic.tsx:7`.
> 
> **Root cause:** `ChannelTopic` polled a topic query every 400ms via React Query, but destructured the result with a rest-spread (`const { data, ...query } = useQuery(...)`). That spread reads every field of the query result (including ones like `isFetching`/`dataUpdatedAt` that change on every poll), defeating React Query's render optimization — so the component re-rendered on every single poll even though the topic text never changes.
> 
> **Evidence from your recording** (`20260928-080311-app-panel-2801`): `ChannelTopic` had 13 hits over 5s idle, all 13 with zero DOM change — 100% wasted.
> 
> **Fix:** destructure only the fields actually used (`data`, `isError`) instead of spreading the rest. Behavior is identical — same 400ms poll, same displayed text/error state.
> 
> **Before → after** (both idle, 5s, same URL/viewport):
> - Total commits: 57 → 43 (‑25%)
> - Total renders: 91 → 66 (‑27%)
> - Renders without a DOM change per second: 2.59 → 0 (‑100%)
> - `ChannelTopic` no longer appears as a cascade root at all — it still polls, it just no longer triggers a commit when nothing visible changed.
> 
> Everything else that still renders while idle (`SyncBar`, `ChannelStats`/`OnlineNow`, `TypingLine`, message feed) was confirmed to produce a real, visible DOM change on every render (`noDomChange: 0`), so those were left untouched — they're legitimate.

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
1	20260928-080311-app-panel-2801
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:34777/?tick=150
2	
```

**→ Agent**
```
{"description":"Diagnose and fix idle chat re-renders","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app lives in this folder, source in ./src (cwd: .). Dev server is running at http://localhost:34777/?tick=150 and hot-reloads on source changes.\n\nComplaint: the idle chat page keeps the main thread busy even in a quiet channel (no new messages). Repro: open the page and just leave it alone for a few seconds — something is churning that shouldn't be.\n\nThere's already a recording captured via the recorder's panel on the page, id: 20260928 … [1163 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a84adc0c6d47b7255 (internal ID - do not mention to user. Use SendMessage with to: 'a84adc0c6d47b7255', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-z0Xnh0/tmp/claude-0/-tmp-claude-eval-z0Xnh0-home-cwd/3a3a167a-5abe-4c5d-846e-6f5dc0fdf98d/tasks/a84adc0c6d47b7255.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to investigate the idle-page re-render issue using your existing recording (`20260928-080311-app-panel-2801`) and fix it if warranted. It's running in the background — I'll report back with the root cause and before/after numbers once it finishes.

> **→ rpr:get_recording**
> ```
> {"id":"20260928-080311-app-panel-2801"}
> ```

> **←**
> ```
> {"id":"20260928-080311-app-panel-2801","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-080311-app-panel-2801","summary":{"id":"20260928-080311-app-panel-2801","status":"done","createdAt":"2026-09-28T08:03:16.713Z","source":"panel","url":"http://localhost:34777/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":57,"commitsPerSec":11.36,"commitsInScope":57,"renders":91,"rendersPerScopeCommit":1.6,"rendersFromOutside":0,"rendersWithoutDom":13,"domTextChanges":41,"rendersPerTextChange":2.2},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelTopic","source":"src/components/Header.tsx:31","path":"Header < SettingsBySync < Layout","hits":13,"hitsPerSec":2.59,"instances":1,"perHit":1,"noDomChange":13,"renderMsPerHit":0.16,"reasons":["13× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelTopic.tsx:7 const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetc … [5939 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChatView.tsx"}
> ```

> **←**
> ```
> 1	import type { ReactNode } from 'react';
> 2	import { useFeed } from '../feed';
> 3	import ActivityLog from './ActivityLog';
> 4	import { useChatStore } from '../store/chat';
> 5	import { ChannelStats } from './ChannelStats';
> 6	import { ChatPanel } from './ChatPanel';
> 7	import { Composer } from './Composer';
> 8	import { Header } from './Header';
> 9	import { MessageCount } from './MessageCount';
> 10	import { OnlineNow } from './OnlineNow';
> 11	import { PrefsLine } from './PrefsLine';
> 12	import { SettingsProvider } from './Settings';
> 13	import { TypingLine } from './TypingLine';
> 14	import { WebhookForm } from './WebhookForm';
> 15	
> 16	function useChatLayout() {
> 17	  return { wide: true };
> 18	}
> 19	
> 20	export const ChatView = () => {
> 21	  const { wide } = useChatLayout();
> 22	  return (
> 23	    <main className={wide ? 'chat wide' : 'chat'}>
> 24	      <div className="thread">
> 25	        <ChatPanel />
> 26	        <Composer />
> 27	      </div>
> 28	      <aside className="side" data-testid="side-panel">
> 29	        <h3>Channel</h3>
> 30	        <ChannelStats />
> 31	        <MessageCount />
> 32	        <OnlineNow />
> 33	        <PrefsLine />
> 34	        <h3>Activity</h3>
> 35	        <ActivityLog />
> 36	        <h3>Webhook</h3>
> 37	        <WebhookForm />
> 38	      </aside>
> 39	    </main>
> 40	  );
> 41	};
> 42	
> 43	const SyncBar = () => {
> 44	  const at = useChatStore((s) => s.workspace.lastEventAt);
> 45	  return (
> 46	    <span className="sync" title="Live">
> 47	      <span className="sync-fill" style={{ width: `${(at % 20) … [577 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Header.tsx"}
> ```

> **←**
> ```
> 1	import { useStore } from 'zustand';
> 2	import { useChatStore } from '../store/chat';
> 3	import { draftStore } from '../store/draft';
> 4	import { selectUnread } from '../store/selectors';
> 5	import { ChannelTopic } from './ChannelTopic';
> 6	import { TimezoneBadge } from './Settings';
> 7	import { TypingBadge } from './TypingBadge';
> 8	import Workspace from './Workspace';
> 9	
> 10	const Unread = () => {
> 11	  const unread = useChatStore(selectUnread);
> 12	  return (
> 13	    <span className="badge" data-testid="unread">
> 14	      {unread} unread
> 15	    </span>
> 16	  );
> 17	};
> 18	
> 19	const DraftBadge = () => {
> 20	  const hasDraft = useStore(draftStore, (s) => s.hasDraft);
> 21	  return hasDraft ? (
> 22	    <span className="badge muted" data-testid="draft">
> 23	      draft
> 24	    </span>
> 25	  ) : null;
> 26	};
> 27	
> 28	export const Header = () => (
> 29	  <header className="head" data-testid="header">
> 30	    <Workspace />
> 31	    <ChannelTopic />
> 32	    <Unread />
> 33	    <TimezoneBadge />
> 34	    <TypingBadge />
> 35	    <DraftBadge />
> 36	  </header>
> 37	);
> 38	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChannelTopic.tsx"}
> ```

> **←**
> ```
> 1	import { useQuery } from '@tanstack/react-query';
> 2	
> 3	const fetchTopic = async () => ({ topic: 'Release week: freeze on Thursday' });
> 4	
> 5	/** The topic can be changed from elsewhere, so it is polled. */
> 6	export const ChannelTopic = () => {
> 7	  const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
> 8	  return (
> 9	    <span className="topic" data-testid="topic">
> 10	      {query.isError ? 'topic unavailable' : data?.topic ?? '…'}
> 11	    </span>
> 12	  );
> 13	};
> 14	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChannelStats.tsx"}
> ```

> **←**
> ```
> 1	import { useQuery } from '@tanstack/react-query';
> 2	import { memo } from 'react';
> 3	
> 4	const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
> 5	const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
> 6	const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
> 7	const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
> 8	const SORTED = [...MEMBERS].sort(byName);
> 9	
> 10	const MemberList = memo(() => (
> 11	  <ul className="members" data-testid="members">
> 12	    {SORTED.slice(0, 8).map((name) => (
> 13	      <li key={name}>{name}</li>
> 14	    ))}
> 15	    <li className="more">and {SORTED.length - 8} more</li>
> 16	  </ul>
> 17	));
> 18	
> 19	let polls = 0;
> 20	
> 21	export const ChannelStats = () => {
> 22	  const { data } = useQuery({
> 23	    queryKey: ['presence'],
> 24	    queryFn: async () => ({ online: 3 + (++polls % 4) }),
> 25	    refetchInterval: 500,
> 26	  });
> 27	  return (
> 28	    <>
> 29	      <p className="side-line" data-testid="stats">
> 30	        <b>{data?.online ?? '…'}</b> people online
> 31	      </p>
> 32	      <MemberList />
> 33	    </>
> 34	  );
> 35	};
> 36	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/OnlineNow.tsx"}
> ```

> **←**
> ```
> 1	import { useQuery } from '@tanstack/react-query';
> 2	import { useSortedMembers } from '../hooks/useSortedMembers';
> 3	
> 4	const ORDER: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
> 5	
> 6	/** The first few of the workspace by name, and how many of them are online now. */
> 7	export const OnlineNow = () => {
> 8	  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
> 9	  const sorted = useSortedMembers(ORDER);
> 10	  return (
> 11	    <p className="side-line" data-testid="online">
> 12	      {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
> 13	    </p>
> 14	  );
> 15	};
> 16	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/TypingLine.tsx"}
> ```

> **←**
> ```
> 1	import { useStore } from 'zustand';
> 2	import { presenceStore, type Person } from '../store/chat';
> 3	
> 4	const line = (typing: Person[]) => {
> 5	  if (typing.length === 0) return ' ';
> 6	  const names = typing.length > 1 ? `${typing.slice(0, -1).join(', ')} and ${typing.at(-1)}` : typing[0];
> 7	  return `${names} ${typing.length > 1 ? 'are' : 'is'} typing…`;
> 8	};
> 9	
> 10	export const TypingLine = () => {
> 11	  const typing = useStore(presenceStore, (s) => s.typing);
> 12	  return (
> 13	    <small className="connection" data-testid="typing">
> 14	      {line(typing)}
> 15	    </small>
> 16	  );
> 17	};
> 18	
> ```

> **→ Grep**
> ```
> {"pattern":"QueryClient|structuralSharing|notifyOnChangeProps","path":"src","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/main.tsx:1:import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
> src/main.tsx:9:const client = new QueryClient();
> src/main.tsx:14:    <QueryClientProvider client={client}>
> src/main.tsx:16:    </QueryClientProvider>
> ```

> **→ Grep**
> ```
> {"pattern":"\"@tanstack/react-query\"","path":"package.json","output_mode":"content"}
> ```

> **✗ error**
> ```
> Path does not exist: package.json. Note: your current working directory is ..
> ```

> **→ Grep**
> ```
> {"pattern":"\"@tanstack/react-query\"","path":".","output_mode":"content","-n":true}
> ```

> **←**
> ```
> No matches found
> ```

> **→ Glob**
> ```
> {"pattern":"**/package.json","path":"."}
> ```

> **←**
> ```
> No files found
> ```

> **→ Grep**
> ```
> {"pattern":"react-query","path":"/tmp/claude-eval-z0Xnh0/home","glob":"package.json","output_mode":"content"}
> ```

> **←**
> ```
> No matches found
> ```

> **→ Glob**
> ```
> {"pattern":"**/react-query/package.json","path":"."}
> ```

> **←**
> ```
> No files found
> ```

> **→ Grep**
> ```
> {"pattern":"\"version\"","path":"node_modules/@tanstack/react-query/package.json","output_mode":"content"}
> ```

> **✗ error**
> ```
> Permission to use Grep has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ChannelTopic.tsx","old_string":"  const { data, ...query } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });\n  return (\n    <span className=\"topic\" data-testid=\"topic\">\n      {query.isError ? 'topic unavailable' : data?.topic ?? '…'}\n    </span>\n  );","new_string":"  const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });\n  return (\n    <span className=\"topic\" data-testid=\"topic\">\n      {isError ? 'topic unavailable' : d … [39 more]
> ```

> **←**
> ```
> The file src/components/ChannelTopic.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now let's measure. Recording the idle page again with the same conditions (same URL, viewport, duration) after the fix.

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:34777/?tick=150","viewport":"1280x720","ms":5000,"label":"after"}
> ```

> **←**
> ```
> {"id":"20260928-080437-app-record-5960","url":"http://localhost:34777/?tick=150","requested":"http://localhost:34777/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-080311-app-panel-2801","after":"20260928-080437-app-record-5960"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-080311-app-panel-2801","durationMs":5017},"after":{"id":"20260928-080437-app-record-5960","durationMs":5014},"totals":{"commits":"57 → 43 (-25%)","renders":"91 → 66 (-27%)","commitsPerSec":"11.36 → 8.58 (-24%)","rendersPerSec":"18.14 → 13.16 (-27%)","rendersPerCommit":"1.6 → 1.5 (-6%)","rendersWithoutDomPerSec":"2.59 → 0 (-100%)","rendersPerTextChange":"2.2 → 2 (-9%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"ChannelTopic","source":"src/components/Header.tsx:31","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"2.59 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"2.59 → 0 (-100%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.2 (-14%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.79 → 1.2 (-33%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.79 → 1.4 (-22%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.79 → 1.4 (-22%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"cha … [2401 more]
> ```

> **→ Grep**
> ```
> {"pattern":"feed/message|feed/tick|activity/add","path":"src","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/store/chat.ts:88:      step % ARRIVAL_EVERY === 0 ? 'feed/message' : 'feed/tick'
> ```

> **agent:** ## Findings
> 
> **Root cause (the only real waste found):** `ChannelTopic` (`src/components/ChannelTopic.tsx:7`) polls `useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 })` and destructured the result as `const { data, ...query } = useQuery(...)`. React Query's render-optimization tracks which fields of the query result a component actually reads and only re-renders when a *read* field changes; a rest-spread (`...query`) reads every field eagerly (including `isFetching`, `fetchStatus`, `dataUpdatedAt`, …), so the component re-rendered on **every** 400ms poll even though the topic text never changes and only `isError` was ever used from `query`.
> 
> The recording (`20260928-080311-app-panel-2801`) showed this precisely: `ChannelTopic` root, `hits: 13`, `noDomChange: 13` — **100% of its renders over the 5s window changed nothing on screen**, all caused by `react-query:fetch → success ["topic"]`. Every other frequent root (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) had `noDomChange: 0` in that same recording — their re-renders each produced a real DOM change (live sync bar, changing presence counts, typing indicator, message feed), so they are not bugs.
> 
> ## Fix
> 
> `src/components/ChannelTopic.tsx:7-10` — destructure only the fields the component reads instead of the whole query result:
> 
> ```tsx
> const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
> ...
> {isError ? 'topic unavailable' : data?.topic ?? '…'}
> ```
> 
> Behavior is unchanged: still polls every 400ms, still shows the same topic text or "topic unavailable". Only *when* the component re-renders changes.
> 
> ## Before / after (both: `http://localhost:34777/?tick=150`, viewport 1280×720, no throttling, page left idle ~5s, no interaction)
> 
> - Before: `20260928-080311-app-panel-2801` — After: `20260928-080437-app-record-5960`, compared via `compare_recordings`.
> - Total commits: **57 → 43 (-25%)**
> - Total renders: **91 → 66 (-27%)**
> - `rendersWithoutDomPerSec`: **2.59 → 0 (-100%)**
> - `ChannelTopic` root: 13 wasted hits/5s → **root no longer appears in the cascade at all** (it still polls, it just no longer causes React commits)
> - `wastingAfter`: **empty** — no root renders for nothing after the fix
> 
> Other roots that lost some hits between the two runs (`Connect(ActivityLog)`, `Unread`, `MessageList`, `MessageCount`) are tied to a sparse, occasional `zustand:feed/message` / `redux:activity/add` event (`src/store/chat.ts:88`, fires every `ARRIVAL_EVERY` ticks) — this is normal run-to-run timing variance between two independent 5s captures, not an effect of the fix.
> 
> ## What still renders while idle (legitimate, not wasted)
> 
> All produce a real, visible DOM change on every hit (`noDomChange: 0` throughout, `rendersWithoutDom: 0` in the after recording):
> - `SyncBar` — `src/components/ChatView.tsx:44,55` — live sync bar width tied to `workspace.lastEventAt`, driven by the worker tick (`?tick=150`).
> - `ChannelStats` / `OnlineNow` — `src/components/ChannelStats.tsx:22`, `src/components/OnlineNow.tsx:8` — presence count query, value actually cycles each poll.
> - `TypingLine` — `src/components/TypingLine.tsx:11` — simulated typing indicator toggling.
> - `Status`/message roots — driven by the simulated message feed.
> 
> ## Not checked
> 
> - Whether the same rest-spread-on-`useQuery` pattern exists on other pages/routes outside this recording's scope.
> - Behavior at longer idle durations (>5s) or under CPU throttling.
> - Whether `SyncBar`'s per-render `useMemo` recompute (flagged in the recording as recomputing 34/34 times, `src/components/ChatView.tsx:44`) has any cost beyond the trivial arithmetic it does — recorder itself notes it only matters if that argument does heavy work, which it doesn't here.

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
7	  const { data, isError } = useQuery({ queryKey: ['topic'], queryFn: fetchTopic, refetchInterval: 400 });
8	  return (
9	    <span className="topic" data-testid="topic">
10	      {isError ? 'topic unavailable' : data?.topic ?? '…'}
11	    </span>
12	  );
13	};
14	
```

**agent:** Confirmed — the fix is applied and verified in `src/components/ChannelTopic.tsx:7`.

**Root cause:** `ChannelTopic` polled a topic query every 400ms via React Query, but destructured the result with a rest-spread (`const { data, ...query } = useQuery(...)`). That spread reads every field of the query result (including ones like `isFetching`/`dataUpdatedAt` that change on every poll), defeating React Query's render optimization — so the component re-rendered on every single poll even though the topic text never changes.

**Evidence from your recording** (`20260928-080311-app-panel-2801`): `ChannelTopic` had 13 hits over 5s idle, all 13 with zero DOM change — 100% wasted.

**Fix:** destructure only the fields actually used (`data`, `isError`) instead of spreading the rest. Behavior is identical — same 400ms poll, same displayed text/error state.

**Before → after** (both idle, 5s, same URL/viewport):
- Total commits: 57 → 43 (‑25%)
- Total renders: 91 → 66 (‑27%)
- Renders without a DOM change per second: 2.59 → 0 (‑100%)
- `ChannelTopic` no longer appears as a cascade root at all — it still polls, it just no longer triggers a commit when nothing visible changed.

Everything else that still renders while idle (`SyncBar`, `ChannelStats`/`OnlineNow`, `TypingLine`, message feed) was confirmed to produce a real, visible DOM change on every render (`noDomChange: 0`), so those were left untouched — they're legitimate.
