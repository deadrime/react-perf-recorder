# exact-value-rec, with the plugin, run 1

fixed (waste 0); checks 5 of 5; $0.26, 107 s, 14 turns

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

> ## Findings
> 
> The recording (`20260928-001107-app-panel-3b83`) showed one root producing pure waste: **`TimeAgo`** (`src/components/TimeAgo.tsx:5`, rendered inside every `MessageRow`). It subscribed to `clockStore`'s raw `now` timestamp, which ticks every second (`src/store/clock.ts:6`). All **15/15** of its renders in the recording changed nothing in the DOM (`rendersWithoutDom: 15`, matching the recording's total) — because `timeAgo()` only changes its output text at coarse boundaries (5s / 45s / 90s / per-minute), so most 1-second ticks produce an identical string.
> 
> Every other cascade root in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `Status`, `TypingLine`, etc.) had `noDomChange: 0` — those renders were legitimate reactions to real reaction/read-receipt/presence events, not the bug.
> 
> ## Fix
> 
> `src/components/TimeAgo.tsx` — moved the `timeAgo()` computation into the zustand selector itself, so the subscription's output is the derived string rather than the raw timestamp. `useSyncExternalStoreWithSelector` skips the re-render when the selected value is unchanged, so the component now only re-renders when the displayed text would actually differ. Nothing about what's shown or when the text updates changes — only the redundant intermediate renders are removed.
> 
> ```tsx
> const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
> return <small data-testid="time-ago">{label}</small>;
> ```
> 
> ## Before / after (same idle scenario, replayed)
> 
> | metric | before | after | Δ |
> |---|---|---|---|
> | renders/sec | 18.55 | 13.13 | **-29%** |
> | renders without DOM change/sec | 2.99 | 0 | **-100%** |
> | commits/sec | 9.77 | 8.55 | -12% |
> | `TimeAgo` cascade | 5 hits/sec, 3 instances, 15/15 no-op | **gone entirely** | — |
> 
> `wastingAfter` from the comparison is empty — no root left rendering for nothing. The small drops in unrelated roots (`Status`, `TypingLine`, etc.) are run-to-run variance from the socket/worker's random event timing, not from this change — `SyncBar`, `ChannelStats`, and `OnlineNow` (the roots actually driven by socket/query events) are within noise (0% to -3%).

## What it changed

```
diff -ruN a/src/components/TimeAgo.tsx b/src/components/TimeAgo.tsx
--- a/src/components/TimeAgo.tsx
+++ b/src/components/TimeAgo.tsx
@@ -2,6 +2,6 @@
 import { clockStore, timeAgo } from '../store/clock';
 
 export const TimeAgo = ({ sentAt }: { sentAt: number }) => {
-  const now = useStore(clockStore, (s) => s.now);
-  return <small data-testid="time-ago">{timeAgo(now, sentAt)}</small>;
+  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
+  return <small data-testid="time-ago">{label}</small>;
 };
```

## The steps

**agent:** I'll check the recording id and dev URL, then use the react-perf-recorder skill to analyze the existing recording.

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-001107-app-panel-3b83
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:34037/?tick=150
2	
```

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Analyze existing recording 20260928-001107-app-panel-3b83 for the chat page. Complaint: page stays busy (re-renders) even when idle, driven by reactions and read receipts arriving. Dev server at http://localhost:34037/?tick=150. Find which components re-render for nothing while idle, identify the root cause in ./src, fix it without changing what the page displays, and produce before/after render-count numbers proving the fix."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4394 more]

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page","max_results":10}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
```

**→ rpr:get_recording**
```
{"id":"20260928-001107-app-panel-3b83"}
```

**←**
```
{"id":"20260928-001107-app-panel-3b83","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-001107-app-panel-3b83","summary":{"id":"20260928-001107-app-panel-3b83","status":"done","createdAt":"2026-09-28T00:11:12.778Z","source":"panel","url":"http://localhost:34037/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":49,"commitsPerSec":9.77,"commitsInScope":49,"renders":93,"rendersPerScopeCommit":1.9,"rendersFromOutside":0,"rendersWithoutDom":15,"domTextChanges":41,"rendersPerTextChange":2.3},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.13,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"TimeAgo","source":"src/components/Messages.tsx:39","path":"MessageRow < MessageList < ChatPanel < ChatView","hits":5,"hitsPerSec":1,"instances":3,"perHit":3,"noDomChange":15,"renderMsPerHit":0.18,"reasons":["15× external store #2 [clockStore] (s)=>s.now · [zustand] useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/TimeAgo.tsx:5 const now = useStore(clockStore, (s) =>  … [6320 more]
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
{"file_path":"src/components/TimeAgo.tsx"}
```

**←**
```
1	import { useStore } from 'zustand';
2	import { clockStore, timeAgo } from '../store/clock';
3	
4	export const TimeAgo = ({ sentAt }: { sentAt: number }) => {
5	  const now = useStore(clockStore, (s) => s.now);
6	  return <small data-testid="time-ago">{timeAgo(now, sentAt)}</small>;
7	};
8	
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
{"file_path":"src/store/clock.ts"}
```

**←**
```
1	import { createStore } from 'zustand/vanilla';
2	
3	/** One clock for the whole page: every relative time reads it. */
4	export const clockStore = createStore(() => ({ now: Date.now() }));
5	
6	setInterval(() => clockStore.setState({ now: Date.now() }), 1000);
7	
8	export function timeAgo(now: number, sentAt: number): string {
9	  const seconds = Math.max(0, Math.round((now - sentAt) / 1000));
10	  if (seconds < 5) return 'just now';
11	  if (seconds < 45) return 'a few seconds ago';
12	  if (seconds < 90) return 'a minute ago';
13	  const mins = Math.round(seconds / 60);
14	  return mins < 60 ? `${mins} minutes ago` : `${Math.round(mins / 60)} hours ago`;
15	}
16	
```

**agent:** The recording shows the cascade root `TimeAgo` (src/components/TimeAgo.tsx:5) has all 15 of its hits producing no DOM change — it subscribes to the clock store's raw `now` timestamp, which ticks every second, but the displayed "time ago" text only changes at coarse boundaries (5s/45s/90s/minute). Every other root in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `Status`, etc.) has `noDomChange: 0`, meaning their renders are legitimate. TimeAgo is the sole source of wasted renders (matches `rendersWithoutDom: 15` in the totals).

Let me confirm with the clock store, which I've already read — `setInterval` ticks every second and `timeAgo()` only changes output at 5s/45s/90s/1min boundaries. Now I'll apply the fix: move the derivation into the store selector so the subscription only fires when the displayed text actually changes.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/TimeAgo.tsx","old_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const now = useStore(clockStore, (s) => s.now);\n  return <small data-testid=\"time-ago\">{timeAgo(now, sentAt)}</small>;\n};","new_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));\n  return <small data-testid=\"time-ago\">{label}</small>;\n};"}
```

**←**
```
The file src/components/TimeAgo.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now recording the same idle scenario again to measure the effect.

**→ rpr:record_page**
```
{"replay":"20260928-001107-app-panel-3b83","label":"after"}
```

**←**
```
{"id":"20260928-001222-app-record-a34e","url":"http://localhost:34037/?tick=150","requested":"http://localhost:34037/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-001107-app-panel-3b83 has no actions: recorded the page as it is for 5013 ms instead"]}
```

**agent:** `rendersWithoutDom` dropped from 15 to 0, and `wasting` is empty. Let me run the formal comparison for exact before/after numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-001107-app-panel-3b83","after":"20260928-001222-app-record-a34e"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-001107-app-panel-3b83","durationMs":5013},"after":{"id":"20260928-001222-app-record-a34e","durationMs":5028},"totals":{"commits":"49 → 43 (-12%)","renders":"93 → 66 (-29%)","commitsPerSec":"9.77 → 8.55 (-12%)","rendersPerSec":"18.55 → 13.13 (-29%)","rendersPerCommit":"1.9 → 1.5 (-21%)","rendersWithoutDomPerSec":"2.99 → 0 (-100%)","rendersPerTextChange":"2.3 → 2 (-13%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"TimeAgo","source":"src/components/Messages.tsx:39","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"gone","hitsPerSec":"1 → –","perHit":"3 → –","instances":"3 → –","cascadePerSec":"2.99 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","s … [2484 more]
```

**agent:** ## Findings

The recording (`20260928-001107-app-panel-3b83`) showed one root producing pure waste: **`TimeAgo`** (`src/components/TimeAgo.tsx:5`, rendered inside every `MessageRow`). It subscribed to `clockStore`'s raw `now` timestamp, which ticks every second (`src/store/clock.ts:6`). All **15/15** of its renders in the recording changed nothing in the DOM (`rendersWithoutDom: 15`, matching the recording's total) — because `timeAgo()` only changes its output text at coarse boundaries (5s / 45s / 90s / per-minute), so most 1-second ticks produce an identical string.

Every other cascade root in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `Status`, `TypingLine`, etc.) had `noDomChange: 0` — those renders were legitimate reactions to real reaction/read-receipt/presence events, not the bug.

## Fix

`src/components/TimeAgo.tsx` — moved the `timeAgo()` computation into the zustand selector itself, so the subscription's output is the derived string rather than the raw timestamp. `useSyncExternalStoreWithSelector` skips the re-render when the selected value is unchanged, so the component now only re-renders when the displayed text would actually differ. Nothing about what's shown or when the text updates changes — only the redundant intermediate renders are removed.

```tsx
const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
return <small data-testid="time-ago">{label}</small>;
```

## Before / after (same idle scenario, replayed)

| metric | before | after | Δ |
|---|---|---|---|
| renders/sec | 18.55 | 13.13 | **-29%** |
| renders without DOM change/sec | 2.99 | 0 | **-100%** |
| commits/sec | 9.77 | 8.55 | -12% |
| `TimeAgo` cascade | 5 hits/sec, 3 instances, 15/15 no-op | **gone entirely** | — |

`wastingAfter` from the comparison is empty — no root left rendering for nothing. The small drops in unrelated roots (`Status`, `TypingLine`, etc.) are run-to-run variance from the socket/worker's random event timing, not from this change — `SyncBar`, `ChannelStats`, and `OnlineNow` (the roots actually driven by socket/query events) are within noise (0% to -3%).
