# new-array-selector-rec, with the plugin, run 1

fixed (waste 0); checks 5 of 5; $0.41, 161 s, 29 turns

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

> ## What was wrong
> 
> `MessageList` (`src/components/Messages.tsx`) subscribed to the chat store with:
> 
> ```tsx
> const ids = useChatStore((s) => Object.keys(s.messageById));
> ```
> 
> `Object.keys(...)` allocates a brand-new array every time the selector runs. Zustand compares selector output by reference, so even though `messageById` itself only changes when a message is actually sent/removed/arrives, the *array wrapping it* looked new on every store update — including the ones that only touch `reactionsById` or `workspace.lastEventAt` (i.e. every reaction, read-receipt, and worker tick). That made `MessageList` a cascade root re-rendering ~7×/sec for no visible reason: the recording flagged it as `external store #2 (33 of them same content)`, with `ownDomUnchanged: 33/34` and `noDomChange: 27/34`.
> 
> ## Fix
> 
> Subscribe to the stable `messageById` object instead, and derive the id list with `useMemo` keyed on that reference, so it's only recomputed when the message set actually changes:
> 
> ```tsx
> const messageById = useChatStore((s) => s.messageById);
> const ids = useMemo(() => Object.keys(messageById), [messageById]);
> ```
> 
> No change to what's rendered — same ids, same order, same conditions for updates.
> 
> ## Before / after (same idle scenario, replayed)
> 
> | | before | after |
> |---|---|---|
> | total renders | 111 | 66 (**-41%**) |
> | renders/sec | 22.14 | 13.12 (**-41%**) |
> | renders that changed no DOM (per sec) | 5.39 | 0 (**-100%**) |
> | renders per commit | 2.5 | 1.5 (**-40%**) |
> | `MessageList` cascade | 6.78 hits/sec, 33/34 same-content | gone — no longer a cascade root |
> 
> `wastingAfter` (roots still rendering mostly for nothing) is now empty. The remaining renders (`SyncBar`, `TypingLine`, `Status`, `ChannelStats`, `OnlineNow`) all changed their own DOM on (nearly) every hit — they're doing real, visible work (live sync bar, typing indicator, reaction/read-receipt display), so I left them alone.

## What it changed

```
diff -ruN a/src/components/Messages.tsx b/src/components/Messages.tsx
--- a/src/components/Messages.tsx
+++ b/src/components/Messages.tsx
@@ -50,7 +50,8 @@
 });
 
 export const MessageList = () => {
-  const ids = useChatStore((s) => Object.keys(s.messageById));
+  const messageById = useChatStore((s) => s.messageById);
+  const ids = useMemo(() => Object.keys(messageById), [messageById]);
   return (
     <ul className="messages" data-testid="messages">
       {ids.map((id) => (
```

## The steps

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"recording id from ./recording.txt; investigate chat page re-rendering for nothing (reactions/read receipts arriving while idle), fix in ./src without changing rendered output, prove with before/after numbers"}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4172 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-002325-app-panel-7280
2	
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

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/causes-and-actions.md"}
```

**←**
```
1	# Causes, actions, plugins, traps
2	
3	## Causes
4	
5	What scheduled each commit, aimed at the components it actually updated:
6	
7	| Cause                                 | Means                                                                            |
8	| ------------------------------------- | -------------------------------------------------------------------------------- |
9	| `zustand:<action>`                    | a store write, with the keys it changed and a `SAME-CONTENT` mark                |
10	| `redux:<action type>`                 | a Redux action that changed the store, with the slices it changed                |
11	| `react-query:fetch → success <key>`   | a query's events, one cause per query and commit, on its subscribers' commit     |
12	| `core:input <event>`                  | the person's click, keystroke, scroll                                            |
13	| `core:message WebSocket` / `Worker`   | a frame arrived                                                                  |
14	| `core:timer setInterval <fn> @ src/…` | a timer, with the place it was started                                           |
15	| `core:navigation push`                | a navigation                                                                     |
16	| `core:effect @ src/hooks/useX.ts`     | a setState from an effect                                                        |
17	| `core:update <fn> @ src/…`            | a plain call in the app's code; `(<package>)`  … [1888 more]
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ rpr:get_recording**
```
{"id":"20260928-002325-app-panel-7280"}
```

**←**
```
{"id":"20260928-002325-app-panel-7280","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-002325-app-panel-7280","summary":{"id":"20260928-002325-app-panel-7280","status":"done","createdAt":"2026-09-28T00:23:30.950Z","source":"panel","url":"http://localhost:36341/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":111,"rendersPerScopeCommit":2.5,"rendersFromOutside":0,"rendersWithoutDom":27,"domTextChanges":41,"rendersPerTextChange":2.7},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.12,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"MessageList","source":"src/components/ChatPanel.tsx:27","path":"ChatPanel < ChatView < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":27,"ownDomUnchanged":33,"mounts":4,"renderMsPerHit":0.1,"reasons":["34× external store #2 (33 of them same content) [useChatStore] (s)=>Object.keys(s.messageById) · [zustand] useBoundStore › useStore › useSyncExternalStor … [5957 more]
```

**→ Read**
```
{"file_path":"src/components/Messages.tsx"}
```

**←**
```
1	import { memo, useMemo } from 'react';
2	import { memoize } from 'proxy-memoize';
3	import { messageInfo, selectSeen } from '../store/selectors';
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
39	          <TimeAgo sentAt={message … [950 more]
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
{"file_path":"src/components/ChatPanel.tsx"}
```

**←**
```
1	import { memo, useCallback } from 'react';
2	import { useSearchParams } from 'react-router-dom';
3	import { MessageList, PeopleList } from './Messages';
4	
5	export const useActiveTab = () => {
6	  const [params, setParams] = useSearchParams();
7	  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
8	  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);
9	  return [tab, select] as const;
10	};
11	
12	const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
13	  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
14	    {name}
15	  </button>
16	));
17	
18	export const ChatPanel = () => {
19	  const [tab, setTab] = useActiveTab();
20	  return (
21	    <section className="panel" data-testid="chat-panel">
22	      <div className="tabs" role="tablist">
23	        {['chat', 'people'].map((name) => (
24	          <Tab key={name} name={name} active={tab === name} onPick={setTab} />
25	        ))}
26	      </div>
27	      {tab === 'chat' ? <MessageList /> : <PeopleList />}
28	    </section>
29	  );
30	};
31	
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
{"pattern":"\"zustand\"","path":"package.json","output_mode":"content"}
```

**✗ error**
```
Path does not exist: package.json. Note: your current working directory is ..
```

**→ Glob**
```
{"pattern":"package.json"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"**/package.json"}
```

**←**
```
No files found
```

**→ Grep**
```
{"pattern":"\"version\"","path":"node_modules/zustand/package.json","output_mode":"content"}
```

**✗ error**
```
Permission to use Grep has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Glob**
```
{"pattern":"node_modules/zustand/react/shallow*"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"*"}
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
src/store/draft.ts
src/lib/members.ts
src/lib/channel.ts
index.html
src/components/Messages.tsx
src/store/selectors.ts
recording.txt
recording.json
dev-url.txt
```

**→ Glob**
```
{"pattern":"node_modules/zustand/*"}
```

**←**
```
No files found
```

**→ Read**
```
{"file_path":"src/store/selectors.ts"}
```

**←**
```
1	import type { Chat } from './chat';
2	
3	export const selectWorkspace = (s: Chat) => s.workspace;
4	export const selectUnread = (s: Chat) => s.workspace.unread;
5	
6	export const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });
7	
8	export const selectSeen = (s: Chat) => s.workspace.unread < 13;
9	
```

**→ Grep**
```
{"pattern":"shallow","path":"src","output_mode":"files_with_matches"}
```

**←**
```
No files found
```

**→ Read**
```
{"file_path":"node_modules/zustand/package.json"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Glob**
```
{"pattern":"**/*.lock*"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"**/vite.config.*"}
```

**←**
```
No files found
```

**agent:** Found it: `MessageList` (src/components/Messages.tsx:52-61) re-renders on almost every store tick even though the message list itself is unchanged.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Messages.tsx","old_string":"export const MessageList = () => {\n  const ids = useChatStore((s) => Object.keys(s.messageById));\n  return (","new_string":"export const MessageList = () => {\n  const messageById = useChatStore((s) => s.messageById);\n  const ids = useMemo(() => Object.keys(messageById), [messageById]);\n  return ("}
```

**←**
```
The file src/components/Messages.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/measuring-a-fix.md"}
```

**←**
````
1	# Measuring a fix
2	
3	Two recordings of one scenario — the code as it was, and the change — then `compare_recordings`. Do it when the cause
4	is a guess or numbers were asked for; a recording that names the root, reason and `file:line` is an answer already.
5	
6	## Route
7	
8	1. The recording with the problem — the person's, or `record_page`. Keep its id.
9	2. The change, in a git worktree when there is git (below); otherwise in place, and put back afterwards.
10	3. The same scenario on the change — `compare_recordings`' description says how to record it.
11	4. `compare_recordings` with `before: <id>`, `after: <new id>`.
12	5. A change that is not kept leaves nothing behind: `git worktree remove`, or the file as it was.
13	
14	## Worktree
15	
16	The working tree may hold someone else's changes; do not edit it for a measurement.
17	
18	```sh
19	git worktree add --detach ../<app>-fix && cd ../<app>-fix && npm ci
20	REACT_PERF_RECORDER_DIR=<abs path of the first checkout>/.agent-artifacts/perf-recorder npm run dev -- --port <other port>
21	```
22	
23	- `--detach`: no branch is made, and none is switched to.
24	- The worktree is the last commit, without uncommitted changes. When `git status` shows changes to files the page
25	  uses, record "before" in the worktree as well, before editing, so the sides differ by the fix alone.
26	- The variable puts both servers' sessions in the folder the MCP server reads; an `outDir` in the project's config
27	  overrides it — then set the s … [1124 more]
````

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page","max_results":3}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
```

**agent:** The original recording had no user actions (page left idle), so I can replay it directly against the now-fixed dev server.

**→ rpr:record_page**
```
{"replay":"20260928-002325-app-panel-7280","label":"after"}
```

**←**
```
{"id":"20260928-002533-app-record-2c9b","url":"http://localhost:36341/?tick=150","requested":"http://localhost:36341/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-002325-app-panel-7280 has no actions: recorded the page as it is for 5013 ms instead"]}
```

**agent:** No `wasting` roots left, and `rendersWithoutDom` dropped to 0. Let me get the full comparison numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-002325-app-panel-7280","after":"20260928-002533-app-record-2c9b"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-002325-app-panel-7280","durationMs":5013},"after":{"id":"20260928-002533-app-record-2c9b","durationMs":5031},"totals":{"commits":"44 → 43 (-2%)","renders":"111 → 66 (-41%)","commitsPerSec":"8.78 → 8.55 (-3%)","rendersPerSec":"22.14 → 13.12 (-41%)","rendersPerCommit":"2.5 → 1.5 (-40%)","rendersWithoutDomPerSec":"5.39 → 0 (-100%)","rendersPerTextChange":"2.7 → 2 (-26%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"MessageList","source":"src/components/ChatPanel.tsx:27","path":"ChatPanel < ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.78 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.78 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layo … [2097 more]
```

**agent:** ## What was wrong

`MessageList` (`src/components/Messages.tsx`) subscribed to the chat store with:

```tsx
const ids = useChatStore((s) => Object.keys(s.messageById));
```

`Object.keys(...)` allocates a brand-new array every time the selector runs. Zustand compares selector output by reference, so even though `messageById` itself only changes when a message is actually sent/removed/arrives, the *array wrapping it* looked new on every store update — including the ones that only touch `reactionsById` or `workspace.lastEventAt` (i.e. every reaction, read-receipt, and worker tick). That made `MessageList` a cascade root re-rendering ~7×/sec for no visible reason: the recording flagged it as `external store #2 (33 of them same content)`, with `ownDomUnchanged: 33/34` and `noDomChange: 27/34`.

## Fix

Subscribe to the stable `messageById` object instead, and derive the id list with `useMemo` keyed on that reference, so it's only recomputed when the message set actually changes:

```tsx
const messageById = useChatStore((s) => s.messageById);
const ids = useMemo(() => Object.keys(messageById), [messageById]);
```

No change to what's rendered — same ids, same order, same conditions for updates.

## Before / after (same idle scenario, replayed)

| | before | after |
|---|---|---|
| total renders | 111 | 66 (**-41%**) |
| renders/sec | 22.14 | 13.12 (**-41%**) |
| renders that changed no DOM (per sec) | 5.39 | 0 (**-100%**) |
| renders per commit | 2.5 | 1.5 (**-40%**) |
| `MessageList` cascade | 6.78 hits/sec, 33/34 same-content | gone — no longer a cascade root |

`wastingAfter` (roots still rendering mostly for nothing) is now empty. The remaining renders (`SyncBar`, `TypingLine`, `Status`, `ChannelStats`, `OnlineNow`) all changed their own DOM on (nearly) every hit — they're doing real, visible work (live sync bar, typing indicator, reaction/read-receipt display), so I left them alone.
