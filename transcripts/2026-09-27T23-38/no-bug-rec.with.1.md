# no-bug-rec, with the plugin, run 1

fixed (waste 0); checks 1 of 1; $0.38, 182 s, 26 turns

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

> I read the recording (`20260927-235333-app-panel-3919`, 5 s idle, 42 commits, 66 renders) and checked every root the recorder found against the source.
> 
> **What's actually happening**
> 
> Five components render during the idle window, each driven by a real external-store event, and each one changes its own DOM on every single hit:
> 
> | Root | Hits/5s | Cause | File |
> |---|---|---|---|
> | `SyncBar` | 32 | `useChatStore` → `workspace.lastEventAt`, ticks every ~150 ms from the simulated socket worker | `ChatView.tsx:44` |
> | `ChannelStats` | 10 | `react-query` `['presence']`, `refetchInterval: 500` | `ChannelStats.tsx:25` |
> | `OnlineNow` | 10 | same `['presence']` cache | `OnlineNow.tsx:8` |
> | `TypingLine` | 8 | `presenceStore` typing indicator | `TypingLine.tsx:11` |
> | `Status` | 6 | `reactionsById` / read-receipt state (the "reactions and read receipts" from the complaint) | `Messages.tsx:14` |
> 
> The recorder's own tallies rule out waste directly: `rendersWithoutDom: 0` for the whole session, and `noDomChange: 0` on every one of these roots — every render produced a real, matching DOM change (the `SyncBar` fill width moves because `lastEventAt` really changed; `Status` re-renders only on the ticks where a reaction actually landed, confirmed by the `proxy-memoize` stat "6/96 recomputes" matching exactly the reaction cadence). There's also no cascade elsewhere: `outsideRoots: []`, `rendersFromOutside: 0`, and `components.total: 5` — nothing else in the tree renders at all during the idle window. Frame cost is trivial too (`longTasks: 0`, `worstFrameMs: 0`, total commit time 25.6 ms over 5 s).
> 
> **Conclusion**
> 
> The "stays busy" feeling is the page correctly reflecting a live feed: a simulated socket ticks every ~150 ms, and the sync bar (`title="Live"`, comment: *"The live bar moves with every event from the socket"*) is designed to animate on every tick, while reactions/read-receipts/presence genuinely do arrive continuously in this demo. None of it is a component re-rendering for nothing — I found no root, cascade, or memo failure that wastes work.
> 
> Per your instruction to change nothing if nothing is wasted: I made no edits to `./src`.

## What it changed

Nothing.

## The steps

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
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-235333-app-panel-3919
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
{"id":"20260927-235333-app-panel-3919"}
```

**←**
```
{"id":"20260927-235333-app-panel-3919","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235333-app-panel-3919","summary":{"id":"20260927-235333-app-panel-3919","status":"done","createdAt":"2026-09-27T23:53:38.794Z","source":"panel","url":"http://localhost:45185/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":42,"commitsPerSec":8.37,"commitsInScope":42,"renders":66,"rendersPerScopeCommit":1.6,"rendersFromOutside":0,"rendersWithoutDom":0,"domTextChanges":34,"rendersPerTextChange":1.9},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":32,"hitsPerSec":6.38,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.13,"reasons":["32× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["32× zustand:feed/tick","32× core:message Worker"],"lanes":"Sync:32"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.18,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → success [\"topic\"]","10× react … [3335 more]
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

**→ rpr:get_recording**
```
{"id":"20260927-235333-app-panel-3919","section":"components"}
```

**←**
```
{"id":"20260927-235333-app-panel-3919","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235333-app-panel-3919","components":{"total":5,"offset":0,"items":[{"name":"SyncBar","renders":32,"withoutDom":0,"byParent":0,"reasons":[{"i":0,"n":32,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"ChannelStats","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"OnlineNow","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"TypingLine","renders":8,"withoutDom":0,"byParent":0,"reasons":[{"i":1,"n":8,"reason":"external store #2 [presenceStore] (s)=>s.typing"}]},{"name":"Status","renders":6,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":3,"n":6,"reason":"external store #3 [useChatStore] outer"}]}]}}
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
{"file_path":"src/store/activity.ts"}
```

**←**
```
1	import { configureStore, createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
2	
3	export interface ActivityItem {
4	  id: number;
5	  text: string;
6	  muted: boolean;
7	}
8	
9	/** The connection's heartbeat: every event from the socket beats it. */
10	const connection = createSlice({
11	  name: 'connection',
12	  initialState: { beat: 0 },
13	  reducers: {
14	    beat: (state, action: PayloadAction<number>) => {
15	      state.beat = action.payload;
16	    },
17	  },
18	});
19	
20	/** What happened in the channel; bots are muted. */
21	const activity = createSlice({
22	  name: 'activity',
23	  initialState: {
24	    items: [
25	      { id: 1, text: 'Anna joined', muted: false },
26	      { id: 2, text: 'deploy-bot posted a build', muted: true },
27	      { id: 3, text: 'Chen pinned a message', muted: false },
28	    ] as ActivityItem[],
29	  },
30	  reducers: {
31	    add: (state, action: PayloadAction<Omit<ActivityItem, 'id'>>) => {
32	      state.items.push({ id: state.items.length + 1, ...action.payload });
33	      if (state.items.length > 20) state.items.shift();
34	    },
35	  },
36	});
37	
38	export const store = configureStore({ reducer: { connection: connection.reducer, activity: activity.reducer } });
39	export type State = ReturnType<typeof store.getState>;
40	export const { beat } = connection.actions;
41	export const { add: addActivity } = activity.actions;
42	
43	export const selectVisibleActivity = createSelector([(s: State) => s.activ … [58 more]
```

**→ Glob**
```
{"pattern":"src/components/*.tsx"}
```

**←**
```
src/components/TypingLine.tsx
src/components/ActivityLog.tsx
src/components/PrefsLine.tsx
src/components/ChannelStats.tsx
src/components/WebhookForm.tsx
src/components/Header.tsx
src/components/ChannelTopic.tsx
src/components/TypingBadge.tsx
src/components/Settings.tsx
src/components/Messages.tsx
src/components/MessageCount.tsx
src/components/ChatView.tsx
src/components/Workspace.tsx
src/components/ChatPanel.tsx
src/components/OnlineNow.tsx
src/components/TimeAgo.tsx
```

**→ Grep**
```
{"pattern":"useSelector|connection\\.beat|state\\.connection|s\\.connection","path":"src","output_mode":"content","-n":true}
```

**←**
```
No matches found
```

**→ Read**
```
{"file_path":"src/components/Settings.tsx"}
```

**←**
```
1	import { createContext, useContext, useMemo, type ReactNode } from 'react';
2	
3	interface Settings {
4	  dense: boolean;
5	  timezone: string;
6	}
7	
8	const SettingsContext = createContext<Settings>({ dense: false, timezone: 'UTC' });
9	
10	export const useSettings = () => useContext(SettingsContext);
11	
12	export const SettingsProvider = ({ dense, children }: { dense: boolean; children: ReactNode }) => {
13	  const value = useMemo(() => ({ dense, timezone: 'UTC' }), [dense]);
14	  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
15	};
16	
17	export const TimezoneBadge = () => {
18	  const { timezone } = useSettings();
19	  return (
20	    <span className="badge muted" data-testid="timezone">
21	      {timezone}
22	    </span>
23	  );
24	};
25	
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
{"id":"20260927-235333-app-panel-3919","section":"watch"}
```

**←**
```
{"id":"20260927-235333-app-panel-3919","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235333-app-panel-3919","watch":{}}
```

**→ rpr:get_recording**
```
{"id":"20260927-235333-app-panel-3919","section":"warnings"}
```

**←**
```
{"id":"20260927-235333-app-panel-3919","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235333-app-panel-3919","warnings":{"warnings":[],"errors":[]}}
```

**→ rpr:get_recording**
```
{"id":"20260927-235333-app-panel-3919","section":"timeline","top":15}
```

**←**
```
{"id":"20260927-235333-app-panel-3919","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235333-app-panel-3919","timeline":{"truncated":false,"total":42,"offset":0,"items":[{"i":0,"atSec":0.14,"renders":2,"renderMs":0.1,"lane":"Sync","event":"message","causes":["zustand:feed/tick","zustand:presenceStore.setState","core:message Worker"],"roots":[{"root":"SyncBar","hits":1,"ms":0.1,"reasons":["external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"],"hook":"[zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"},{"root":"TypingLine","hits":1,"ms":0,"reasons":["external store #2 [presenceStore] (s)=>s.typing"],"hook":"[zustand] useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/TypingLine.tsx:11 const typing = useStore(presenceStore, (s) => s.typing);"}]},{"i":1,"atSec":0.29,"renders":1,"renderMs":0.1,"sinceMs":148,"lane":"Sync","event":"message","causes":["zustand:feed/tick","core:message Worker"],"roots":[{"root":"SyncBar","hits":1,"ms":0.1,"reasons":["external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"],"hook":"[zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"}]},{"i":2,"atSec":0.42,"renders":2,"renderMs":0.5,"sinceMs":130,"lane":"Sync","causes":["react-query:fetch → success … [7650 more]
```

**agent:** I read the recording (`20260927-235333-app-panel-3919`, 5 s idle, 42 commits, 66 renders) and checked every root the recorder found against the source.

**What's actually happening**

Five components render during the idle window, each driven by a real external-store event, and each one changes its own DOM on every single hit:

| Root | Hits/5s | Cause | File |
|---|---|---|---|
| `SyncBar` | 32 | `useChatStore` → `workspace.lastEventAt`, ticks every ~150 ms from the simulated socket worker | `ChatView.tsx:44` |
| `ChannelStats` | 10 | `react-query` `['presence']`, `refetchInterval: 500` | `ChannelStats.tsx:25` |
| `OnlineNow` | 10 | same `['presence']` cache | `OnlineNow.tsx:8` |
| `TypingLine` | 8 | `presenceStore` typing indicator | `TypingLine.tsx:11` |
| `Status` | 6 | `reactionsById` / read-receipt state (the "reactions and read receipts" from the complaint) | `Messages.tsx:14` |

The recorder's own tallies rule out waste directly: `rendersWithoutDom: 0` for the whole session, and `noDomChange: 0` on every one of these roots — every render produced a real, matching DOM change (the `SyncBar` fill width moves because `lastEventAt` really changed; `Status` re-renders only on the ticks where a reaction actually landed, confirmed by the `proxy-memoize` stat "6/96 recomputes" matching exactly the reaction cadence). There's also no cascade elsewhere: `outsideRoots: []`, `rendersFromOutside: 0`, and `components.total: 5` — nothing else in the tree renders at all during the idle window. Frame cost is trivial too (`longTasks: 0`, `worstFrameMs: 0`, total commit time 25.6 ms over 5 s).

**Conclusion**

The "stays busy" feeling is the page correctly reflecting a live feed: a simulated socket ticks every ~150 ms, and the sync bar (`title="Live"`, comment: *"The live bar moves with every event from the socket"*) is designed to animate on every tick, while reactions/read-receipts/presence genuinely do arrive continuously in this demo. None of it is a component re-rendering for nothing — I found no root, cascade, or memo failure that wastes work.

Per your instruction to change nothing if nothing is wasted: I made no edits to `./src`.
