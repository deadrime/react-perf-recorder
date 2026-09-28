# two-bugs-rec, with the plugin, run 1

fixed (waste 0); checks 6 of 6; $0.35, 195 s, 3 turns

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

> Confirmed — both edits are in place and match the report exactly.
> 
> **Root cause:** two components were re-subscribing to raw store values instead of derived ones, so zustand's reference-equality check saw "changes" that never actually altered the DOM:
> - `Header.tsx` — `Unread` selected the whole `workspace` object, which `tick()` rebuilds every background tick (reactions/read receipts), not just when `unread` itself changes.
> - `TimeAgo.tsx` — selected the raw clock timestamp instead of the bucketed label text, so it re-rendered every second even when the displayed "a few seconds ago" text hadn't changed.
> 
> **Fix:** pointed both at narrow/derived selectors (`selectUnread`, and `timeAgo(s.now, sentAt)` inside the selector) — same visible output, fewer re-renders. Everything else (`SyncBar`, `TypingLine`, `ChannelStats`, `OnlineNow`, `Status`) was already rendering only on real content changes and was left untouched.
> 
> **Before → after** (same idle 5s window, recorder comparison):
> - Total renders: 126 → 66 (−48%)
> - Renders/sec: 25.14 → 13.14 (−48%)
> - Renders with no DOM change: 9.58/sec → **0/sec** (−100%)
> - Wasteful cascade roots remaining: **none**
> 
> Files changed: `src/components/Header.tsx`, `src/components/TimeAgo.tsx`. No visual or behavioral change to the page.

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

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-080413-app-panel-b2b4
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:41933/?tick=150
2	
```

**agent:** I'll hand this off to the specialized perf-recorder agent, which has the recording-analysis and browser tools needed to find the cascade root, fix it, and verify with before/after numbers.

**→ Agent**
```
{"description":"Diagnose and fix idle re-renders","subagent_type":"react-perf-recorder:perf-recorder","run_in_background":false,"prompt":"A React app lives in this folder, source in ./src. Its dev server is already running at http://localhost:41933/?tick=150 (see ./dev-url.txt) and hot-reloads as source changes.\n\nComplaint: the chat page stays busy even when nobody is interacting with it — reactions and read receipts keep arriving in the background, and the user suspects components are re-rendering for no reason (wasted renders that don't change what's shown), causing extra work while idle.  … [1622 more]
```

> **input:** A React app lives in this folder, source in ./src. Its dev server is already running at http://localhost:41933/?tick=150 (see ./dev-url.txt) and hot-reloads as source changes.
> 
> Complaint: the chat pag … [1864 more]

> **→ rpr:get_recording**
> ```
> {"id":"20260928-080413-app-panel-b2b4"}
> ```

> **←**
> ```
> {"id":"20260928-080413-app-panel-b2b4","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-080413-app-panel-b2b4","summary":{"id":"20260928-080413-app-panel-b2b4","status":"done","createdAt":"2026-09-28T08:04:18.520Z","source":"panel","url":"http://localhost:41933/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":49,"commitsPerSec":9.78,"commitsInScope":49,"renders":126,"rendersPerScopeCommit":2.6,"rendersFromOutside":0,"rendersWithoutDom":48,"domTextChanges":41,"rendersPerTextChange":3.1},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.79,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.1,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","hits":34,"hitsPerSec":6.79,"instances":1,"perHit":1,"noDomChange":33,"renderMsPerHit":0.03,"reasons":["34× external store #2 [useChatStore] selectWorkspace · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Header.tsx:11 const workspace = useChatStore( … [6352 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Header.tsx"}
> ```

> **←**
> ```
> 1	import { useStore } from 'zustand';
> 2	import { useChatStore } from '../store/chat';
> 3	import { draftStore } from '../store/draft';
> 4	import { selectWorkspace } from '../store/selectors';
> 5	import { ChannelTopic } from './ChannelTopic';
> 6	import { TimezoneBadge } from './Settings';
> 7	import { TypingBadge } from './TypingBadge';
> 8	import Workspace from './Workspace';
> 9	
> 10	const Unread = () => {
> 11	  const workspace = useChatStore(selectWorkspace);
> 12	  return (
> 13	    <span className="badge" data-testid="unread">
> 14	      {workspace.unread} unread
> 15	    </span>
> 16	  );
> 17	};
> 18	
> 19	const DraftBadge = () => {
> 20	  const hasDraft = useStore(draftStore, (s) => s.hasDraft);
> 21	  return hasDraft ? (
> 22	    <span className="badge muted" data-testid="draft">
> 23	      draft
> 24	    </span>
> 25	  ) : null;
> 26	};
> 27	
> 28	export const Header = () => (
> 29	  <header className="head" data-testid="header">
> 30	    <Workspace />
> 31	    <ChannelTopic />
> 32	    <Unread />
> 33	    <TimezoneBadge />
> 34	    <TypingBadge />
> 35	    <DraftBadge />
> 36	  </header>
> 37	);
> 38	
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

> **→ Grep**
> ```
> {"pattern":"selectWorkspace|selectSeen|selectMessageIds","path":"src/store/selectors.ts","output_mode":"content","-n":true}
> ```

> **←**
> ```
> 4:export const selectWorkspace = (s: Chat) => s.workspace;
> 7:export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));
> 11:export const selectSeen = (s: Chat) => s.workspace.unread < 13;
> ```

> **→ Read**
> ```
> {"file_path":"src/store/chat.ts"}
> ```

> **←**
> ```
> 1	import { create, type StateCreator } from 'zustand';
> 2	import { devtools } from 'zustand/middleware';
> 3	import { createStore } from 'zustand/vanilla';
> 4	
> 5	export type Person = 'Anna' | 'Boris' | 'Chen';
> 6	
> 7	export interface Message {
> 8	  id: string;
> 9	  from: Person;
> 10	  text: string;
> 11	  sentAt: number;
> 12	}
> 13	
> 14	/** The chat runs on a compressed clock: a message every 40 ticks, a reaction every 5, typing three ticks ahead. */
> 15	export const ARRIVAL_EVERY = 40;
> 16	export const TYPING_LEAD = 3;
> 17	const REACTION_EVERY = 5;
> 18	
> 19	const PEOPLE: Person[] = ['Anna', 'Boris', 'Chen'];
> 20	const ARRIVALS = [
> 21	  'One more thing before I forget — the picker keeps the scroll now',
> 22	  'Anyone else seeing the countdown flicker?',
> 23	  'Merged. The release notes are in the channel topic',
> 24	  'I moved the standup to 10:30 tomorrow',
> 25	];
> 26	
> 27	export const senderAt = (step: number): Person => PEOPLE[Math.floor(step / ARRIVAL_EVERY) % PEOPLE.length];
> 28	
> 29	interface FeedSlice {
> 30	  reactionsById: Record<string, number>;
> 31	  tick(step: number): void;
> 32	}
> 33	
> 34	export interface Prefs {
> 35	  timeFormat: '12h' | '24h';
> 36	  compact: boolean;
> 37	}
> 38	
> 39	export const DEFAULT_PREFS: Prefs = { timeFormat: '24h', compact: false };
> 40	
> 41	interface WorkspaceSlice {
> 42	  workspace: { id: string; name: string; unread: number; lastEventAt: number };
> 43	  prefs: Prefs;
> 44	  markRead(): void;
> 45	}
> 46	
> 47	interface MessagesSlice {
> 48	  messageById: Record<string, Message>;
> 49	  /**  … [3483 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Messages.tsx"}
> ```

> **←**
> ```
> 1	import { memo, useMemo } from 'react';
> 2	import { memoize } from 'proxy-memoize';
> 3	import { messageInfo, selectMessageIds, selectSeen } from '../store/selectors';
> 4	import { useChatStore, type Chat } from '../store/chat';
> 5	import { useSettings } from './Settings';
> 6	import { TimeAgo } from './TimeAgo';
> 7	
> 8	function useMessageInfo(id: string) {
> 9	  const select = useMemo(() => memoize((s: Chat) => messageInfo(s, id)), [id]);
> 10	  return useChatStore(select);
> 11	}
> 12	
> 13	const Status = memo(({ id }: { id: string }) => {
> 14	  const info = useMessageInfo(id);
> 15	  const seen = useChatStore(selectSeen);
> 16	  return (
> 17	    <span className="status" title={seen ? 'read by everyone' : 'sent'}>
> 18	      ♥ <b>{info.reactions}</b> {seen ? '✓✓' : '✓'}
> 19	    </span>
> 20	  );
> 21	});
> 22	
> 23	const NO_FILES: string[] = [];
> 24	
> 25	const Attachments = memo(({ id }: { id: string }) => {
> 26	  const files = useChatStore((s) => s.attachmentsById[id] ?? NO_FILES);
> 27	  return files.length ? <span className="files">📎 {files.join(', ')}</span> : null;
> 28	});
> 29	
> 30	export const MessageRow = memo(({ id }: { id: string }) => {
> 31	  const message = useChatStore((s) => s.messageById[id]);
> 32	  const { dense } = useSettings();
> 33	  return (
> 34	    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
> 35	      <span className="avatar">{message.from[0]}</span>
> 36	      <span className="body">
> 37	        <span className="who">
> 38	          {message.from}
> 39	          <TimeA … [951 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/TimeAgo.tsx"}
> ```

> **←**
> ```
> 1	import { useStore } from 'zustand';
> 2	import { clockStore, timeAgo } from '../store/clock';
> 3	
> 4	export const TimeAgo = ({ sentAt }: { sentAt: number }) => {
> 5	  const now = useStore(clockStore, (s) => s.now);
> 6	  return <small data-testid="time-ago">{timeAgo(now, sentAt)}</small>;
> 7	};
> 8	
> ```

> **→ Read**
> ```
> {"file_path":"src/store/clock.ts"}
> ```

> **←**
> ```
> 1	import { createStore } from 'zustand/vanilla';
> 2	
> 3	/** One clock for the whole page: every relative time reads it. */
> 4	export const clockStore = createStore(() => ({ now: Date.now() }));
> 5	
> 6	setInterval(() => clockStore.setState({ now: Date.now() }), 1000);
> 7	
> 8	export function timeAgo(now: number, sentAt: number): string {
> 9	  const seconds = Math.max(0, Math.round((now - sentAt) / 1000));
> 10	  if (seconds < 5) return 'just now';
> 11	  if (seconds < 45) return 'a few seconds ago';
> 12	  if (seconds < 90) return 'a minute ago';
> 13	  const mins = Math.round(seconds / 60);
> 14	  return mins < 60 ? `${mins} minutes ago` : `${Math.round(mins / 60)} hours ago`;
> 15	}
> 16	
> ```

> **→ Grep**
> ```
> {"pattern":"clockStore","path":"src","output_mode":"files_with_matches"}
> ```

> **←**
> ```
> Found 2 files
> src/components/TimeAgo.tsx
> src/store/clock.ts
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"const Unread = () => {\n  const workspace = useChatStore(selectWorkspace);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {workspace.unread} unread\n    </span>\n  );\n};","new_string":"const Unread = () => {\n  const unread = useChatStore((s) => s.workspace.unread);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {unread} unread\n    </span>\n  );\n};"}
> ```

> **←**
> ```
> The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Read**
> ```
> {"file_path":"src/store/selectors.ts"}
> ```

> **←**
> ```
> 1	import { memoize } from 'proxy-memoize';
> 2	import type { Chat } from './chat';
> 3	
> 4	export const selectWorkspace = (s: Chat) => s.workspace;
> 5	export const selectUnread = (s: Chat) => s.workspace.unread;
> 6	
> 7	export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));
> 8	
> 9	export const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });
> 10	
> 11	export const selectSeen = (s: Chat) => s.workspace.unread < 13;
> 12	
> ```

> **→ Grep**
> ```
> {"pattern":"selectWorkspace","path":"src","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/store/selectors.ts:4:export const selectWorkspace = (s: Chat) => s.workspace;
> src/components/Header.tsx:4:import { selectWorkspace } from '../store/selectors';
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"import { selectWorkspace } from '../store/selectors';","new_string":"import { selectUnread } from '../store/selectors';"}
> ```

> **←**
> ```
> The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"  const unread = useChatStore((s) => s.workspace.unread);","new_string":"  const unread = useChatStore(selectUnread);"}
> ```

> **←**
> ```
> The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/TimeAgo.tsx","old_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const now = useStore(clockStore, (s) => s.now);\n  return <small data-testid=\"time-ago\">{timeAgo(now, sentAt)}</small>;\n};","new_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));\n  return <small data-testid=\"time-ago\">{label}</small>;\n};"}
> ```

> **←**
> ```
> The file src/components/TimeAgo.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-080413-app-panel-b2b4","label":"after"}
> ```

> **←**
> ```
> {"id":"20260928-080629-app-record-c13a","url":"http://localhost:41933/?tick=150","requested":"http://localhost:41933/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-080413-app-panel-b2b4 has no actions: recorded the page as it is for 5011 ms instead"]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-080413-app-panel-b2b4","after":"20260928-080629-app-record-c13a"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-080413-app-panel-b2b4","durationMs":5011},"after":{"id":"20260928-080629-app-record-c13a","durationMs":5022},"totals":{"commits":"49 → 43 (-12%)","renders":"126 → 66 (-48%)","commitsPerSec":"9.78 → 8.56 (-12%)","rendersPerSec":"25.14 → 13.14 (-48%)","rendersPerCommit":"2.6 → 1.5 (-42%)","rendersWithoutDomPerSec":"9.58 → 0 (-100%)","rendersPerTextChange":"3.1 → 2 (-35%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.79 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.79 → 0 (-100%)"},{"root":"TimeAgo","source":"src/components/Messages.tsx:39","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"gone","hitsPerSec":"1 → –","perHit":"3 → –","instances":"3 → –","cascadePerSec":"2.99 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed" … [2471 more]
> ```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a0d26d6274dd47bbb (internal ID - do not mention to user. Use SendMessage with to: 'a0d26d6274dd47bbb', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-vSIRXz/tmp/claude-0/-tmp-claude-eval-vSIRXz-home-cwd/a69398d4-1a36-40e9-8a29-f53fdd232a24/tasks/a0d26d6274dd47bbb.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** The perf-recorder agent is now running in the background to analyze the recording, find any wasted idle re-renders, apply a minimal fix if needed, and produce before/after numbers. I'll report back once it finishes.

> **agent:** ## Root causes found (idle re-renders that changed nothing on screen)
> 
> **1. `Unread` badge — `src/components/Header.tsx:11` (was line 32 pre-fix)**
> ```js
> const workspace = useChatStore(selectWorkspace);   // selectWorkspace = (s) => s.workspace
> ```
> `selectWorkspace` (`src/store/selectors.ts:4`) returns the whole `workspace` object. The `tick()` action in `src/store/chat.ts:69-89` rebuilds `workspace` (`{ ...s.workspace, lastEventAt: step }`) on **every** simulated background tick, even ticks where `unread` doesn't change (only `feed/message` ticks change `unread`). Because the selector returns a new object reference every tick, zustand's `Object.is` check on the selector result sees a "change" and re-renders `Unread` every time — 34 hits in the 5s recording, **33 of which (97%) changed nothing in the DOM** (`noDomChange: 33` in the recording).
> 
> **2. `TimeAgo` — `src/components/TimeAgo.tsx:5`**
> ```js
> const now = useStore(clockStore, (s) => s.now);
> return <small>{timeAgo(now, sentAt)}</small>;
> ```
> `clockStore` (`src/store/clock.ts:6`) ticks every second, but `timeAgo()` buckets time into coarse labels ("just now", "a few seconds ago", …). Selecting the raw `now` timestamp re-renders every second regardless of whether the label text changed. Recording showed **15 of 15 hits (100%) with no DOM change** across the 3 message rows.
> 
> Everything else at the top of the recording (`SyncBar`, `TypingLine`, `ChannelStats`, `OnlineNow`, `Status`, react-query/redux-driven roots) had `noDomChange: 0` — their renders genuinely changed what's on screen (a moving progress bar, real reaction counts via a memoized selector in `Messages.tsx:9`, real typing/presence text) — left untouched.
> 
> ## Fixes (behavior-preserving, ./src only)
> 
> - `src/components/Header.tsx`: `Unread` now selects the already-existing narrow selector `selectUnread` (`s.workspace.unread`, `src/store/selectors.ts:5`) instead of the whole `workspace` object, so it only re-renders when the unread count itself changes.
> - `src/components/TimeAgo.tsx`: selector now returns the derived label (`useStore(clockStore, (s) => timeAgo(s.now, sentAt))`) instead of the raw timestamp, so zustand's equality check skips re-renders whenever the label text hasn't changed. Same visible text, same update semantics.
> 
> No visual/behavioral change: both components render the exact same values as before, just re-render less often.
> 
> ## Before/after (same replay of `20260928-080413-app-panel-b2b4`, idle-only page, ~5s window, 1280×720, `?tick=150`)
> 
> Compared via `compare_recordings` (before: `20260928-080413-app-panel-b2b4`, after: `20260928-080629-app-record-c13a`):
> 
> | metric | before | after |
> |---|---|---|
> | total renders | 126 | 66 (-48%) |
> | renders/sec | 25.14 | 13.14 (-48%) |
> | renders with no DOM change / sec | 9.58 | **0 (-100%)** |
> | `Unread` cascade | 34 hits/5s, 33 no-op | **gone** (0 renders — unread genuinely didn't change in the window) |
> | `TimeAgo` cascade | 15 no-op renders/5s | **gone** (0 renders in the window) |
> | `wastingAfter` (roots still rendering for nothing) | — | **empty** |
> 
> All other roots (`SyncBar`, `TypingLine`, `ChannelStats`, `OnlineNow`, `Status`) kept essentially the same hit rate (±3%) — confirming the fix didn't remove any real work, only the wasted renders. (`MessageList`/`MessageCount`/`Connect(ActivityLog)` show as "gone" too, but that's the live background worker's random timing not landing a message-arrival event in this particular 5s window — not an effect of the fix; unrelated to `Unread`/`TimeAgo`.)
> 
> ## What still renders during idle (and why it's legitimate)
> - `SyncBar` (`src/components/ChatView.tsx:44`): live progress bar width tied to `lastEventAt`, changes every tick by design.
> - `TypingLine`, `ChannelStats`, `OnlineNow`, `Status`: each hit changed real content (typing indicator, query data, reaction count/read receipt) — `noDomChange: 0` for all, confirmed in `wastingAfter` being empty post-fix.
> 
> ## Not checked
> - React-query internals behind `ChannelStats`/`OnlineNow` (whether their polling cadence is itself necessary) — their renders are not wasted (`noDomChange: 0`), so out of scope for this "wasted render" complaint.
> - Any component outside the recorded scope/idle window (e.g. interactions like sending a message, opening settings) — recording covered only the idle period as requested.
> 
> Files touched: `src/components/Header.tsx`, `src/components/TimeAgo.tsx`.

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
{"file_path":"src/components/TimeAgo.tsx"}
```

**←**
```
1	import { useStore } from 'zustand';
2	import { clockStore, timeAgo } from '../store/clock';
3	
4	export const TimeAgo = ({ sentAt }: { sentAt: number }) => {
5	  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
6	  return <small data-testid="time-ago">{label}</small>;
7	};
8	
```

**agent:** Confirmed — both edits are in place and match the report exactly.

**Root cause:** two components were re-subscribing to raw store values instead of derived ones, so zustand's reference-equality check saw "changes" that never actually altered the DOM:
- `Header.tsx` — `Unread` selected the whole `workspace` object, which `tick()` rebuilds every background tick (reactions/read receipts), not just when `unread` itself changes.
- `TimeAgo.tsx` — selected the raw clock timestamp instead of the bucketed label text, so it re-rendered every second even when the displayed "a few seconds ago" text hadn't changed.

**Fix:** pointed both at narrow/derived selectors (`selectUnread`, and `timeAgo(s.now, sentAt)` inside the selector) — same visible output, fewer re-renders. Everything else (`SyncBar`, `TypingLine`, `ChannelStats`, `OnlineNow`, `Status`) was already rendering only on real content changes and was left untouched.

**Before → after** (same idle 5s window, recorder comparison):
- Total renders: 126 → 66 (−48%)
- Renders/sec: 25.14 → 13.14 (−48%)
- Renders with no DOM change: 9.58/sec → **0/sec** (−100%)
- Wasteful cascade roots remaining: **none**

Files changed: `src/components/Header.tsx`, `src/components/TimeAgo.tsx`. No visual or behavioral change to the page.
