# two-bugs-rec, with the plugin, run 1

fixed (waste 0); checks 6 of 6; $0.34, 117 s, 21 turns

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

> ## What was wasting renders
> 
> Two components were re-rendering on every background tick of the chat feed, even when nothing they displayed actually changed:
> 
> **1. `Unread` badge** (`src/components/Header.tsx`) — subscribed to `selectWorkspace`, which returns the *entire* `workspace` object. The feed worker mutates `workspace.lastEventAt` on every tick (new object reference each time), so `Unread` re-rendered every tick even though `workspace.unread` itself only changes when a message actually arrives.
> - 34 renders in the recording, **33 of them changed nothing on screen**.
> - Fix: switch to the already-defined-but-unused `selectUnread` selector (`s => s.workspace.unread`), a primitive the store can properly bail on when unchanged.
> 
> **2. `TimeAgo`** (`src/components/TimeAgo.tsx`, used per message) — subscribed to the raw `clockStore.now`, which ticks every second, so every message's `TimeAgo` re-rendered every second regardless of whether its displayed text ("a minute ago" etc.) actually changed.
> - 15 renders in the recording, **all 15 changed nothing** (messages were minutes old, so the text stays the same across many ticks).
> - Fix: select the *computed label* (`timeAgo(s.now, sentAt)`) instead of the raw timestamp, so the store only triggers a re-render when the displayed string actually changes.
> 
> **Not touched:** `SyncBar` also re-renders on every tick, but its own code comment says it's meant to ("the live bar moves with every event from the socket") and its width genuinely changes every render (0 wasted renders) — that's a real animation, not a bug, so I left it as is.
> 
> ## Before / after (same recorded scenario, replayed)
> 
> | | before | after |
> |---|---|---|
> | total renders | 126 | 66 (**-48%**) |
> | renders that changed nothing on screen | 48 | 0 (**-100%**) |
> | renders per commit | 2.6 | 1.5 |
> | `Unread` renders | 34 (33 wasted) | 0 (gone as a cascade root — no longer subscribes to anything that changes for nothing) |
> | `TimeAgo` renders | 15 (15 wasted) | 0 (gone) |
> 
> Nothing else in the page showed wasted renders (`wastingAfter` is empty), and the DOM output is identical — the badge and timestamps show the same text at the same times as before, just without the extra work.

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

**agent:** This task matches the react-perf-recorder skill exactly — diagnosing unnecessary re-renders and proving a fix with before/after numbers. Let me invoke it.

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

A dev-only Vite plugin that records React re-renders from the page. Re … [4093 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-082947-app-panel-4d90
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:39453/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**agent:** I have the recording id. Let me read its summary.

**→ rpr:get_recording**
```
{"id":"20260928-082947-app-panel-4d90"}
```

**←**
```
{"id":"20260928-082947-app-panel-4d90","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-082947-app-panel-4d90","summary":{"id":"20260928-082947-app-panel-4d90","status":"done","createdAt":"2026-09-28T08:29:52.221Z","source":"panel","url":"http://localhost:39453/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":49,"commitsPerSec":9.77,"commitsInScope":49,"renders":126,"rendersPerScopeCommit":2.6,"rendersFromOutside":0,"rendersWithoutDom":48,"domTextChanges":41,"rendersPerTextChange":3.1},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":33,"renderMsPerHit":0.05,"reasons":["34× external store #2 [useChatStore] selectWorkspace · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Header.tsx:11 const workspace = useChatStore … [6380 more]
```

**agent:** I found the recording. Let me read the relevant source files to understand the render causes.

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

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/reading-a-recording.md"}
```

**←**
```
1	# Reading a recording
2	
3	In the order a diagnosis needs: who started the cascade, why it rendered, how it reached the component, and how much
4	of it was wasted. What scheduled the commit: `causes-and-actions.md`.
5	
6	## Roots
7	
8	A **cascade root** is a component that rendered while its parent did not — where a render started. `hits` is how
9	many commits it started, `cascade` the renders it pulled, `perHit` the renders per commit, `instances` how many
10	copies fired at once. `outsideRoots` are roots above the recorded area that reached into it.
11	
12	`noDomChange` (per root) and `rendersWithoutDom` (in totals) count renders after which the DOM did not change —
13	waste with no argument attached. `ownDomUnchanged`, when a root has it, counts its hits that changed none of the elements it
14	renders itself nor anything a child drew from a value the root passed it in props: what changed was in children that
15	render on their own anyway, so the root's own render was spent handing them what they had. `mounts` other than zero on a page that only changes text means remounting: a
16	component declared inside a render, or an unstable `key`.
17	
18	A `warnings` line starting `React warned:` is React's own dev warning, caught since the page loaded: a list without
19	keys, two children with one key, a component setting another's state while it renders, an update loop. It names the
20	component; ", before the recording" means React printed it at load and prints it once, so it ho … [3287 more]
```

**→ rpr:get_recording**
```
{"id":"20260928-082947-app-panel-4d90","section":"components","top":30}
```

**←**
```
{"id":"20260928-082947-app-panel-4d90","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-082947-app-panel-4d90","components":{"total":14,"offset":0,"items":[{"name":"SyncBar","renders":34,"withoutDom":0,"byParent":0,"reasons":[{"i":0,"n":34,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"Unread","renders":34,"withoutDom":33,"byParent":0,"reasons":[{"i":1,"n":34,"reason":"external store #2 [useChatStore] selectWorkspace"}]},{"name":"TimeAgo","renders":15,"mounts":1,"withoutDom":15,"byParent":0,"reasons":[{"i":5,"n":15,"reason":"external store #2 [clockStore] (s)=>s.now"}]},{"name":"ChannelStats","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":3,"n":10,"reason":"external store #3"}]},{"name":"OnlineNow","renders":10,"withoutDom":0,"byParent":0,"reasons":[{"i":3,"n":10,"reason":"external store #3"}]},{"name":"Status","renders":9,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":4,"n":7,"reason":"external store #3 [useChatStore] outer"},{"i":7,"n":3,"reason":"external store #8 [useChatStore] selectSeen"}]},{"name":"TypingLine","renders":9,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":9,"reason":"external store #2 [presenceStore] (s)=>s.typing"}]},{"name":"MessageList","renders":1,"withoutDom":0,"byParent":0,"reasons":[{"i":6,"n":1,"reason":"external store #2 [useChatStore] selectMessageIds"}]},{"name":"MessageRow","renders":0,"mounts":1,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"Attachments", … [807 more]
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

**agent:** `selectWorkspace` is only used in `Unread`, and `selectUnread` already exists but is unused — this looks like the intended selector was swapped by mistake. Now let me apply both fixes.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"import { selectWorkspace } from '../store/selectors';\nimport { ChannelTopic } from './ChannelTopic';\nimport { TimezoneBadge } from './Settings';\nimport { TypingBadge } from './TypingBadge';\nimport Workspace from './Workspace';\n\nconst Unread = () => {\n  const workspace = useChatStore(selectWorkspace);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {workspace.unread} unread\n    </span>\n  );\n};","new_string":"import { selectUnread } from '../store/select … [369 more]
```

**←**
```
The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/TimeAgo.tsx","old_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const now = useStore(clockStore, (s) => s.now);\n  return <small data-testid=\"time-ago\">{timeAgo(now, sentAt)}</small>;\n};","new_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));\n  return <small data-testid=\"time-ago\">{label}</small>;\n};"}
```

**←**
```
The file src/components/TimeAgo.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let me prove the fix by replaying the same recorded scenario and comparing.

**→ rpr:record_page**
```
{"replay":"20260928-082947-app-panel-4d90","label":"after"}
```

**←**
```
{"id":"20260928-083117-app-record-5105","url":"http://localhost:39453/?tick=150","requested":"http://localhost:39453/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-082947-app-panel-4d90 has no actions: recorded the page as it is for 5017 ms instead"]}
```

**agent:** Rendered waste dropped to zero. Let me get the formal comparison for precise numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-082947-app-panel-4d90","after":"20260928-083117-app-record-5105"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-082947-app-panel-4d90","durationMs":5017},"after":{"id":"20260928-083117-app-record-5105","durationMs":5034},"totals":{"commits":"49 → 43 (-12%)","renders":"126 → 66 (-48%)","commitsPerSec":"9.77 → 8.54 (-13%)","rendersPerSec":"25.11 → 13.11 (-48%)","rendersPerCommit":"2.6 → 1.5 (-42%)","rendersWithoutDomPerSec":"9.57 → 0 (-100%)","rendersPerTextChange":"3.1 → 2 (-35%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.78 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.78 → 0 (-100%)"},{"root":"TimeAgo","source":"src/components/Messages.tsx:39","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"gone","hitsPerSec":"1 → –","perHit":"3 → –","instances":"3 → –","cascadePerSec":"2.99 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.79 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed … [2493 more]
```

**agent:** ## What was wasting renders

Two components were re-rendering on every background tick of the chat feed, even when nothing they displayed actually changed:

**1. `Unread` badge** (`src/components/Header.tsx`) — subscribed to `selectWorkspace`, which returns the *entire* `workspace` object. The feed worker mutates `workspace.lastEventAt` on every tick (new object reference each time), so `Unread` re-rendered every tick even though `workspace.unread` itself only changes when a message actually arrives.
- 34 renders in the recording, **33 of them changed nothing on screen**.
- Fix: switch to the already-defined-but-unused `selectUnread` selector (`s => s.workspace.unread`), a primitive the store can properly bail on when unchanged.

**2. `TimeAgo`** (`src/components/TimeAgo.tsx`, used per message) — subscribed to the raw `clockStore.now`, which ticks every second, so every message's `TimeAgo` re-rendered every second regardless of whether its displayed text ("a minute ago" etc.) actually changed.
- 15 renders in the recording, **all 15 changed nothing** (messages were minutes old, so the text stays the same across many ticks).
- Fix: select the *computed label* (`timeAgo(s.now, sentAt)`) instead of the raw timestamp, so the store only triggers a re-render when the displayed string actually changes.

**Not touched:** `SyncBar` also re-renders on every tick, but its own code comment says it's meant to ("the live bar moves with every event from the socket") and its width genuinely changes every render (0 wasted renders) — that's a real animation, not a bug, so I left it as is.

## Before / after (same recorded scenario, replayed)

| | before | after |
|---|---|---|
| total renders | 126 | 66 (**-48%**) |
| renders that changed nothing on screen | 48 | 0 (**-100%**) |
| renders per commit | 2.6 | 1.5 |
| `Unread` renders | 34 (33 wasted) | 0 (gone as a cascade root — no longer subscribes to anything that changes for nothing) |
| `TimeAgo` renders | 15 (15 wasted) | 0 (gone) |

Nothing else in the page showed wasted renders (`wastingAfter` is empty), and the DOM output is identical — the badge and timestamps show the same text at the same times as before, just without the extra work.
