# connect-filter-rec, with the plugin, run 1

fixed (waste 1); checks 5 of 5; $0.24, 116 s, 3 turns

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

> Fix confirmed correct and minimal — the component now uses the existing memoized `selectVisibleActivity` selector instead of inline-filtering on every dispatch, and the selector only recomputes when `state.activity.items` actually changes, so genuine activity updates still flow through correctly.
> 
> **Root cause:** `ActivityLog` used `connect(mapState)` with `state.activity.items.filter(...)` inline. Redux dispatches a `connection/beat` heartbeat on every socket message (unrelated to activity), which still ran `mapState` and built a brand-new filtered array each time — a fresh reference fails react-redux's shallow-equality check, forcing a re-render even though the visible list never changed.
> 
> **Fix** (`src/components/ActivityLog.tsx:13`): swapped the inline filter for the store's existing memoized `selectVisibleActivity` selector, which returns the same array reference when `activity.items` hasn't changed.
> 
> **Before/after (same 5s idle recording, replayed against the fix):**
> - `Connect(ActivityLog)` wasted re-renders: 33 → 0 (was 32/33 with no DOM change)
> - Page-wide renders: 173 → 66 (‑62%)
> - Renders-without-DOM-change: 19.14/s → 0
> - Commit count unchanged (43 → 43) — confirms this was pure render waste, not a behavior change
> 
> Nothing else in the page re-rendered for nothing — `SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, and `Status` all had `noDomChange: 0` already and were left untouched. Page output is unchanged.

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

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-081317-app-panel-cb27
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:37757/?tick=150
2	
```

**agent:** I'll delegate this to the perf-recorder agent, which specializes in reading recordings, finding wasteful re-render roots, fixing them, and proving it with before/after numbers.

**→ Agent**
```
{"description":"Diagnose and fix wasted re-renders","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app lives in ./src of the current working directory. Its dev server is already running at http://localhost:37757/?tick=150 (from ./dev-url.txt) and hot-reloads on source changes.\n\nComplaint from the user: with the chat left open in a background tab, the laptop fan spins up, even though the page doesn't visibly do anything. Repro steps: open the page, wait for the messages to load, then leave it alone (don't interact) for a few seconds.\n\nThe user already recorded this ex … [1824 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: ad52b3062437a3da4 (internal ID - do not mention to user. Use SendMessage with to: 'ad52b3062437a3da4', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-8duw7e/tmp/claude-0/-tmp-claude-eval-8duw7e-home-cwd/ebad786c-1f5a-417a-91f6-7433f536e890/tasks/ad52b3062437a3da4.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the investigation using the perf-recorder agent, which will read the existing recording (`20260928-081317-app-panel-cb27`), identify any wasteful re-render roots during the idle period, fix them in `./src` if found, and verify with before/after numbers. I'll report back once it finishes.

> **→ rpr:get_recording**
> ```
> {"id":"20260928-081317-app-panel-cb27"}
> ```

> **←**
> ```
> {"id":"20260928-081317-app-panel-cb27","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081317-app-panel-cb27","summary":{"id":"20260928-081317-app-panel-cb27","status":"done","createdAt":"2026-09-28T08:13:22.125Z","source":"panel","url":"http://localhost:37757/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":43,"commitsPerSec":8.57,"commitsInScope":43,"renders":173,"rendersPerScopeCommit":4,"rendersFromOutside":0,"rendersWithoutDom":96,"domTextChanges":41,"rendersPerTextChange":4.2},"topRoots":[{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","hits":33,"hitsPerSec":6.58,"instances":1,"perHit":3,"noDomChange":32,"renderMsPerHit":0.14,"reasons":["33× external store #15 (32 of them same content) [store] connect(mapState) · SyncExternalStore"],"causes":["33× redux:connection/beat","33× core:message Worker"],"lanes":"Sync:33"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.58,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["33× core:message Worker","32× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:33"},{"root":" … [5859 more]
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

> **agent:** I found the cause. Now let's apply the fix: use the already-defined memoized selector instead of the inline `.filter()`.

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ActivityLog.tsx","old_string":"import { connect } from 'react-redux';\nimport type { ActivityItem, State } from '../store/activity';\n\nconst ActivityLog = ({ items }: { items: ActivityItem[] }) => (\n  <ul className=\"activity\" data-testid=\"activity\">\n    {items.slice(-4).map((item) => (\n      <li key={item.id}>{item.text}</li>\n    ))}\n  </ul>\n);\n\nconst mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });\n\nexport default connect(mapState)(ActivityLog);","new_s … [527 more]
> ```

> **←**
> ```
> The file src/components/ActivityLog.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now let's measure the fix by replaying the same recording against the hot-reloaded (fixed) code.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-081317-app-panel-cb27","label":"after"}
> ```

> **←**
> ```
> {"id":"20260928-081411-app-record-328c","url":"http://localhost:37757/?tick=150","requested":"http://localhost:37757/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-081317-app-panel-cb27 has no actions: recorded the page as it is for 5016 ms instead"]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-081317-app-panel-cb27","after":"20260928-081411-app-record-328c"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-081317-app-panel-cb27","durationMs":5016},"after":{"id":"20260928-081411-app-record-328c","durationMs":5028},"totals":{"commits":"43 → 43 (0%)","renders":"173 → 66 (-62%)","commitsPerSec":"8.57 → 8.55 (0%)","rendersPerSec":"34.49 → 13.13 (-62%)","rendersPerCommit":"4 → 1.5 (-62%)","rendersWithoutDomPerSec":"19.14 → 0 (-100%)","rendersPerTextChange":"4.2 → 2 (-52%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.58 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"19.74 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.79 → 1.19 (-34%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.79 → 1.39 (-22%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.79 → 1.39 (-22%)"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"0.2 → 0 (-100%)"},{"root":"MessageList","source":"src/components/ChatPanel.tsx:27","path":"ChatPanel < ChatView < SettingsBySync … [2190 more]
> ```

> **agent:** ## Findings
> 
> **Root cause:** `Connect(ActivityLog)` (react-redux `connect(mapState)`) re-rendered on every redux `connection/beat` action — 33 times in 5s, **32 of them producing no DOM change** (confirmed by the recording's own reason: *"33× external store #15 (32 of them same content)"* and `noDomChange: 32` of `33` hits).
> 
> The mechanism, in `src/components/ActivityLog.tsx:12` (before the fix):
> ```js
> const mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });
> ```
> This `mapState` ran on *every* redux store update — including the unrelated `connection.beat` heartbeat that fires on every socket message — and built a brand-new `items` array each time via `.filter()`. Even though the filtered content was identical, the new array reference broke react-redux's shallow-equality check on the mapped props, forcing a re-render.
> 
> The store (`src/store/activity.ts:43`) already defined a proper memoized selector, `selectVisibleActivity` (via `reselect`'s `createSelector`), but `ActivityLog.tsx` wasn't using it.
> 
> All other cascade roots in the idle window (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) had `noDomChange: 0` — every one of their renders changed visible content (live sync bar, presence/typing indicators, react-query polling results), so they are legitimate and were left untouched.
> 
> ## Fix
> 
> `src/components/ActivityLog.tsx:1-14` — replaced the inline `.filter()` in `mapState` with the existing memoized `selectVisibleActivity` selector:
> 
> ```diff
>  import { connect } from 'react-redux';
>  import type { ActivityItem, State } from '../store/activity';
> +import { selectVisibleActivity } from '../store/activity';
>  ...
> -const mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });
> +const mapState = (state: State) => ({ items: selectVisibleActivity(state) });
> ```
> 
> `selectVisibleActivity` only recomputes (and returns a new array reference) when `state.activity.items` itself changes — it now returns the same reference across unrelated `connection/beat` dispatches, so `connect`'s shallow-equality bail-out works and the component skips the pointless re-render. Nothing about what's rendered, when the list actually updates on a real activity item, or any other behavior changed.
> 
> ## Before / after (same recorded repro, replayed against the fixed code)
> 
> Compared via `compare_recordings` (before: `20260928-081317-app-panel-cb27`, after: `20260928-081411-app-record-328c`, replay of the same recording, 5s idle window, no actions):
> 
> - `Connect(ActivityLog)` cascade root: **gone** — `cascadePerSec 19.74 → 0 (-100%)`, `hitsPerSec 6.58 → –`
> - Page totals: `renders 173 → 66 (-62%)`, `rendersWithoutDomPerSec 19.14 → 0 (-100%)`
> - Cause `redux:connection/beat` commit rate: `6.58 → 0 (-100%)`
> - `wastingAfter`: `[]` — no root left rendering for nothing
> - Commits unchanged (`43 → 43`, `0%`) — same amount of real work/state activity, confirming this was pure render waste, not a behavior change
> - All other roots (`SyncBar`, `ChannelStats`, `OnlineNow`) kept identical hit rates (`0%` change) — their necessary renders were untouched
> 
> Fresh "after" recording directly: `renders: 66`, `rendersWithoutDom: 0`, `wasting: []`.
> 
> ## What still renders for nothing after the fix
> 
> Nothing — `wastingAfter` is empty, and no root's `noDomChange` count is non-trivial in the after recording.
> 
> ## Conditions
> 
> - URL: `http://localhost:37757/?tick=150`, viewport `1280×720`, no CPU throttling
> - Idle window: 5s, no user interaction, after messages loaded (person's own panel recording, source `panel`)
> - Before recording: `20260928-081317-app-panel-cb27`; after: replay of the same recording (`20260928-081411-app-record-328c`) against the hot-reloaded fix
> 
> ## Not checked
> 
> - Did not verify the true positive-content-change path (an actual `activity/add` dispatch) still re-renders `ActivityLog` correctly with new data — no such event occurred in either 5s recording window, so this rests on reading `selectVisibleActivity`'s memoization logic rather than a captured render.
> - Did not inspect the `components`/`memos` detail sections for the other (legitimate) roots beyond the summary — their `noDomChange: 0` in the original recording was accepted as sufficient evidence they aren't wasteful.
> - Did not check builds/tests outside the recorder (e.g. TypeScript compile of the edited import) — the dev server hot-reloaded and the fix recording ran cleanly, which is an implicit sanity check but not a full build.

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

**agent:** Fix confirmed correct and minimal — the component now uses the existing memoized `selectVisibleActivity` selector instead of inline-filtering on every dispatch, and the selector only recomputes when `state.activity.items` actually changes, so genuine activity updates still flow through correctly.

**Root cause:** `ActivityLog` used `connect(mapState)` with `state.activity.items.filter(...)` inline. Redux dispatches a `connection/beat` heartbeat on every socket message (unrelated to activity), which still ran `mapState` and built a brand-new filtered array each time — a fresh reference fails react-redux's shallow-equality check, forcing a re-render even though the visible list never changed.

**Fix** (`src/components/ActivityLog.tsx:13`): swapped the inline filter for the store's existing memoized `selectVisibleActivity` selector, which returns the same array reference when `activity.items` hasn't changed.

**Before/after (same 5s idle recording, replayed against the fix):**
- `Connect(ActivityLog)` wasted re-renders: 33 → 0 (was 32/33 with no DOM change)
- Page-wide renders: 173 → 66 (‑62%)
- Renders-without-DOM-change: 19.14/s → 0
- Commit count unchanged (43 → 43) — confirms this was pure render waste, not a behavior change

Nothing else in the page re-rendered for nothing — `SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, and `Status` all had `noDomChange: 0` already and were left untouched. Page output is unchanged.
