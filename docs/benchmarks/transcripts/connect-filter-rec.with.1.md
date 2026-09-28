# connect-filter-rec, with the plugin, run 1

fixed (waste 1); checks 5 of 5; $0.23, 96 s, 15 turns

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

> Root cause and fix confirmed.
> 
> **What was wrong:** `ActivityLog`'s Redux `mapState` (`src/components/ActivityLog.tsx:12`) did `state.activity.items.filter(item => !item.muted)` inline. This runs on *every* store dispatch, including the `connection/beat` heartbeat that fires ~6.6×/sec from the socket worker and never touches `activity.items`. `.filter()` always returns a new array, so `connect()`'s shallow-equality check saw a "changed" prop every single time and re-rendered `ActivityLog` — 32 of 33 times with identical content, per the recording (`Connect(ActivityLog)`, `ChatView.tsx:35`, `noDomChange: 32/33`). The store already exported a memoized `reselect` selector, `selectVisibleActivity` (`src/store/activity.ts:43`), but it was never used.
> 
> **Fix:** swapped the inline filter for the memoized selector, so `mapState` only produces a new reference when `activity.items` actually changes:
> 
> ```ts
> const mapState = (state: State) => ({ items: selectVisibleActivity(state) });
> ```
> 
> **Before/after (5s idle recording, same URL, same scenario):**
> 
> | | before | after | change |
> |---|---|---|---|
> | renders | 165 | 66 | −60% |
> | renders without any DOM change | 99 (19.7/s) | 0 | −100% |
> | renders per commit | 3.8 | 1.5 | −61% |
> | commits (real work) | 43 | 43 | unchanged |
> | `Connect(ActivityLog)` re-renders | 33 (6.6/s) | 0 | gone |
> 
> Every other root's render rate is unchanged (0%/+1% rounding), and commit count is identical — the page still updates exactly the same DOM at the same times, so nothing visible changed. The only thing eliminated was `ActivityLog` waking up ~6-7 times a second for no reason while sitting in a background tab.

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

**agent:** This is exactly what the react-perf-recorder skill is built for — it'll read the existing recording, find the re-render cascade root, and help me verify a fix with numbers.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Investigate background-tab CPU/fan spin-up with no visible UI activity. Recording id is in ./recording.txt. Find the re-render cascade root, fix it in ./src without changing what the page renders, and show before/after numbers."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [3746 more]

**→ Read**
```
{"file_path":"./recording.txt"}
```

**←**
```
1	20260927-233915-app-panel-9201
2	
```

**→ Read**
```
{"file_path":"./dev-url.txt"}
```

**←**
```
1	http://localhost:37621/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings","max_results":5}
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
{"id":"20260927-233915-app-panel-9201"}
```

**←**
```
{"id":"20260927-233915-app-panel-9201","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-233915-app-panel-9201","summary":{"id":"20260927-233915-app-panel-9201","status":"done","createdAt":"2026-09-27T23:39:20.442Z","source":"panel","url":"http://localhost:37621/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":43,"commitsPerSec":8.57,"commitsInScope":43,"renders":173,"rendersPerScopeCommit":4,"rendersFromOutside":0,"rendersWithoutDom":96,"domTextChanges":41,"rendersPerTextChange":4.2},"topRoots":[{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","hits":33,"hitsPerSec":6.57,"instances":1,"perHit":3,"noDomChange":32,"renderMsPerHit":0.16,"reasons":["33× external store #15 (32 of them same content) [store] connect(mapState) · SyncExternalStore"],"causes":["33× redux:connection/beat","33× core:message Worker"],"lanes":"Sync:33"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.57,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.16,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["33× core:message Worker","32× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:33"},{"root":" … [5903 more]
```

**→ Read**
```
{"file_path":"./src/components/ChatView.tsx"}
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
{"file_path":"./src/components/ActivityLog.tsx"}
```

**←**
```
1	import { connect } from 'react-redux';
2	import type { ActivityItem, State } from '../store/activity';
3	
4	const ActivityLog = ({ items }: { items: ActivityItem[] }) => (
5	  <ul className="activity" data-testid="activity">
6	    {items.slice(-4).map((item) => (
7	      <li key={item.id}>{item.text}</li>
8	    ))}
9	  </ul>
10	);
11	
12	const mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });
13	
14	export default connect(mapState)(ActivityLog);
15	
```

**→ Read**
```
{"file_path":"./src/store/activity.ts"}
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

**agent:** Found it: `ActivityLog`'s Redux `mapState` (src/components/ActivityLog.tsx:12) does `state.activity.items.filter(...)` inline, creating a brand-new array on *every* store update — including the 33/sec `connection/beat` heartbeat that never touches `activity.items` at all. Since `connect()` does a shallow-prop comparison, the new array reference forces a re-render on every heartbeat even when the filtered content is identical (32 of 33 times, per the recording). The store already exports a memoized selector, `selectVisibleActivity` (src/store/activity.ts:43, via `reselect`/`createSelector`), that isn't being used.

Let me confirm baseline numbers, apply the fix, and measure after.

**→ rpr:record_page**
```
{"replay":"20260927-233915-app-panel-9201","label":"before"}
```

**✗ error**
```
20260927-233915-app-panel-9201 has no actions to replay
```

**→ rpr:record_page**
```
{"url":"http://localhost:37621/?tick=150","ms":5000,"label":"before"}
```

**←**
```
{"id":"20260927-234003-app-record-65ff","url":"http://localhost:37621/?tick=150","requested":"http://localhost:37621/?tick=150","durationSec":5,"commits":43,"renders":165,"rendersWithoutDom":99,"rendersPerCommit":3.8,"topRoot":"Connect(ActivityLog) ×33","warnings":[]}
```

**agent:** Baseline confirmed: 43 commits, 165 renders, 99 without any DOM change, top offender `Connect(ActivityLog) ×33`. Now applying the fix.

**→ Edit**
```
{"replace_all":false,"file_path":"./src/components/ActivityLog.tsx","old_string":"import { connect } from 'react-redux';\nimport type { ActivityItem, State } from '../store/activity';\n\nconst ActivityLog = ({ items }: { items: ActivityItem[] }) => (\n  <ul className=\"activity\" data-testid=\"activity\">\n    {items.slice(-4).map((item) => (\n      <li key={item.id}>{item.text}</li>\n    ))}\n  </ul>\n);\n\nconst mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });","new_string":"import { connect } from 'react-redux';\nimport type { ActivityItem, State … [396 more]
```

**←**
```
The file ./src/components/ActivityLog.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** `selectVisibleActivity` is a `reselect` selector memoized on `state.activity.items`'s reference, so it returns the same array instance unless `activity.items` actually changes — the heartbeat dispatches no longer manufacture a new reference. Now measuring after.

**→ rpr:record_page**
```
{"url":"http://localhost:37621/?tick=150","ms":5000,"label":"after"}
```

**←**
```
{"id":"20260927-234017-app-record-81c4","url":"http://localhost:37621/?tick=150","requested":"http://localhost:37621/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** Let's get the precise before/after comparison from the recorder.

**→ rpr:compare_recordings**
```
{"before":"20260927-234003-app-record-65ff","after":"20260927-234017-app-record-81c4"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260927-234003-app-record-65ff","durationMs":5014},"after":{"id":"20260927-234017-app-record-81c4","durationMs":5011},"totals":{"commits":"43 → 43 (0%)","renders":"165 → 66 (-60%)","commitsPerSec":"8.58 → 8.58 (0%)","rendersPerSec":"32.91 → 13.17 (-60%)","rendersPerCommit":"3.8 → 1.5 (-61%)","rendersWithoutDomPerSec":"19.74 → 0 (-100%)","rendersPerTextChange":"5 → 2 (-60%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.58 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"19.74 → 0 (-100%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.58 → 6.59 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.58 → 6.59 (0%)"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 2 (+1%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.99 → 2 (+1%)"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 2 (+1%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.99 → 2 (+1%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":" … [1386 more]
```

**agent:** Root cause and fix confirmed.

**What was wrong:** `ActivityLog`'s Redux `mapState` (`src/components/ActivityLog.tsx:12`) did `state.activity.items.filter(item => !item.muted)` inline. This runs on *every* store dispatch, including the `connection/beat` heartbeat that fires ~6.6×/sec from the socket worker and never touches `activity.items`. `.filter()` always returns a new array, so `connect()`'s shallow-equality check saw a "changed" prop every single time and re-rendered `ActivityLog` — 32 of 33 times with identical content, per the recording (`Connect(ActivityLog)`, `ChatView.tsx:35`, `noDomChange: 32/33`). The store already exported a memoized `reselect` selector, `selectVisibleActivity` (`src/store/activity.ts:43`), but it was never used.

**Fix:** swapped the inline filter for the memoized selector, so `mapState` only produces a new reference when `activity.items` actually changes:

```ts
const mapState = (state: State) => ({ items: selectVisibleActivity(state) });
```

**Before/after (5s idle recording, same URL, same scenario):**

| | before | after | change |
|---|---|---|---|
| renders | 165 | 66 | −60% |
| renders without any DOM change | 99 (19.7/s) | 0 | −100% |
| renders per commit | 3.8 | 1.5 | −61% |
| commits (real work) | 43 | 43 | unchanged |
| `Connect(ActivityLog)` re-renders | 33 (6.6/s) | 0 | gone |

Every other root's render rate is unchanged (0%/+1% rounding), and commit count is identical — the page still updates exactly the same DOM at the same times, so nothing visible changed. The only thing eliminated was `ActivityLog` waking up ~6-7 times a second for no reason while sitting in a background tab.
