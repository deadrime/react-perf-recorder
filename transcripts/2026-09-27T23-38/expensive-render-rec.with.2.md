# expensive-render-rec, with the plugin, run 2

fixed (waste 0.19); checks 5 of 5; $0.41, 172 s, 25 turns

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

> ## Findings
> 
> The stutter was the `ChannelStats` component (`src/components/ChatView.tsx:30`), which polls a `useQuery` on a 500ms `refetchInterval` — almost exactly the "twice a second" the complaint described. That poll caused `ChannelStats` to re-render, and its child `MemberList` (`src/components/ChannelStats.tsx`) had no memoization, so every one of those re-renders re-sorted a static 1500-entry roster with `Intl`-aware `localeCompare` — expensive work redone for a list that never changes. That's what showed up as long tasks/dropped frames every ~500ms.
> 
> ## Fix
> 
> Wrapped `MemberList` in `React.memo` (`src/components/ChannelStats.tsx`). It takes no props and its source array (`MEMBERS`) is a module-level constant, so once mounted it never needs to re-render — this doesn't change anything the page shows.
> 
> ## Before / after (5s idle recording, same setup both times)
> 
> | metric | before | after |
> |---|---|---|
> | longest task | 60ms | **0ms** |
> | renders w/o DOM change per sec | 1.99 | **0** |
> | total renders | 76 | 66 (-13%) |
> | `ChannelStats` renders per poll hit | 2 (itself + MemberList) | **1** |
> | `ChannelStats` cascade/sec | 3.99 | **2** |
> 
> The long-task spikes that lined up with the poll are gone entirely, and `ChannelStats`'s own cascade halved since `MemberList` no longer re-renders under it. Everything else in the recording (message arrivals, typing indicator, sync bar) is unchanged, confirming nothing visible changed — only the wasted sort was removed.

## What it changed

```
diff -ruN a/src/components/ChannelStats.tsx b/src/components/ChannelStats.tsx
--- a/src/components/ChannelStats.tsx
+++ b/src/components/ChannelStats.tsx
@@ -1,10 +1,12 @@
+import { memo } from 'react';
 import { useQuery } from '@tanstack/react-query';
 
 const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
 const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
 const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
 const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
-const MemberList = () => {
+/** MEMBERS never changes, so this never needs to re-render once mounted. */
+const MemberList = memo(() => {
   const sorted = [...MEMBERS].sort(byName);
   return (
     <ul className="members" data-testid="members">
@@ -14,7 +16,7 @@
       <li className="more">and {sorted.length - 8} more</li>
     </ul>
   );
-};
+});
 
 let polls = 0;
```

## The steps

**agent:** I'll use the react-perf-recorder skill, which is built exactly for this kind of investigation.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Investigate periodic stutter (~2x/second) on the page while idle after messages load. Recording id is in ./recording.txt. Reproduce steps: open page, wait for messages to load, leave idle for a few seconds — scrolling jerks during this. Find whether anything re-renders for nothing and why, fix it in ./src without changing what the page shows, and provide before/after numbers proving the fix. If nothing is wrong, make no changes."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [3951 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-234253-app-panel-1383
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:36069/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
```

**→ rpr:get_recording**
```
{"id":"20260927-234253-app-panel-1383"}
```

**←**
```
{"id":"20260927-234253-app-panel-1383","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234253-app-panel-1383","summary":{"id":"20260927-234253-app-panel-1383","status":"done","createdAt":"2026-09-27T23:42:58.429Z","source":"panel","url":"http://localhost:36069/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":88,"rendersPerScopeCommit":2,"rendersFromOutside":0,"rendersWithoutDom":10,"domTextChanges":41,"rendersPerTextChange":2.1},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.14,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":2,"noDomChange":0,"renderMsPerHit":40.4,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → succes … [5528 more]
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

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/measuring-a-fix.md"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/reading-a-recording.md"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ Grep**
```
{"pattern":"data-testid","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/components/TimeAgo.tsx:6:  return <small data-testid="time-ago">{label}</small>;
src/components/OnlineNow.tsx:11:    <p className="side-line" data-testid="online">
src/components/ChatPanel.tsx:13:  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
src/components/ChatPanel.tsx:21:    <section className="panel" data-testid="chat-panel">
src/components/Workspace.tsx:4:  <strong className="workspace" data-testid="workspace">
src/components/ChatView.tsx:28:      <aside className="side" data-testid="side-panel">
src/components/MessageCount.tsx:6:    <p className="side-line" data-testid="count">
src/components/Messages.tsx:34:    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
src/components/Messages.tsx:45:      <button type="button" className="delete" title="Delete" data-testid={`delete-${id}`} onClick={() => useChatStore.getState().removeMessage(id)}>
src/components/Messages.tsx:55:    <ul className="messages" data-testid="messages">
src/components/Messages.tsx:64:  <ul className="people" data-testid="people">
src/components/Settings.tsx:20:    <span className="badge muted" data-testid="timezone">
src/components/TypingBadge.tsx:17:    <span className="badge muted" data-testid="typing-badge">
src/components/ChannelTopic.tsx:9:    <span className="topic" data-testid="topic">
src/components/Header.tsx:13:    <span className="badge" data-testid="unread">
src/components/Header.tsx:22 … [1497 more]
```

**→ rpr:record_page**
```
{"url":"http://localhost:36069/?tick=150","setup":"async (page) => { await page.goto(page.url()); await page.locator('[data-testid^=\"message-\"]').first().waitFor({ state: 'visible', timeout: 15000 }); }","ms":5000,"label":"before"}
```

**✗ error**
```
locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('[data-testid^="message-"]').first() to be visible[22m
```

**→ Read**
```
{"file_path":"src/components/Messages.tsx"}
```

**←**
```
1	import { memo, useMemo } from 'react';
2	import { memoize } from 'proxy-memoize';
3	import { messageInfo, selectMessageIds, selectSeen } from '../store/selectors';
4	import { useChatStore, type Chat } from '../store/chat';
5	import { useSettings } from './Settings';
6	import { TimeAgo } from './TimeAgo';
7	
8	function useMessageInfo(id: string) {
9	  const select = useMemo(() => memoize((s: Chat) => messageInfo(s, id)), [id]);
10	  return useChatStore(select);
11	}
12	
13	const Status = memo(({ id }: { id: string }) => {
14	  const info = useMessageInfo(id);
15	  const seen = useChatStore(selectSeen);
16	  return (
17	    <span className="status" title={seen ? 'read by everyone' : 'sent'}>
18	      ♥ <b>{info.reactions}</b> {seen ? '✓✓' : '✓'}
19	    </span>
20	  );
21	});
22	
23	const NO_FILES: string[] = [];
24	
25	const Attachments = memo(({ id }: { id: string }) => {
26	  const files = useChatStore((s) => s.attachmentsById[id] ?? NO_FILES);
27	  return files.length ? <span className="files">📎 {files.join(', ')}</span> : null;
28	});
29	
30	export const MessageRow = memo(({ id }: { id: string }) => {
31	  const message = useChatStore((s) => s.messageById[id]);
32	  const { dense } = useSettings();
33	  return (
34	    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
35	      <span className="avatar">{message.from[0]}</span>
36	      <span className="body">
37	        <span className="who">
38	          {message.from}
39	          <TimeA … [951 more]
```

**→ Read**
```
{"file_path":"src/feed.ts"}
```

**←**
```
1	import { useEffect } from 'react';
2	import { addActivity, beat, store } from './store/activity';
3	import { ARRIVAL_EVERY, TYPING_LEAD, presenceStore, senderAt, useChatStore, type Person } from './store/chat';
4	
5	const everyMs = Number(new URLSearchParams(location.search).get('tick') ?? 200);
6	
7	// A worker stands in for the chat socket: its messages reach the page as `message` events, like a WebSocket's.
8	const source = `let step = 0; setInterval(() => postMessage({ step: ++step }), ${everyMs});`;
9	
10	const IDLE: Person[][] = [[], ['Anna'], [], ['Boris', 'Chen'], []];
11	
12	/** Who is typing: whoever is about to send something, and otherwise whatever the room is doing. */
13	function typingAt(step: number): Person[] {
14	  const untilArrival = ARRIVAL_EVERY - (step % ARRIVAL_EVERY);
15	  if (untilArrival <= TYPING_LEAD) return [senderAt(step + untilArrival)];
16	  return IDLE[Math.floor(step / 4) % IDLE.length];
17	}
18	
19	export function useFeed() {
20	  useEffect(() => {
21	    const socket = connectFeed();
22	    return () => socket.terminate();
23	  }, []);
24	}
25	
26	function connectFeed() {
27	  const socket = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
28	  socket.addEventListener('message', (event: MessageEvent<{ step: number }>) => {
29	    const { step } = event.data;
30	    useChatStore.getState().tick(step);
31	    store.dispatch(beat(step));
32	    if (step % ARRIVAL_EVERY === 0) store.dispatch(addActivity({ tex … [229 more]
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

**→ rpr:record_page**
```
{"setup":"async (page) => { await page.goto('http://localhost:36069/?tick=150'); await page.locator('[data-testid=\"messages\"] li').first().waitFor({ state: 'visible', timeout: 15000 }); }","ms":5000,"label":"before"}
```

**←**
```
{"id":"20260927-234503-app-record-2d94","url":"http://localhost:36069/?tick=150","requested":"http://localhost:36069/?tick=150","durationSec":5,"commits":43,"renders":76,"rendersWithoutDom":10,"rendersPerCommit":1.8,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** Good, that worked. Now let me apply the fix and record an "after" session the same way.

**→ Read**
```
{"file_path":"src/components/ChannelStats.tsx"}
```

**←**
```
Wasted call — file unchanged since your last Read. Refer to that earlier tool_result instead.
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChannelStats.tsx","old_string":"import { useQuery } from '@tanstack/react-query';\n\nconst FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];\nconst LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];\nconst MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);\nconst byName = (a: string, b: string) => a.localeC … [1363 more]
```

**←**
```
The file src/components/ChannelStats.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now recording the "after" session with the same setup and duration.

**→ rpr:record_page**
```
{"setup":"async (page) => { await page.goto('http://localhost:36069/?tick=150'); await page.locator('[data-testid=\"messages\"] li').first().waitFor({ state: 'visible', timeout: 15000 }); }","ms":5000,"label":"after"}
```

**←**
```
{"id":"20260927-234522-app-record-16ed","url":"http://localhost:36069/?tick=150","requested":"http://localhost:36069/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** Renders dropped from 76 to 66. Let's get the full comparison.

**→ rpr:compare_recordings**
```
{"before":"20260927-234503-app-record-2d94","after":"20260927-234522-app-record-16ed"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260927-234503-app-record-2d94","durationMs":5014},"after":{"id":"20260927-234522-app-record-16ed","durationMs":5011},"totals":{"commits":"43 → 43 (0%)","renders":"76 → 66 (-13%)","commitsPerSec":"8.58 → 8.58 (0%)","rendersPerSec":"15.16 → 13.17 (-13%)","rendersPerCommit":"1.8 → 1.5 (-17%)","rendersWithoutDomPerSec":"1.99 → 0 (-100%)","rendersPerTextChange":"2.3 → 2 (-13%)","longTaskMaxMs":"60 → 0 (-100%)"},"roots":[{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 2 (+1%)","perHit":"2 → 1 (-50%)","instances":"1 → 1 (0%)","cascadePerSec":"3.99 → 2 (-50%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.58 → 6.59 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.58 → 6.59 (0%)"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 2 (+1%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.99 → 2 (+1%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.4 → 1.4 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.4 → 1.4 (0%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatP … [1102 more]
```

**agent:** ## Findings

The stutter was the `ChannelStats` component (`src/components/ChatView.tsx:30`), which polls a `useQuery` on a 500ms `refetchInterval` — almost exactly the "twice a second" the complaint described. That poll caused `ChannelStats` to re-render, and its child `MemberList` (`src/components/ChannelStats.tsx`) had no memoization, so every one of those re-renders re-sorted a static 1500-entry roster with `Intl`-aware `localeCompare` — expensive work redone for a list that never changes. That's what showed up as long tasks/dropped frames every ~500ms.

## Fix

Wrapped `MemberList` in `React.memo` (`src/components/ChannelStats.tsx`). It takes no props and its source array (`MEMBERS`) is a module-level constant, so once mounted it never needs to re-render — this doesn't change anything the page shows.

## Before / after (5s idle recording, same setup both times)

| metric | before | after |
|---|---|---|
| longest task | 60ms | **0ms** |
| renders w/o DOM change per sec | 1.99 | **0** |
| total renders | 76 | 66 (-13%) |
| `ChannelStats` renders per poll hit | 2 (itself + MemberList) | **1** |
| `ChannelStats` cascade/sec | 3.99 | **2** |

The long-task spikes that lined up with the poll are gone entirely, and `ChannelStats`'s own cascade halved since `MemberList` no longer re-renders under it. Everything else in the recording (message arrivals, typing indicator, sync bar) is unchanged, confirming nothing visible changed — only the wasted sort was removed.
