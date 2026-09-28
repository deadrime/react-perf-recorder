# exact-value-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.28, 119 s, 15 turns

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

> Investigated with the recorder and found one root causing real waste.
> 
> **Cause:** `TimeAgo` (src/components/TimeAgo.tsx) subscribes to `clockStore.now`, which ticks every second (src/store/clock.ts:6). It read the raw timestamp and computed `timeAgo(now, sentAt)` afterward in the render body. But `timeAgo()` buckets into coarse ranges ("just now", "a few seconds ago", "a minute ago"...), so most 1-second ticks produced the exact same string — yet the component re-rendered every time anyway, since Zustand only sees that the raw `now` changed. Every other component in the app (`SyncBar`, `Status`, `ChannelStats`, `OnlineNow`, `TypingLine`, etc.) had `withoutDom: 0` — they only render when something actually changes on screen — so this one was the only real offender.
> 
> **Fix** (src/components/TimeAgo.tsx): moved the `timeAgo()` computation into the store selector itself, so Zustand's default equality check (`Object.is`, which works fine on primitive strings) can bail out when the formatted text is unchanged:
> 
> ```tsx
> const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
> ```
> 
> instead of selecting `now` and formatting outside. Output shown to the user is identical — same `timeAgo()` function, same strings.
> 
> **Before/after (same idle scenario, 5s, replayed at same tick rate):**
> | metric | before | after |
> |---|---|---|
> | renders with no DOM change | 15 (all from `TimeAgo`) | 0 |
> | renders/sec | 18.56 | 13.17 (-29%) |
> | commits/sec | 9.78 | 8.58 (-12%) |
> | `TimeAgo` cascade root | 2.99/sec | gone (-100%) |
> 
> Everything else that appeared to shift a little between runs (`Status` instance count, a few "gone" one-off roots like `MessageList`/`Unread`) is just the natural randomness of the idle simulated feed, not an effect of the fix — none of those roots' `withoutDom` counts were ever nonzero before or after.

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

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"recording id in ./recording.txt; investigate chat page re-rendering for nothing when idle (reactions/read receipts arriving), fix in ./src without changing page output, prove with before/after numbers"}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [3719 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-234228-app-panel-6bd7
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page","max_results":5}
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
{"id":"20260927-234228-app-panel-6bd7"}
```

**←**
```
{"id":"20260927-234228-app-panel-6bd7","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234228-app-panel-6bd7","summary":{"id":"20260927-234228-app-panel-6bd7","status":"done","createdAt":"2026-09-27T23:42:33.997Z","source":"panel","url":"http://localhost:38939/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":49,"commitsPerSec":9.78,"commitsInScope":49,"renders":93,"rendersPerScopeCommit":1.9,"rendersFromOutside":0,"rendersWithoutDom":15,"domTextChanges":41,"rendersPerTextChange":2.3},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.15,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"TimeAgo","source":"src/components/Messages.tsx:39","path":"MessageRow < MessageList < ChatPanel < ChatView","hits":5,"hitsPerSec":1,"instances":3,"perHit":3,"noDomChange":15,"renderMsPerHit":0.12,"reasons":["15× external store #2 [clockStore] (s)=>s.now · [zustand] useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/TimeAgo.tsx:5 const now = useStore(clockStore, (s) =>  … [6313 more]
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

**→ rpr:get_recording**
```
{"id":"20260927-234228-app-panel-6bd7","section":"components"}
```

**←**
```
{"id":"20260927-234228-app-panel-6bd7","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234228-app-panel-6bd7","components":{"total":14,"offset":0,"items":[{"name":"SyncBar","renders":34,"withoutDom":0,"byParent":0,"reasons":[{"i":0,"n":34,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"TimeAgo","renders":15,"mounts":1,"withoutDom":15,"byParent":0,"reasons":[{"i":4,"n":15,"reason":"external store #2 [clockStore] (s)=>s.now"}]},{"name":"ChannelStats","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"OnlineNow","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":10,"reason":"external store #3"}]},{"name":"Status","renders":9,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":3,"n":7,"reason":"external store #3 [useChatStore] outer"},{"i":7,"n":3,"reason":"external store #8 [useChatStore] selectSeen"}]},{"name":"TypingLine","renders":9,"withoutDom":0,"byParent":0,"reasons":[{"i":1,"n":9,"reason":"external store #2 [presenceStore] (s)=>s.typing"}]},{"name":"Unread","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":5,"n":1,"reason":"external store #2 [useChatStore] selectUnread"}]},{"name":"MessageList","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":6,"n":1,"reason":"external store #2 [useChatStore] selectMessageIds"}]},{"name":"MessageRow","renders":0,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"Attachments","rende … [73 more]
```

**agent:** Confirmed: `TimeAgo` is the only component rendering for nothing — all 15 of its renders in the recording produced no DOM change (`withoutDom: 15` out of `renders: 15`), while every other root (`SyncBar`, `ChannelStats`, `OnlineNow`, `Status`, `TypingLine`, etc.) has `withoutDom: 0` — they only render when something actually changes on screen.

The cause: `clockStore` ticks every second (src/store/clock.ts:6), and `TimeAgo` subscribes to the raw `now` value, then computes the display text afterward in the render body. But `timeAgo()` buckets into coarse ranges ("just now", "a few seconds ago", etc.), so most 1-second ticks produce an identical string — yet the component still re-renders because it selected the raw timestamp, not the derived text.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/TimeAgo.tsx","old_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const now = useStore(clockStore, (s) => s.now);\n  return <small data-testid=\"time-ago\">{timeAgo(now, sentAt)}</small>;\n};","new_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));\n  return <small data-testid=\"time-ago\">{label}</small>;\n};"}
```

**←**
```
The file src/components/TimeAgo.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's verify the fix with a before/after replay of the same recorded scenario.

**→ rpr:record_page**
```
{"replay":"20260927-234228-app-panel-6bd7","label":"after"}
```

**✗ error**
```
20260927-234228-app-panel-6bd7 has no actions to replay
```

**→ rpr:record_page**
```
{"url":"http://localhost:38939/?tick=150","ms":5000,"label":"after-fix"}
```

**←**
```
{"id":"20260927-234357-app-record-2d46","url":"http://localhost:38939/?tick=150","requested":"http://localhost:38939/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","warnings":[]}
```

**→ rpr:compare_recordings**
```
{"before":"20260927-234228-app-panel-6bd7","after":"20260927-234357-app-record-2d46"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260927-234228-app-panel-6bd7","durationMs":5012},"after":{"id":"20260927-234357-app-record-2d46","durationMs":5013},"totals":{"commits":"49 → 43 (-12%)","renders":"93 → 66 (-29%)","commitsPerSec":"9.78 → 8.58 (-12%)","rendersPerSec":"18.56 → 13.17 (-29%)","rendersPerCommit":"1.9 → 1.5 (-21%)","rendersWithoutDomPerSec":"2.99 → 0 (-100%)","rendersPerTextChange":"2.3 → 2 (-13%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"TimeAgo","source":"src/components/Messages.tsx:39","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"gone","hitsPerSec":"1 → –","perHit":"3 → –","instances":"3 → –","cascadePerSec":"2.99 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.2 (-14%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.2 (-33%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.4 (-22%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.4 (-22%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","statu … [2443 more]
```

**agent:** Investigated with the recorder and found one root causing real waste.

**Cause:** `TimeAgo` (src/components/TimeAgo.tsx) subscribes to `clockStore.now`, which ticks every second (src/store/clock.ts:6). It read the raw timestamp and computed `timeAgo(now, sentAt)` afterward in the render body. But `timeAgo()` buckets into coarse ranges ("just now", "a few seconds ago", "a minute ago"...), so most 1-second ticks produced the exact same string — yet the component re-rendered every time anyway, since Zustand only sees that the raw `now` changed. Every other component in the app (`SyncBar`, `Status`, `ChannelStats`, `OnlineNow`, `TypingLine`, etc.) had `withoutDom: 0` — they only render when something actually changes on screen — so this one was the only real offender.

**Fix** (src/components/TimeAgo.tsx): moved the `timeAgo()` computation into the store selector itself, so Zustand's default equality check (`Object.is`, which works fine on primitive strings) can bail out when the formatted text is unchanged:

```tsx
const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
```

instead of selecting `now` and formatting outside. Output shown to the user is identical — same `timeAgo()` function, same strings.

**Before/after (same idle scenario, 5s, replayed at same tick rate):**
| metric | before | after |
|---|---|---|
| renders with no DOM change | 15 (all from `TimeAgo`) | 0 |
| renders/sec | 18.56 | 13.17 (-29%) |
| commits/sec | 9.78 | 8.58 (-12%) |
| `TimeAgo` cascade root | 2.99/sec | gone (-100%) |

Everything else that appeared to shift a little between runs (`Status` instance count, a few "gone" one-off roots like `MessageList`/`Unread`) is just the natural randomness of the idle simulated feed, not an effect of the fix — none of those roots' `withoutDom` counts were ever nonzero before or after.
