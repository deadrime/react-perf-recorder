# whole-object-rec, with the plugin, run 1

fixed (waste 1); checks 6 of 6; $0.25, 89 s, 18 turns

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

> Confirmed with numbers. Summary:
> 
> **Root cause**: `Unread` in `src/components/Header.tsx` subscribed to the whole `workspace` object via `selectWorkspace`, but only displays `workspace.unread`. In `src/store/chat.ts:72`, `tick()` (fired on every simulated socket message — the same clock driving reactions/read-receipts) rebuilds `workspace` as a new object every tick just to bump `lastEventAt` for the sync bar. Since zustand's default equality is reference equality, `Unread` re-rendered on every tick even though the unread count itself only changes once every 40 ticks. The recording showed this precisely: `Unread` had 34 hits in 5s with 33 of them producing no DOM change at all.
> 
> Every other root in the recording (SyncBar, ChannelStats, OnlineNow, TypingLine, Status/read-receipts) had `noDomChange: 0` — they're genuinely updating visible content, so nothing there needed fixing.
> 
> **Fix**: swapped `selectWorkspace` for the already-defined-but-unused `selectUnread` selector (`s => s.workspace.unread`) in `Header.tsx`, so the component subscribes to just the number instead of the whole object. No visible output changed — same badge, same text.
> 
> **Before/after** (5s idle recordings, same page/scenario):
> - Total renders: 111 → 66 (‑41%)
> - Renders producing no DOM change: 6.58/s → 0/s (‑100%)
> - Renders per commit: 2.5 → 1.5 (‑40%)
> - `Unread` as a cascade root: 34 hits/5s (all wasted but 1) → gone entirely
> - Commit rate essentially unchanged (44 → 43 commits), confirming the store activity itself wasn't touched — only the wasteful downstream render was eliminated.

## What it changed

```
diff -ruN a/src/components/Header.tsx b/src/components/Header.tsx
--- a/src/components/Header.tsx
+++ b/src/components/Header.tsx
@@ -1,17 +1,17 @@
 import { useStore } from 'zustand';
 import { useChatStore } from '../store/chat';
 import { draftStore } from '../store/draft';
-import { selectWorkspace } from '../store/selectors';
+import { selectUnread } from '../store/selectors';
 import { ChannelTopic } from './ChannelTopic';
 import { TimezoneBadge } from './Settings';
 import { TypingBadge } from './TypingBadge';
 import Workspace from './Workspace';
 
 const Unread = () => {
-  const workspace = useChatStore(selectWorkspace);
+  const unread = useChatStore(selectUnread);
   return (
     <span className="badge" data-testid="unread">
-      {workspace.unread} unread
+      {unread} unread
     </span>
   );
 };
```

## The steps

**agent:** This matches the react-perf-recorder skill exactly — let me use it to analyze the recording and drive the fix.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"recording id in ./recording.txt; complaint: chat page stays busy/re-renders when idle even though reactions and read receipts keep arriving in the background; find root cause, fix in ./src without changing what the page shows, prove with before/after numbers"}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [3777 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-235833-app-panel-c1ed
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:42347/?tick=150
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
{"id":"20260927-235833-app-panel-c1ed"}
```

**←**
```
{"id":"20260927-235833-app-panel-c1ed","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235833-app-panel-c1ed","summary":{"id":"20260927-235833-app-panel-c1ed","status":"done","createdAt":"2026-09-27T23:58:38.022Z","source":"panel","url":"http://localhost:42347/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":111,"rendersPerScopeCommit":2.5,"rendersFromOutside":0,"rendersWithoutDom":33,"domTextChanges":41,"rendersPerTextChange":2.7},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.14,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":33,"renderMsPerHit":0.05,"reasons":["34× external store #2 [useChatStore] selectWorkspace · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Header.tsx:11 const workspace = useChatStore … [5590 more]
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
4	import { selectWorkspace } from '../store/selectors';
5	import { ChannelTopic } from './ChannelTopic';
6	import { TimezoneBadge } from './Settings';
7	import { TypingBadge } from './TypingBadge';
8	import Workspace from './Workspace';
9	
10	const Unread = () => {
11	  const workspace = useChatStore(selectWorkspace);
12	  return (
13	    <span className="badge" data-testid="unread">
14	      {workspace.unread} unread
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

**→ Grep**
```
{"pattern":"selectWorkspace|selectUnread","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/store/selectors.ts:4:export const selectWorkspace = (s: Chat) => s.workspace;
src/store/selectors.ts:5:export const selectUnread = (s: Chat) => s.workspace.unread;
src/components/Header.tsx:4:import { selectWorkspace } from '../store/selectors';
src/components/Header.tsx:11:  const workspace = useChatStore(selectWorkspace);
```

**agent:** Found it: `Unread` in `Header.tsx` subscribes to the entire `workspace` object via `selectWorkspace`, but only displays `workspace.unread`. Since `tick()` in `src/store/chat.ts:72` replaces the `workspace` object every tick (to update `lastEventAt` for the sync bar), `Unread` gets a new object reference — and re-renders — on every tick, even though the unread count itself only changes once every 40 ticks. That matches the recording exactly: 34 hits, 33 with no DOM change. The store already exports an unused `selectUnread` selector for exactly this. I'll switch to it.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"import { selectWorkspace } from '../store/selectors';","new_string":"import { selectUnread } from '../store/selectors';"}
```

**←**
```
The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"const Unread = () => {\n  const workspace = useChatStore(selectWorkspace);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {workspace.unread} unread\n    </span>\n  );\n};","new_string":"const Unread = () => {\n  const unread = useChatStore(selectUnread);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {unread} unread\n    </span>\n  );\n};"}
```

**←**
```
The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's record the same idle scenario again to get after-numbers.

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

**→ rpr:record_page**
```
{"replay":"20260927-235833-app-panel-c1ed","label":"after"}
```

**✗ error**
```
20260927-235833-app-panel-c1ed has no actions to replay
```

**→ rpr:record_page**
```
{"url":"http://localhost:42347/?tick=150","ms":5000,"label":"after"}
```

**←**
```
{"id":"20260927-235930-app-record-93a3","url":"http://localhost:42347/?tick=150","requested":"http://localhost:42347/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** rendersWithoutDom went from 33 to 0. Let's compare directly against the original recording for full before/after numbers.

**→ rpr:compare_recordings**
```
{"before":"20260927-235833-app-panel-c1ed","after":"20260927-235930-app-record-93a3"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260927-235833-app-panel-c1ed","durationMs":5013},"after":{"id":"20260927-235930-app-record-93a3","durationMs":5017},"totals":{"commits":"44 → 43 (-2%)","renders":"111 → 66 (-41%)","commitsPerSec":"8.78 → 8.57 (-2%)","rendersPerSec":"22.14 → 13.16 (-41%)","rendersPerCommit":"2.5 → 1.5 (-40%)","rendersWithoutDomPerSec":"6.58 → 0 (-100%)","rendersPerTextChange":"2.7 → 2 (-26%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.78 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.78 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.2 (-14%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.2 (-33%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.4 (-22%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.4 (-22%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hi … [2159 more]
```

**agent:** Confirmed with numbers. Summary:

**Root cause**: `Unread` in `src/components/Header.tsx` subscribed to the whole `workspace` object via `selectWorkspace`, but only displays `workspace.unread`. In `src/store/chat.ts:72`, `tick()` (fired on every simulated socket message — the same clock driving reactions/read-receipts) rebuilds `workspace` as a new object every tick just to bump `lastEventAt` for the sync bar. Since zustand's default equality is reference equality, `Unread` re-rendered on every tick even though the unread count itself only changes once every 40 ticks. The recording showed this precisely: `Unread` had 34 hits in 5s with 33 of them producing no DOM change at all.

Every other root in the recording (SyncBar, ChannelStats, OnlineNow, TypingLine, Status/read-receipts) had `noDomChange: 0` — they're genuinely updating visible content, so nothing there needed fixing.

**Fix**: swapped `selectWorkspace` for the already-defined-but-unused `selectUnread` selector (`s => s.workspace.unread`) in `Header.tsx`, so the component subscribes to just the number instead of the whole object. No visible output changed — same badge, same text.

**Before/after** (5s idle recordings, same page/scenario):
- Total renders: 111 → 66 (‑41%)
- Renders producing no DOM change: 6.58/s → 0/s (‑100%)
- Renders per commit: 2.5 → 1.5 (‑40%)
- `Unread` as a cascade root: 34 hits/5s (all wasted but 1) → gone entirely
- Commit rate essentially unchanged (44 → 43 commits), confirming the store activity itself wasn't touched — only the wasteful downstream render was eliminated.
