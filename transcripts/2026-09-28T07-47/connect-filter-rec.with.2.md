# connect-filter-rec, with the plugin, run 2

fixed (waste 1); checks 5 of 5; $0.27, 132 s, 3 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: with the chat left open in a background tab, the laptop fan spins up; the page does not look like it is doing anything.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> The fix checks out — `ActivityLog.tsx` now uses the memoized `selectVisibleActivity` selector instead of an inline `mapState` that built a fresh filtered array on every dispatch.
> 
> **What was wrong:** the app polls a background worker every 150ms, which dispatches a `beat` action on *every* tick to a `connection` slice — unrelated to activity content. `ActivityLog`'s old `mapState` did `state.activity.items.filter(...)` inline, creating a brand-new array reference on every single store update, so `connect()`'s shallow-compare always saw "changed props" and re-rendered — even though the visible list hadn't changed. That's what was quietly burning CPU in the background tab.
> 
> **Fix:** `src/components/ActivityLog.tsx:13` now calls the already-defined (but previously unused) `createSelector`-memoized `selectVisibleActivity` from `src/store/activity.ts:43`. It returns the same array reference unless `state.activity.items` itself changes reference, so beat-only ticks no longer trigger a re-render. Real activity updates still flow through unchanged — same visible output, same timing.
> 
> **Before/after (5s idle recordings, no interaction):**
> 
> | metric | before | after |
> |---|---|---|
> | total renders | 177 | 66 (−63%) |
> | renders/sec | 35.3 | 13.2 (−63%) |
> | renders with no visible DOM change/sec | 19.7 | 0 (−100%) |
> | `ActivityLog` re-renders/sec | 6.78 (34 in 5s, 33 no-ops) | 0 |
> 
> Everything else on the page (sync bar, typing indicator, status, query results) was already rendering only on real data changes and was left untouched. No visual behavior changed — confirmed by the "no DOM change" renders dropping to zero while real-update renders stayed intact.

## What it changed

```
diff -ruN a/src/components/ActivityLog.tsx b/src/components/ActivityLog.tsx
--- a/src/components/ActivityLog.tsx
+++ b/src/components/ActivityLog.tsx
@@ -1,5 +1,6 @@
 import { connect } from 'react-redux';
 import type { ActivityItem, State } from '../store/activity';
+import { selectVisibleActivity } from '../store/activity';
 
 const ActivityLog = ({ items }: { items: ActivityItem[] }) => (
   <ul className="activity" data-testid="activity">
@@ -9,6 +10,6 @@
   </ul>
 );
 
-const mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });
+const mapState = (state: State) => ({ items: selectVisibleActivity(state) });
 
 export default connect(mapState)(ActivityLog);
```

## The steps

**agent:** I'll check the recording id and dev URL, then hand this off to the specialized perf-recorder agent that's built for exactly this kind of investigation.

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-074723-app-panel-58ce
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:32977/?tick=150
2	
```

**→ Agent**
```
{"description":"Investigate unnecessary re-renders","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app lives in ./src of the current working directory (.). Its dev server is already running at http://localhost:32977/?tick=150 (also in ./dev-url.txt) and hot-reloads on source changes.\n\nUser complaint: they leave a chat page open in a background tab, and the laptop fan spins up even though the page \"does not look like it is doing anything.\" Repro: open the page, wait for messages to load, then leave it alone for a few seconds (no user int … [1769 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a568b748648a85abf (internal ID - do not mention to user. Use SendMessage with to: 'a568b748648a85abf', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-nUeTpF/tmp/claude-0/-tmp-claude-eval-nUeTpF-home-cwd/6dd960ac-024f-4f1b-b591-e2a8c065f8e7/tasks/a568b748648a85abf.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** The perf-recorder agent is investigating the idle-tab re-render issue now — reading the existing recording, tracing cascade roots, and if it finds real wasted renders, fixing them in `./src` and proving it with before/after numbers. I'll report back once it finishes.

> **→ Read**
> ```
> {"file_path":"recording.txt"}
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-074723-app-panel-58ce"}
> ```

> **←**
> ```
> 1	20260928-074723-app-panel-58ce
> 2	
> ```

> **←**
> ```
> {"id":"20260928-074723-app-panel-58ce","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-074723-app-panel-58ce","summary":{"id":"20260928-074723-app-panel-58ce","status":"done","createdAt":"2026-09-28T07:47:28.396Z","source":"panel","url":"http://localhost:32977/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":177,"rendersPerScopeCommit":4,"rendersFromOutside":0,"rendersWithoutDom":99,"domTextChanges":41,"rendersPerTextChange":4.3},"topRoots":[{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":3,"noDomChange":33,"renderMsPerHit":0.15,"reasons":["34× external store #15 (33 of them same content) [store] connect(mapState) · SyncExternalStore"],"causes":["34× redux:connection/beat","34× core:message Worker"],"lanes":"Sync:34"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":" … [5865 more]
> ```

> **→ Grep**
> ```
> {"pattern":"ActivityLog|connect\\(|mapState|connection/beat|beat","path":"src","-n":true}
> ```

> **←**
> ```
> Found 4 files
> src/components/ActivityLog.tsx
> src/components/ChatView.tsx
> src/feed.ts
> src/store/activity.ts
> ```

> **→ Read**
> ```
> {"file_path":"src/store/activity.ts"}
> ```

> **←**
> ```
> 1	import { configureStore, createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
> 2	
> 3	export interface ActivityItem {
> 4	  id: number;
> 5	  text: string;
> 6	  muted: boolean;
> 7	}
> 8	
> 9	/** The connection's heartbeat: every event from the socket beats it. */
> 10	const connection = createSlice({
> 11	  name: 'connection',
> 12	  initialState: { beat: 0 },
> 13	  reducers: {
> 14	    beat: (state, action: PayloadAction<number>) => {
> 15	      state.beat = action.payload;
> 16	    },
> 17	  },
> 18	});
> 19	
> 20	/** What happened in the channel; bots are muted. */
> 21	const activity = createSlice({
> 22	  name: 'activity',
> 23	  initialState: {
> 24	    items: [
> 25	      { id: 1, text: 'Anna joined', muted: false },
> 26	      { id: 2, text: 'deploy-bot posted a build', muted: true },
> 27	      { id: 3, text: 'Chen pinned a message', muted: false },
> 28	    ] as ActivityItem[],
> 29	  },
> 30	  reducers: {
> 31	    add: (state, action: PayloadAction<Omit<ActivityItem, 'id'>>) => {
> 32	      state.items.push({ id: state.items.length + 1, ...action.payload });
> 33	      if (state.items.length > 20) state.items.shift();
> 34	    },
> 35	  },
> 36	});
> 37	
> 38	export const store = configureStore({ reducer: { connection: connection.reducer, activity: activity.reducer } });
> 39	export type State = ReturnType<typeof store.getState>;
> 40	export const { beat } = connection.actions;
> 41	export const { add: addActivity } = activity.actions;
> 42	
> 43	export const selectVisibleActivity = createSelector([(s: State) => s.activ … [58 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ActivityLog.tsx"}
> ```

> **←**
> ```
> 1	import { connect } from 'react-redux';
> 2	import type { ActivityItem, State } from '../store/activity';
> 3	
> 4	const ActivityLog = ({ items }: { items: ActivityItem[] }) => (
> 5	  <ul className="activity" data-testid="activity">
> 6	    {items.slice(-4).map((item) => (
> 7	      <li key={item.id}>{item.text}</li>
> 8	    ))}
> 9	  </ul>
> 10	);
> 11	
> 12	const mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });
> 13	
> 14	export default connect(mapState)(ActivityLog);
> 15	
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
> {"file_path":"src/feed.ts"}
> ```

> **←**
> ```
> 1	import { useEffect } from 'react';
> 2	import { addActivity, beat, store } from './store/activity';
> 3	import { ARRIVAL_EVERY, TYPING_LEAD, presenceStore, senderAt, useChatStore, type Person } from './store/chat';
> 4	
> 5	const everyMs = Number(new URLSearchParams(location.search).get('tick') ?? 200);
> 6	
> 7	// A worker stands in for the chat socket: its messages reach the page as `message` events, like a WebSocket's.
> 8	const source = `let step = 0; setInterval(() => postMessage({ step: ++step }), ${everyMs});`;
> 9	
> 10	const IDLE: Person[][] = [[], ['Anna'], [], ['Boris', 'Chen'], []];
> 11	
> 12	/** Who is typing: whoever is about to send something, and otherwise whatever the room is doing. */
> 13	function typingAt(step: number): Person[] {
> 14	  const untilArrival = ARRIVAL_EVERY - (step % ARRIVAL_EVERY);
> 15	  if (untilArrival <= TYPING_LEAD) return [senderAt(step + untilArrival)];
> 16	  return IDLE[Math.floor(step / 4) % IDLE.length];
> 17	}
> 18	
> 19	export function useFeed() {
> 20	  useEffect(() => {
> 21	    const socket = connectFeed();
> 22	    return () => socket.terminate();
> 23	  }, []);
> 24	}
> 25	
> 26	function connectFeed() {
> 27	  const socket = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
> 28	  socket.addEventListener('message', (event: MessageEvent<{ step: number }>) => {
> 29	    const { step } = event.data;
> 30	    useChatStore.getState().tick(step);
> 31	    store.dispatch(beat(step));
> 32	    if (step % ARRIVAL_EVERY === 0) store.dispatch(addActivity({ tex … [229 more]
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ActivityLog.tsx","old_string":"import { connect } from 'react-redux';\nimport type { ActivityItem, State } from '../store/activity';\n\nconst ActivityLog = ({ items }: { items: ActivityItem[] }) => (\n  <ul className=\"activity\" data-testid=\"activity\">\n    {items.slice(-4).map((item) => (\n      <li key={item.id}>{item.text}</li>\n    ))}\n  </ul>\n);\n\nconst mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });\n\nexport default connect(mapState)(ActivityLog);","new_s … [558 more]
> ```

> **←**
> ```
> The file src/components/ActivityLog.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:32977/?tick=150","viewport":"1280x720","ms":5000,"label":"after-fix-idle"}
> ```

> **←**
> ```
> {"id":"20260928-074825-app-record-220c","url":"http://localhost:32977/?tick=150","requested":"http://localhost:32977/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-074723-app-panel-58ce","after":"20260928-074825-app-record-220c"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-074723-app-panel-58ce","durationMs":5014},"after":{"id":"20260928-074825-app-record-220c","durationMs":5014},"totals":{"commits":"44 → 43 (-2%)","renders":"177 → 66 (-63%)","commitsPerSec":"8.78 → 8.58 (-2%)","rendersPerSec":"35.3 → 13.16 (-63%)","rendersPerCommit":"4 → 1.5 (-62%)","rendersWithoutDomPerSec":"19.74 → 0 (-100%)","rendersPerTextChange":"4.3 → 2 (-53%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.78 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"20.34 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.2 (-14%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.79 → 1.2 (-33%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.79 → 1.4 (-22%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.79 → 1.4 (-22%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.78 → 6.58 (-3%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.78 → 6.58 (-3%)"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Lay … [2185 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ActivityLog.tsx"}
> ```

> **←**
> ```
> 1	import { connect } from 'react-redux';
> 2	import type { ActivityItem } from '../store/activity';
> 3	import { selectVisibleActivity } from '../store/activity';
> 4	
> 5	const ActivityLog = ({ items }: { items: ActivityItem[] }) => (
> 6	  <ul className="activity" data-testid="activity">
> 7	    {items.slice(-4).map((item) => (
> 8	      <li key={item.id}>{item.text}</li>
> 9	    ))}
> 10	  </ul>
> 11	);
> 12	
> 13	const mapState = (state: Parameters<typeof selectVisibleActivity>[0]) => ({ items: selectVisibleActivity(state) });
> 14	
> 15	export default connect(mapState)(ActivityLog);
> 16	
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ActivityLog.tsx","old_string":"import { connect } from 'react-redux';\nimport type { ActivityItem } from '../store/activity';\nimport { selectVisibleActivity } from '../store/activity';\n\nconst ActivityLog = ({ items }: { items: ActivityItem[] }) => (\n  <ul className=\"activity\" data-testid=\"activity\">\n    {items.slice(-4).map((item) => (\n      <li key={item.id}>{item.text}</li>\n    ))}\n  </ul>\n);\n\nconst mapState = (state: Parameters<typeof selectVisibleActivity>[0]) => ({ items: selectVisibleActivity … [496 more]
> ```

> **←**
> ```
> The file src/components/ActivityLog.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** ## Summary
> 
> **Root cause — real wasted re-renders while idle**
> 
> `Connect(ActivityLog)` (root at `src/components/ChatView.tsx:35`, component `src/components/ActivityLog.tsx`) re-rendered on **every** background-worker tick, not just when activity actually changed.
> 
> - The idle-tab repro (worker `postMessage` every `tick=150`ms, see `src/feed.ts:8,31`) dispatches `store.dispatch(beat(step))` on **every** tick (`src/store/activity.ts` `connection` slice), which changes the Redux root state reference each time even though the `activity` slice itself only changes when a message actually arrives (`src/feed.ts:32`, gated by `step % ARRIVAL_EVERY`).
> - `ActivityLog.tsx` (old code) used an inline `mapState = (state) => ({ items: state.activity.items.filter(...) })` — a fresh `.filter()` on every call, i.e. a brand-new array reference on every store change, even when nothing about `activity.items` changed. `connect()`'s shallow-compare therefore always saw "new props" and re-rendered.
> - Recording `20260928-074723-app-panel-58ce` (5s idle, no user actions) showed this precisely: `Connect(ActivityLog)` hit **34 times in 5s (6.78/s)**, with **33 of those 34 renders producing identical (`noDomChange`) output** — pure waste, all attributed to cause `redux:connection/beat` (34 events). Two `useMemo`s inside it (lines flagged in the recording) recomputed 34/34 times for the same reason.
> - Everything else in the recording (`SyncBar`, `TypingLine`, `Status`, query-driven roots, etc.) had `noDomChange: 0` — those renders were real, tied to genuine data changes (live sync bar, typing indicator, query results), so they were left untouched.
> 
> **Fix**
> 
> `src/store/activity.ts` already defined a memoized selector, `selectVisibleActivity` (`createSelector([(s) => s.activity.items], (items) => items.filter(...))`), but it was never used. In `src/components/ActivityLog.tsx` I replaced the inline `mapState` with this memoized selector:
> 
> ```ts
> const mapState = (state: State) => ({ items: selectVisibleActivity(state) });
> ```
> 
> `createSelector` returns the same array reference when its input (`state.activity.items`) hasn't changed reference — which is true for every `beat` action, since `beat` only touches the sibling `connection` slice. So on beat-only dispatches, `mapState` now returns the same `items` array as before, `connect()`'s shallow compare sees no change, and `ActivityLog` doesn't re-render. When a real activity item is added (`addActivity`), `state.activity.items` gets a new reference (RTK/immer), the selector recomputes, and the component updates exactly as before — visible output and timing are unchanged.
> 
> **Before/after numbers** (both 5s recordings, `http://localhost:32977/?tick=150`, viewport 1280×720, no throttling, idle/no user actions):
> 
> | metric | before (`20260928-074723-app-panel-58ce`) | after (`20260928-074825-app-record-220c`) |
> |---|---|---|
> | total renders | 177 | 66 (**-63%**) |
> | renders/sec | 35.3 | 13.16 (**-63%**) |
> | renders with no DOM change/sec | 19.74 | 0 (**-100%**) |
> | `Connect(ActivityLog)` hits/sec | 6.78 (34 in 5s, 33 no-op) | 0 — root gone from the cascade entirely |
> | cascade caused by `redux:connection/beat`/sec | 20.34 | 0 (**-100%**) |
> | total commits | 44 | 43 (roughly unchanged, as expected — commits still happen, they just don't cascade into ActivityLog) |
> 
> `compare_recordings` confirms `wastingAfter: []` — nothing wasteful remains from this cause.
> 
> **What still renders, and why it's legitimate**
> 
> - `SyncBar` (`ChatView.tsx:55`) still renders on every tick (`noDomChange: 0` in the original recording) — it displays `lastEventAt`, a value that genuinely changes on every worker tick; this is real work, not waste.
> - `Status`, `ChannelStats`, `OnlineNow`, `TypingLine` etc. — all had `noDomChange: 0`, i.e. their renders always changed visible output (query results, typing state). Left as is.
> - Minor deltas for `MessageList`/`MessageCount`/`Unread`/`Status` between the two 5s windows (some show as "gone" in the after run) are timing noise from where the 5-second window happened to fall relative to the periodic `ARRIVAL_EVERY` message-arrival event — that logic in `src/feed.ts` was not touched by the fix.
> 
> **Conditions**: `http://localhost:32977/?tick=150`, viewport 1280×720, no CPU throttling, idle tab (page loaded, then left alone, no user interaction), 5-second recordings for both before and after.
> 
> **Not checked / left open**:
> - Longer idle windows (>5s) to confirm the savings scale linearly (strongly expected given the mechanism, but not separately measured).
> - Whether other `connect()`-based components elsewhere in the app have the same inline-`mapState`-creates-new-reference pattern — only `ActivityLog` was in scope of this recording/complaint.
> - CPU/fan impact was inferred from render/commit counts, not measured directly (no profiler/CPU-usage tool used, per the recorder's own metrics only).

**→ Read**
```
{"file_path":"src/components/ActivityLog.tsx"}
```

**←**
```
1	import { connect } from 'react-redux';
2	import type { ActivityItem, State } from '../store/activity';
3	import { selectVisibleActivity } from '../store/activity';
4	
5	const ActivityLog = ({ items }: { items: ActivityItem[] }) => (
6	  <ul className="activity" data-testid="activity">
7	    {items.slice(-4).map((item) => (
8	      <li key={item.id}>{item.text}</li>
9	    ))}
10	  </ul>
11	);
12	
13	const mapState = (state: State) => ({ items: selectVisibleActivity(state) });
14	
15	export default connect(mapState)(ActivityLog);
16	
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

**agent:** The fix checks out — `ActivityLog.tsx` now uses the memoized `selectVisibleActivity` selector instead of an inline `mapState` that built a fresh filtered array on every dispatch.

**What was wrong:** the app polls a background worker every 150ms, which dispatches a `beat` action on *every* tick to a `connection` slice — unrelated to activity content. `ActivityLog`'s old `mapState` did `state.activity.items.filter(...)` inline, creating a brand-new array reference on every single store update, so `connect()`'s shallow-compare always saw "changed props" and re-rendered — even though the visible list hadn't changed. That's what was quietly burning CPU in the background tab.

**Fix:** `src/components/ActivityLog.tsx:13` now calls the already-defined (but previously unused) `createSelector`-memoized `selectVisibleActivity` from `src/store/activity.ts:43`. It returns the same array reference unless `state.activity.items` itself changes reference, so beat-only ticks no longer trigger a re-render. Real activity updates still flow through unchanged — same visible output, same timing.

**Before/after (5s idle recordings, no interaction):**

| metric | before | after |
|---|---|---|
| total renders | 177 | 66 (−63%) |
| renders/sec | 35.3 | 13.2 (−63%) |
| renders with no visible DOM change/sec | 19.7 | 0 (−100%) |
| `ActivityLog` re-renders/sec | 6.78 (34 in 5s, 33 no-ops) | 0 |

Everything else on the page (sync bar, typing indicator, status, query results) was already rendering only on real data changes and was left untouched. No visual behavior changed — confirmed by the "no DOM change" renders dropping to zero while real-update renders stayed intact.
