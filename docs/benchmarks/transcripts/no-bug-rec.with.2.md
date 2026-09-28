# no-bug-rec, with the plugin, run 2

fixed (waste 0); checks 1 of 1; $0.42, 263 s, 20 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the chat page stays busy even when nobody touches it — reactions and read receipts keep arriving.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> I dug into the recording (`20260927-235433-app-panel-354e`, 5s idle capture, 44 commits / 78 renders) and checked every cascade root and every component against the recorder's own render-vs-DOM data. Result: **nothing re-renders for nothing here.**
> 
> **What the recorder shows**
> 
> - `totals.rendersWithoutDom: 0` — across all 44 commits, every single render produced a real DOM change.
> - Per-component breakdown (`components` section) confirms it individually — `SyncBar`, `ChannelStats`, `OnlineNow`, `Status`, `TypingLine`, `Unread`, `MessageList`, `MessageCount`, `ActivityLog` — every one of them has `withoutDom: 0`. None are burning cycles on renders that leave the screen untouched.
> 
> **Why the page still looks "busy"**
> 
> The fake backend (`src/feed.ts`) runs a worker that posts a tick every 150–200ms and treats it as a live socket event. Each tick genuinely does one of:
> - Bumps `workspace.lastEventAt` every tick → `SyncBar`'s progress fill (`src/components/ChatView.tsx:44-47`) legitimately moves every time (comment even says "the live bar moves with every event from the socket").
> - Every 5th tick, increments the reaction count on one rotating message → `Status` (`src/components/Messages.tsx:13-21`) re-renders only for the message that actually got the reaction (proxy-memoize confirms only 8/103 selector calls even recomputed a new value).
> - Once per ~6s, a new message arrives → flips `unread` past the read threshold, which is why all 3 `Status` instances flip their ✓✓/✓ receipt together — a real, simultaneous state change, not duplication.
> - `ChannelStats`/`OnlineNow` both read a shared `['presence']` react-query key polling every 500ms; the online count actually changes on every poll (`3 + (++polls % 4)`), so both visibly update — no redundant fetch, no stale render.
> 
> Memoization already in place (`React.memo` on `MessageRow`/`Status`/`Attachments`, `proxy-memoize` selectors, Redux `connect` with shallow equality) is doing exactly its job: things that don't change (e.g. `MessageRow`, `Attachments`, `MemberList`, `Connect(ActivityLog)` on the 33 no-op "beat" actions) don't re-render at all.
> 
> So the "busy" feeling is the simulated live feed doing what it's built to do (heartbeat every ~150ms plus periodic reactions/receipts), not a rendering bug. Per your instructions, since the first recording shows nothing wasted, I'm making **no changes to `./src`**.

## What it changed

Nothing.

## The steps

**agent:** This is exactly the react-perf-recorder skill's use case — I'll invoke it to analyze the recording and diagnose the re-render issue.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Chat page stays busy at idle — reactions and read receipts keep arriving even when nobody touches it. Recording id is in ./recording.txt. Find what re-renders for nothing and why, fix it in ./src without changing what the page shows, and prove it with before/after numbers. Dev server URL is in ./dev-url.txt."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [3828 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-235433-app-panel-354e
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:45111/?tick=150
2	
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/reading-a-recording.md"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/causes-and-actions.md"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/measuring-a-fix.md"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
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
{"id":"20260927-235433-app-panel-354e"}
```

**←**
```
{"id":"20260927-235433-app-panel-354e","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235433-app-panel-354e","summary":{"id":"20260927-235433-app-panel-354e","status":"done","createdAt":"2026-09-27T23:54:38.542Z","source":"panel","url":"http://localhost:45111/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.76,"commitsInScope":44,"renders":78,"rendersPerScopeCommit":1.8,"rendersFromOutside":0,"rendersWithoutDom":0,"domTextChanges":41,"rendersPerTextChange":1.9},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.77,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.22,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → succe … [5530 more]
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
{"file_path":"src/components/TypingLine.tsx"}
```

**←**
```
1	import { useStore } from 'zustand';
2	import { presenceStore, type Person } from '../store/chat';
3	
4	const line = (typing: Person[]) => {
5	  if (typing.length === 0) return ' ';
6	  const names = typing.length > 1 ? `${typing.slice(0, -1).join(', ')} and ${typing.at(-1)}` : typing[0];
7	  return `${names} ${typing.length > 1 ? 'are' : 'is'} typing…`;
8	};
9	
10	export const TypingLine = () => {
11	  const typing = useStore(presenceStore, (s) => s.typing);
12	  return (
13	    <small className="connection" data-testid="typing">
14	      {line(typing)}
15	    </small>
16	  );
17	};
18	
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

**→ Read**
```
{"file_path":"src/components/ChatPanel.tsx"}
```

**←**
```
1	import { memo, useCallback } from 'react';
2	import { useSearchParams } from 'react-router-dom';
3	import { MessageList, PeopleList } from './Messages';
4	
5	export const useActiveTab = () => {
6	  const [params, setParams] = useSearchParams();
7	  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
8	  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);
9	  return [tab, select] as const;
10	};
11	
12	const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
13	  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
14	    {name}
15	  </button>
16	));
17	
18	export const ChatPanel = () => {
19	  const [tab, setTab] = useActiveTab();
20	  return (
21	    <section className="panel" data-testid="chat-panel">
22	      <div className="tabs" role="tablist">
23	        {['chat', 'people'].map((name) => (
24	          <Tab key={name} name={name} active={tab === name} onPick={setTab} />
25	        ))}
26	      </div>
27	      {tab === 'chat' ? <MessageList /> : <PeopleList />}
28	    </section>
29	  );
30	};
31	
```

**→ rpr:get_recording**
```
{"id":"20260927-235433-app-panel-354e","section":"components","top":30}
```

**←**
```
{"id":"20260927-235433-app-panel-354e","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235433-app-panel-354e","components":{"total":14,"offset":0,"items":[{"name":"SyncBar","renders":34,"withoutDom":0,"byParent":0,"reasons":[{"i":0,"n":34,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"ChannelStats","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"OnlineNow","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"Status","renders":9,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":3,"n":7,"reason":"external store #3 [useChatStore] outer"},{"i":6,"n":3,"reason":"external store #8 [useChatStore] selectSeen"}]},{"name":"TypingLine","renders":9,"withoutDom":0,"byParent":0,"reasons":[{"i":1,"n":9,"reason":"external store #2 [presenceStore] (s)=>s.typing"}]},{"name":"Unread","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":4,"n":1,"reason":"external store #2 [useChatStore] selectUnread"}]},{"name":"MessageList","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":5,"n":1,"reason":"external store #2 [useChatStore] selectMessageIds"}]},{"name":"MessageRow","renders":0,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"TimeAgo","renders":0,"mounts":1,"withoutDom":0,"byParent":0,"reasons":[]},{"name":"Attachments","renders":0,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[] … [731 more]
```

**agent:** I dug into the recording (`20260927-235433-app-panel-354e`, 5s idle capture, 44 commits / 78 renders) and checked every cascade root and every component against the recorder's own render-vs-DOM data. Result: **nothing re-renders for nothing here.**

**What the recorder shows**

- `totals.rendersWithoutDom: 0` — across all 44 commits, every single render produced a real DOM change.
- Per-component breakdown (`components` section) confirms it individually — `SyncBar`, `ChannelStats`, `OnlineNow`, `Status`, `TypingLine`, `Unread`, `MessageList`, `MessageCount`, `ActivityLog` — every one of them has `withoutDom: 0`. None are burning cycles on renders that leave the screen untouched.

**Why the page still looks "busy"**

The fake backend (`src/feed.ts`) runs a worker that posts a tick every 150–200ms and treats it as a live socket event. Each tick genuinely does one of:
- Bumps `workspace.lastEventAt` every tick → `SyncBar`'s progress fill (`src/components/ChatView.tsx:44-47`) legitimately moves every time (comment even says "the live bar moves with every event from the socket").
- Every 5th tick, increments the reaction count on one rotating message → `Status` (`src/components/Messages.tsx:13-21`) re-renders only for the message that actually got the reaction (proxy-memoize confirms only 8/103 selector calls even recomputed a new value).
- Once per ~6s, a new message arrives → flips `unread` past the read threshold, which is why all 3 `Status` instances flip their ✓✓/✓ receipt together — a real, simultaneous state change, not duplication.
- `ChannelStats`/`OnlineNow` both read a shared `['presence']` react-query key polling every 500ms; the online count actually changes on every poll (`3 + (++polls % 4)`), so both visibly update — no redundant fetch, no stale render.

Memoization already in place (`React.memo` on `MessageRow`/`Status`/`Attachments`, `proxy-memoize` selectors, Redux `connect` with shallow equality) is doing exactly its job: things that don't change (e.g. `MessageRow`, `Attachments`, `MemberList`, `Connect(ActivityLog)` on the 33 no-op "beat" actions) don't re-render at all.

So the "busy" feeling is the simulated live feed doing what it's built to do (heartbeat every ~150ms plus periodic reactions/receipts), not a rendering bug. Per your instructions, since the first recording shows nothing wasted, I'm making **no changes to `./src`**.
