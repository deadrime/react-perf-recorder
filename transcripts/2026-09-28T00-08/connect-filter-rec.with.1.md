# connect-filter-rec, with the plugin, run 1

fixed (waste 1); checks 5 of 5; $0.23, 92 s, 16 turns

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

> ## Findings
> 
> The one thing rendering for nothing was **`Connect(ActivityLog)`** (`src/components/ChatView.tsx:35`, defined in `src/components/ActivityLog.tsx`).
> 
> Its `mapState` did:
> ```js
> const mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });
> ```
> `.filter()` allocates a **new array reference on every call**. `connect()` re-runs `mapState` on every Redux store notification — including `connection/beat`, a heartbeat action dispatched ~7×/sec by the socket worker that has nothing to do with activity data. Since the returned `items` array is a new reference each time, `connect`'s shallow-equality check always fails, so it forces a re-render even when the actual content is unchanged (the recording noted "33 of them same content" for 34 hits).
> 
> The store module (`src/store/activity.ts:43`) already had a properly memoized selector for this — `selectVisibleActivity`, built with `createSelector` — it just wasn't being used.
> 
> ## Fix
> 
> `src/components/ActivityLog.tsx`: swapped the inline `.filter()` for the existing memoized `selectVisibleActivity` selector, so `mapState` returns the same array reference when `state.activity.items` hasn't changed. No behavior, markup, or timing changes — same list is shown.
> 
> ## Before / after (5s idle recording, same scenario replayed)
> 
> | Metric | Before | After | Δ |
> |---|---|---|---|
> | Total renders | 177 | 66 | **-63%** |
> | Renders/sec | 35.3 | 13.1 | **-63%** |
> | Renders with no DOM change/sec | 19.75 | 0 | **-100%** |
> | `Connect(ActivityLog)` cascade/sec | 20.35 | 0 (root gone) | **-100%** |
> | Commits | 44 | 43 | ~0% (unrelated, real updates still happen) |
> 
> `wastingAfter` came back empty — after the fix, no root in the page renders for content that didn't change. The remaining renders (SyncBar, ChannelStats, OnlineNow, TypingLine, Status, etc.) all correspond to real DOM changes driven by legitimate ticks/queries, confirmed by their `noDomChange: 0` in the original recording, so they're left alone as designed.

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

**agent:** This task matches the react-perf-recorder skill exactly — let me use it to analyze the recording and find the wasted re-renders.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Analyze ./recording.txt — page complaint: with chat left open in a background tab, fan spins up and page looks idle. Find cascade roots re-rendering for nothing, identify hook/store cause, fix in ./src without changing what the page shows, and prove with before/after numbers."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4241 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-000859-app-panel-4b4d
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:41451/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording","max_results":1}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
```

**→ rpr:get_recording**
```
{"id":"20260928-000859-app-panel-4b4d"}
```

**←**
```
{"id":"20260928-000859-app-panel-4b4d","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-000859-app-panel-4b4d","summary":{"id":"20260928-000859-app-panel-4b4d","status":"done","createdAt":"2026-09-28T00:09:04.632Z","source":"panel","url":"http://localhost:41451/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":177,"rendersPerScopeCommit":4,"rendersFromOutside":0,"rendersWithoutDom":99,"domTextChanges":41,"rendersPerTextChange":4.3},"topRoots":[{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":3,"noDomChange":33,"renderMsPerHit":0.15,"reasons":["34× external store #15 (33 of them same content) [store] connect(mapState) · SyncExternalStore"],"causes":["34× redux:connection/beat","34× core:message Worker"],"lanes":"Sync:34"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":" … [5895 more]
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
{"file_path":"src/components/ActivityLog.tsx"}
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
{"pattern":"**/package.json"}
```

**←**
```
No files found
```

**agent:** Found it. `ActivityLog.tsx` defines its own `mapState` that calls `.filter()` inline, creating a brand-new array reference on every store update (including the connection heartbeat, which fires ~7×/sec and has nothing to do with activity). Redux's `connect` shallow-compares the mapped props, sees a new array reference, and re-renders — 34 times in the 5s recording, 33 of which have identical content. The store module already exports a memoized selector (`selectVisibleActivity` in `src/store/activity.ts:43`, built with `createSelector`) that isn't being used.

Let me fix `ActivityLog.tsx` to use it.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ActivityLog.tsx","old_string":"import { connect } from 'react-redux';\nimport type { ActivityItem, State } from '../store/activity';\n\nconst ActivityLog = ({ items }: { items: ActivityItem[] }) => (\n  <ul className=\"activity\" data-testid=\"activity\">\n    {items.slice(-4).map((item) => (\n      <li key={item.id}>{item.text}</li>\n    ))}\n  </ul>\n);\n\nconst mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });\n\nexport default connect(mapState)(ActivityLog);","new_s … [527 more]
```

**←**
```
The file src/components/ActivityLog.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let me record a fresh "after" run to prove the fix worked, using the same scenario (open, wait for messages, leave idle for a few seconds).

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":2}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**agent:** I'll replay the original recording's scenario (idle wait) against the fixed code for a clean before/after comparison.

**→ rpr:record_page**
```
{"replay":"20260928-000859-app-panel-4b4d","label":"after"}
```

**←**
```
{"id":"20260928-000954-app-record-9ff8","url":"http://localhost:41451/?tick=150","requested":"http://localhost:41451/?tick=150","durationSec":5.1,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-000859-app-panel-4b4d has no actions: recorded the page as it is for 5012 ms instead"]}
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":1}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ rpr:compare_recordings**
```
{"before":"20260928-000859-app-panel-4b4d","after":"20260928-000954-app-record-9ff8"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-000859-app-panel-4b4d","durationMs":5012},"after":{"id":"20260928-000954-app-record-9ff8","durationMs":5052},"totals":{"commits":"44 → 43 (-2%)","renders":"177 → 66 (-63%)","commitsPerSec":"8.78 → 8.51 (-3%)","rendersPerSec":"35.32 → 13.06 (-63%)","rendersPerCommit":"4 → 1.5 (-62%)","rendersWithoutDomPerSec":"19.75 → 0 (-100%)","rendersPerTextChange":"4.3 → 2 (-53%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.78 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"20.35 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.78 → 6.53 (-4%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.78 → 6.53 (-4%)"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < L … [2180 more]
```

**agent:** ## Findings

The one thing rendering for nothing was **`Connect(ActivityLog)`** (`src/components/ChatView.tsx:35`, defined in `src/components/ActivityLog.tsx`).

Its `mapState` did:
```js
const mapState = (state: State) => ({ items: state.activity.items.filter((item) => !item.muted) });
```
`.filter()` allocates a **new array reference on every call**. `connect()` re-runs `mapState` on every Redux store notification — including `connection/beat`, a heartbeat action dispatched ~7×/sec by the socket worker that has nothing to do with activity data. Since the returned `items` array is a new reference each time, `connect`'s shallow-equality check always fails, so it forces a re-render even when the actual content is unchanged (the recording noted "33 of them same content" for 34 hits).

The store module (`src/store/activity.ts:43`) already had a properly memoized selector for this — `selectVisibleActivity`, built with `createSelector` — it just wasn't being used.

## Fix

`src/components/ActivityLog.tsx`: swapped the inline `.filter()` for the existing memoized `selectVisibleActivity` selector, so `mapState` returns the same array reference when `state.activity.items` hasn't changed. No behavior, markup, or timing changes — same list is shown.

## Before / after (5s idle recording, same scenario replayed)

| Metric | Before | After | Δ |
|---|---|---|---|
| Total renders | 177 | 66 | **-63%** |
| Renders/sec | 35.3 | 13.1 | **-63%** |
| Renders with no DOM change/sec | 19.75 | 0 | **-100%** |
| `Connect(ActivityLog)` cascade/sec | 20.35 | 0 (root gone) | **-100%** |
| Commits | 44 | 43 | ~0% (unrelated, real updates still happen) |

`wastingAfter` came back empty — after the fix, no root in the page renders for content that didn't change. The remaining renders (SyncBar, ChannelStats, OnlineNow, TypingLine, Status, etc.) all correspond to real DOM changes driven by legitimate ticks/queries, confirmed by their `noDomChange: 0` in the original recording, so they're left alone as designed.
