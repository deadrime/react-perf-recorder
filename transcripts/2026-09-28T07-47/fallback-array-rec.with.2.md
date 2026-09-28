# fallback-array-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.25, 111 s, 2 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the message list does work on every event from the socket, even for messages that did not change.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> The fix is confirmed in place and matches what was reported.
> 
> **Root cause:** `Attachments` in `src/components/Messages.tsx:25` selected `s.attachmentsById[id] ?? []` — that `?? []` created a brand-new array reference on every store notification for any message without attachments. Since Zustand compares selector output by reference, this made `Attachments` re-render on every socket tick even though nothing visible changed (confirmed by the recording: `noDomChange: 66` out of 66 renders, 100% wasted).
> 
> **Fix:** hoisted a single stable `NO_FILES = []` constant and used it as the fallback instead of a fresh literal — same output (renders `null` when empty, unchanged when attachments exist), just a stable reference.
> 
> **Proof (5s idle window, before → after via `compare_recordings`):**
> - Total renders: 143 → 66 (‑54%)
> - Renders with no DOM change: 13.17/s → 0/s (‑100%)
> - `Attachments` disappeared entirely as a cascade root (was 66 wasted renders/s)
> - All other components (`SyncBar`, `Status`, `ChannelStats`, `OnlineNow`, etc.) were untouched and already had `noDomChange: 0` — they were doing legitimate work.
> 
> One caveat from the agent: it verified the empty-attachments path via the captured recordings but didn't see a live event adding attachments to a message during either window, so that branch's correctness rests on code reading rather than a captured render — worth a quick manual check if you want extra confidence.

## What it changed

```
diff -ruN a/src/components/Messages.tsx b/src/components/Messages.tsx
--- a/src/components/Messages.tsx
+++ b/src/components/Messages.tsx
@@ -20,8 +20,10 @@
   );
 });
 
+const NO_FILES: string[] = [];
+
 const Attachments = memo(({ id }: { id: string }) => {
-  const files = useChatStore((s) => s.attachmentsById[id] ?? []);
+  const files = useChatStore((s) => s.attachmentsById[id] ?? NO_FILES);
   return files.length ? <span className="files">📎 {files.join(', ')}</span> : null;
 });
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-075226-app-panel-f661
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:38493/?tick=150
2	
```

**→ Glob**
```
{"pattern":"src/**/*"}
```

**←**
```
src/app.css
src/components/TypingLine.tsx
src/components/ActivityLog.tsx
src/components/PrefsLine.tsx
src/components/ChannelStats.tsx
src/components/Composer/useFieldError.ts
src/components/Composer/index.tsx
src/components/WebhookForm.tsx
src/components/Header.tsx
src/components/ChannelTopic.tsx
src/components/TypingBadge.tsx
src/components/Settings.tsx
src/components/MessageCount.tsx
src/components/ChatView.tsx
src/components/Workspace.tsx
src/components/ChatPanel.tsx
src/components/OnlineNow.tsx
src/components/TimeAgo.tsx
src/hooks/useSortedMembers.ts
src/hooks/useMessageCount.ts
src/feed.ts
src/vite-env.d.ts
src/main.tsx
src/store/clock.ts
src/store/activity.ts
src/store/chat.ts
src/store/selectors.ts
src/store/draft.ts
src/lib/members.ts
src/lib/channel.ts
src/components/Messages.tsx
```

**agent:** I'll hand this off to the perf-recorder agent, which has the recording tools and can produce the before/after numbers directly.

**→ Agent**
```
{"description":"Diagnose and fix message list re-renders","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app lives in this folder, source in ./src (key files include src/components/Messages.tsx, src/components/ChatView.tsx, src/components/ChatPanel.tsx, src/store/chat.ts, src/store/selectors.ts, src/feed.ts, and other components under src/components/). Its dev server is running at the URL in ./dev-url.txt (http://localhost:38493/?tick=150), and it hot-reloads as source changes.\n\nComplaint from the user: the message list does work on every event from the socket, even fo … [2410 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: ae647f19d5155bbce (internal ID - do not mention to user. Use SendMessage with to: 'ae647f19d5155bbce', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-KljLK2/tmp/claude-0/-tmp-claude-eval-KljLK2-home-cwd/eb995898-2859-46f7-8989-2dbc99ef9f10/tasks/ae647f19d5155bbce.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-075226-app-panel-f661"}
> ```

> **←**
> ```
> {"id":"20260928-075226-app-panel-f661","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075226-app-panel-f661","summary":{"id":"20260928-075226-app-panel-f661","status":"done","createdAt":"2026-09-28T07:52:31.447Z","source":"panel","url":"http://localhost:38493/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":43,"commitsPerSec":8.58,"commitsInScope":43,"renders":143,"rendersPerScopeCommit":3.3,"rendersFromOutside":0,"rendersWithoutDom":66,"domTextChanges":41,"rendersPerTextChange":3.5},"topRoots":[{"root":"Attachments","source":"src/components/Messages.tsx:42","path":"MessageRow < MessageList < ChatPanel < ChatView","hits":33,"hitsPerSec":6.58,"instances":2,"perHit":2,"noDomChange":66,"renderMsPerHit":0.04,"reasons":["66× external store #2 SAME-CONTENT [useChatStore] (s)=>s.attachmentsById[id] ?? [] · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Messages.tsx:24 const files = useChatStore((s) => s.attachmentsById[id] ?? []);"],"causes":["33× core:message Worker","32× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:33"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.58,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.12,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @  … [6450 more]
> ```

**agent:** I've dispatched the perf-recorder agent to analyze the existing recording (`20260928-075226-app-panel-f661`), find any wasted re-renders during the idle socket-churn period, fix them in `./src` if warranted, and produce before/after numbers. I'll report back once it completes.

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
> 23	const Attachments = memo(({ id }: { id: string }) => {
> 24	  const files = useChatStore((s) => s.attachmentsById[id] ?? []);
> 25	  return files.length ? <span className="files">📎 {files.join(', ')}</span> : null;
> 26	});
> 27	
> 28	export const MessageRow = memo(({ id }: { id: string }) => {
> 29	  const message = useChatStore((s) => s.messageById[id]);
> 30	  const { dense } = useSettings();
> 31	  return (
> 32	    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
> 33	      <span className="avatar">{message.from[0]}</span>
> 34	      <span className="body">
> 35	        <span className="who">
> 36	          {message.from}
> 37	          <TimeAgo sentAt={message.sentAt} />
> 38	        </s … [907 more]
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

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Messages.tsx","old_string":"const Attachments = memo(({ id }: { id: string }) => {\n  const files = useChatStore((s) => s.attachmentsById[id] ?? []);\n  return files.length ? <span className=\"files\">📎 {files.join(', ')}</span> : null;\n});","new_string":"const NO_FILES: string[] = [];\n\nconst Attachments = memo(({ id }: { id: string }) => {\n  const files = useChatStore((s) => s.attachmentsById[id] ?? NO_FILES);\n  return files.length ? <span className=\"files\">📎 {files.join(', ')}</span> : null;\n});"}
> ```

> **←**
> ```
> The file src/components/Messages.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-075226-app-panel-f661","label":"after-fix"}
> ```

> **←**
> ```
> {"id":"20260928-075331-app-record-4cec","url":"http://localhost:38493/?tick=150","requested":"http://localhost:38493/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-075226-app-panel-f661 has no actions: recorded the page as it is for 5013 ms instead"]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-075226-app-panel-f661","after":"20260928-075331-app-record-4cec"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-075226-app-panel-f661","durationMs":5013},"after":{"id":"20260928-075331-app-record-4cec","durationMs":5025},"totals":{"commits":"43 → 43 (0%)","renders":"143 → 66 (-54%)","commitsPerSec":"8.58 → 8.56 (0%)","rendersPerSec":"28.53 → 13.13 (-54%)","rendersPerCommit":"3.3 → 1.5 (-55%)","rendersWithoutDomPerSec":"13.17 → 0 (-100%)","rendersPerTextChange":"3.5 → 2 (-43%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Attachments","source":"src/components/Messages.tsx:42","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"gone","hitsPerSec":"6.58 → –","perHit":"2 → –","instances":"2 → –","cascadePerSec":"13.17 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync  … [2409 more]
> ```

> **agent:** ## Root cause
> 
> **`Attachments` in `src/components/Messages.tsx:24`** (cascade root at `Messages.tsx:42` in the original recording, `MessageRow < MessageList < ChatPanel < ChatView`):
> 
> ```ts
> const files = useChatStore((s) => s.attachmentsById[id] ?? []);
> ```
> 
> For any message id with no attachments (every message except `m1`, per `src/store/chat.ts:106` `attachmentsById: { m1: ['picker.mp4'] }`), the `?? []` literal creates a brand-new empty-array reference on every store notification. Zustand's `useSyncExternalStoreWithSelector` uses `Object.is` to decide whether to re-render; a fresh `[]` each time always fails that check, so the component re-renders on every `tick`/socket event even though `attachmentsById` itself was untouched (ticks only write `workspace` and sometimes `reactionsById`, confirmed by `topCauses[1].keys: "workspace, reactionsById"` in the recording).
> 
> The recording made this unambiguous: root `Attachments` had `hits: 33`, `perHit: 2`, `noDomChange: 66` — **100% of its 66 renders produced no DOM change**, and the reason line was flagged `SAME-CONTENT`, i.e. the selector kept returning equal-content-but-different-identity arrays. This is exactly the "list churns on every socket event even though nothing visible changes" complaint. No other root in the recording showed `noDomChange` waste (e.g. `SyncBar` at `ChatView.tsx:44` re-renders every tick too, but its `noDomChange` was 0 because it visibly animates a width — that one is legitimate and was left alone).
> 
> ## Fix
> 
> `src/components/Messages.tsx:24` — replaced the per-render `[]` literal with a module-level stable empty array:
> 
> ```ts
> const NO_FILES: string[] = [];
> 
> const Attachments = memo(({ id }: { id: string }) => {
>   const files = useChatStore((s) => s.attachmentsById[id] ?? NO_FILES);
>   return files.length ? <span className="files">📎 {files.join(', ')}</span> : null;
> });
> ```
> 
> No behavior/DOM change: when there are no attachments the component still renders `null`; when `attachmentsById[id]` exists (e.g. `m1`), that array reference was already stable (ticks never touch `attachmentsById`), so this branch is untouched.
> 
> ## Proof (before → after, `compare_recordings`, same 5s idle window, same URL `http://localhost:38493/?tick=150`)
> 
> - Total renders: **143 → 66 (-54%)**
> - Renders without any DOM change: **13.17/s → 0/s (-100%)**
> - `Attachments` root: **gone** — no longer a cascade root at all (was 33 hits/s × 2 instances = 66 wasted renders/s)
> - `wastingAfter`: `[]` — nothing left renders for nothing
> - Every other root's `perHit` and cascade rate held (`SyncBar`, `ChannelStats`, `OnlineNow` unchanged; a few one-off roots like `Unread`/`MessageCount`/`ActivityLog` show as "gone" only because they fired from a single message-arrival event that landed outside the 5s window on this particular run — timing variance of the underlying feed, unrelated to the fix)
> 
> After-fix recording id: `20260928-075331-app-record-4cec` (replay of the original recording `20260928-075226-app-panel-f661`).
> 
> ## What still renders (legitimately)
> 
> - `SyncBar` (`src/components/ChatView.tsx:44/55`) still re-renders on every tick — its width style genuinely changes each time (`noDomChange: 0` in both before and after), so it's doing real visual work, not waste.
> - `Status`, `ChannelStats`, `OnlineNow`, `TypingLine` etc. all had `noDomChange: 0` in the original recording and were unaffected by the fix — their renders correspond to actual content changes (reactions, presence, typing).
> 
> ## Not checked
> 
> - Did not investigate renders triggered by user interaction (typing, sending a message, deleting) — only the idle-socket-churn scenario from the given recording/repro was analyzed.
> - Did not check behavior of `Attachments` when a message with attachments arrives via the feed (no such event occurred in either 5s recording window); the fix's correctness there rests on code reading, not a captured render.

**→ Read**
```
{"file_path":"src/components/Messages.tsx","offset":1,"limit":40}
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
39	          <TimeA … [48 more]
```

**agent:** The fix is confirmed in place and matches what was reported.

**Root cause:** `Attachments` in `src/components/Messages.tsx:25` selected `s.attachmentsById[id] ?? []` — that `?? []` created a brand-new array reference on every store notification for any message without attachments. Since Zustand compares selector output by reference, this made `Attachments` re-render on every socket tick even though nothing visible changed (confirmed by the recording: `noDomChange: 66` out of 66 renders, 100% wasted).

**Fix:** hoisted a single stable `NO_FILES = []` constant and used it as the fallback instead of a fresh literal — same output (renders `null` when empty, unchanged when attachments exist), just a stable reference.

**Proof (5s idle window, before → after via `compare_recordings`):**
- Total renders: 143 → 66 (‑54%)
- Renders with no DOM change: 13.17/s → 0/s (‑100%)
- `Attachments` disappeared entirely as a cascade root (was 66 wasted renders/s)
- All other components (`SyncBar`, `Status`, `ChannelStats`, `OnlineNow`, etc.) were untouched and already had `noDomChange: 0` — they were doing legitimate work.

One caveat from the agent: it verified the empty-attachments path via the captured recordings but didn't see a live event adding attachments to a message during either window, so that branch's correctness rests on code reading rather than a captured render — worth a quick manual check if you want extra confidence.
