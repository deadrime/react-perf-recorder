# memo-cache-slot-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.46, 169 s, 27 turns

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

> ## Root cause
> 
> The chat page looked busy because `Status` (the ❤ reactions / read-receipt badge in `src/components/Messages.tsx:37`) was re-rendering **every tick**, for **all 3 visible messages**, even on ticks that touched a completely different message.
> 
> The cause was in `src/store/selectors.ts:10`:
> 
> ```ts
> export const selectMessageInfo = memoizeWithArgs(messageInfo);
> ```
> 
> `memoizeWithArgs` caches by argument set, but with no `size` given it defaults to caching **one** argument set. Three `Status` rows call it with three different `id`s every tick, so each call evicted the previous row's cache entry before that row was read again — every row recomputed from scratch on every tick, producing a brand-new object each time (`messageInfo` spreads into a new `{...message, reactions}`). Since zustand's `useStore` compares selector output by reference, a new object every tick meant a re-render every tick, whether or not that row's reactions/content actually changed (confirmed by the recording: 95 of 102 renders had identical content).
> 
> ## Fix
> 
> `src/store/selectors.ts` — size the cache to the number of rows that can actually be mounted at once (`MAX_MESSAGES`, already defined in `store/chat.ts`), so each id keeps its own cache slot instead of evicting the others:
> 
> ```ts
> export const selectMessageInfo = memoizeWithArgs(messageInfo, { size: MAX_MESSAGES });
> ```
> 
> No behavior, data, or DOM output changed — only when a *new* object is handed to React.
> 
> ## Before / after (react-perf-recorder, same 5s replay)
> 
> | Metric | Before | After | Δ |
> |---|---|---|---|
> | Total renders | 171 | 66 | −61% |
> | Renders that changed nothing on screen | 93 (18.55/s) | 0 | −100% |
> | `Status` renders/sec | 6.78 | 1.19 | −82% |
> | `Status` cascade renders/sec | 20.35 | 1.19 | −94% |
> | `selectMessageInfo` recomputes/sec | 40.89 | 1.19 | −97% |
> | Wasting roots remaining | Status | none | ✓ |
> 
> `Status` now only re-renders the one row whose reaction actually changed, and every one of those renders changes the DOM (`noDomChange: 0`). `SyncBar` still re-renders every tick, but that's legitimate — it visibly animates a sync bar (`noDomChange: 0` before and after), so it was left untouched.

## What it changed

```
diff -ruN a/src/store/selectors.ts b/src/store/selectors.ts
--- a/src/store/selectors.ts
+++ b/src/store/selectors.ts
@@ -1,5 +1,5 @@
 import { memoize, memoizeWithArgs } from 'proxy-memoize';
-import type { Chat } from './chat';
+import { MAX_MESSAGES, type Chat } from './chat';
 
 export const selectWorkspace = (s: Chat) => s.workspace;
 export const selectUnread = (s: Chat) => s.workspace.unread;
@@ -7,6 +7,9 @@
 export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));
 
 export const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });
-export const selectMessageInfo = memoizeWithArgs(messageInfo);
+// One row per message is mounted at once, each calling this with its own id; a cache of 1
+// (proxy-memoize's default) evicts between them every tick, forcing a fresh object even when
+// that row's own message/reaction is unchanged. Size it to the most that can be mounted.
+export const selectMessageInfo = memoizeWithArgs(messageInfo, { size: MAX_MESSAGES });
 
 export const selectSeen = (s: Chat) => s.workspace.unread < 13;
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-075815-app-panel-e0ba
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:33695/?tick=150
2	
```

**agent:** This matches the react-perf-recorder skill exactly — it'll read the existing recording, identify the cascade root causing unnecessary re-renders, fix it, and re-record to prove it with numbers. Let me invoke it.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Chat page stays busy with no user interaction — reactions and read receipts keep arriving after messages load and the page is left alone. Recording id: 20260928-075815-app-panel-e0ba (already recorded via the page's recorder panel). Dev server: http://localhost:33695/?tick=150. Find what re-renders for nothing and why, fix it in ./src without changing what the page shows, and prove it with before/after numbers. If nothing is wrong, say so and change nothing."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4568 more]

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**→ rpr:get_recording**
```
{"id":"20260928-075815-app-panel-e0ba"}
```

**←**
```
{"id":"20260928-075815-app-panel-e0ba","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075815-app-panel-e0ba","summary":{"id":"20260928-075815-app-panel-e0ba","status":"done","createdAt":"2026-09-28T07:58:20.512Z","source":"panel","url":"http://localhost:33695/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":171,"rendersPerScopeCommit":3.9,"rendersFromOutside":0,"rendersWithoutDom":93,"domTextChanges":41,"rendersPerTextChange":4.2},"topRoots":[{"root":"Status","source":"src/components/Messages.tsx:37","path":"MessageRow < MessageList < ChatPanel < ChatView","hits":34,"hitsPerSec":6.78,"instances":3,"perHit":3,"noDomChange":93,"renderMsPerHit":0.3,"reasons":["102× external store #2 (95 of them same content) [useChatStore] (s)=>selectMessageInfo(s, id) · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Messages.tsx:8 const info = useChatStore((s) => selectMessageInfo(s, id));","3× external store #7 [useChatStore] selectSeen · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Messages.tsx:9 const seen = useChatStore(selectSeen);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit": … [5970 more]
```

**→ Read**
```
{"file_path":"src/components/Messages.tsx"}
```

**←**
```
1	import { memo } from 'react';
2	import { selectMessageIds, selectMessageInfo, selectSeen } from '../store/selectors';
3	import { useChatStore } from '../store/chat';
4	import { useSettings } from './Settings';
5	import { TimeAgo } from './TimeAgo';
6	
7	const Status = memo(({ id }: { id: string }) => {
8	  const info = useChatStore((s) => selectMessageInfo(s, id));
9	  const seen = useChatStore(selectSeen);
10	  return (
11	    <span className="status" title={seen ? 'read by everyone' : 'sent'}>
12	      ♥ <b>{info.reactions}</b> {seen ? '✓✓' : '✓'}
13	    </span>
14	  );
15	});
16	
17	const NO_FILES: string[] = [];
18	
19	const Attachments = memo(({ id }: { id: string }) => {
20	  const files = useChatStore((s) => s.attachmentsById[id] ?? NO_FILES);
21	  return files.length ? <span className="files">📎 {files.join(', ')}</span> : null;
22	});
23	
24	export const MessageRow = memo(({ id }: { id: string }) => {
25	  const message = useChatStore((s) => s.messageById[id]);
26	  const { dense } = useSettings();
27	  return (
28	    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
29	      <span className="avatar">{message.from[0]}</span>
30	      <span className="body">
31	        <span className="who">
32	          {message.from}
33	          <TimeAgo sentAt={message.sentAt} />
34	        </span>
35	        <span className="text">{message.text}</span>
36	      </span>
37	      <Status id={id} />
38	      <Attachments id={id} />
39	      <butto … [753 more]
```

**→ Read**
```
{"file_path":"src/store/selectors.ts"}
```

**←**
```
1	import { memoize, memoizeWithArgs } from 'proxy-memoize';
2	import type { Chat } from './chat';
3	
4	export const selectWorkspace = (s: Chat) => s.workspace;
5	export const selectUnread = (s: Chat) => s.workspace.unread;
6	
7	export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));
8	
9	export const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });
10	export const selectMessageInfo = memoizeWithArgs(messageInfo);
11	
12	export const selectSeen = (s: Chat) => s.workspace.unread < 13;
13	
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
{"pattern":"memoizeWithArgs|maxSize|size","path":"node_modules/proxy-memoize","output_mode":"content","-n":true}
```

**✗ error**
```
Permission to use Grep has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Glob**
```
{"pattern":"**/proxy-memoize/dist/*.d.ts"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"**/proxy-memoize/**/*.js"}
```

**←**
```
No files found
```

**→ Read**
```
{"file_path":"package.json"}
```

**✗ error**
```
File does not exist. Note: your current working directory is ..
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
{"pattern":"**/package.json"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"node_modules/proxy-memoize/**"}
```

**✗ error**
```
Permission to use Glob has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ ToolSearch**
```
{"query":"web fetch","max_results":5}
```

**←**
```
No matching deferred tools found
```

**→ Read**
```
{"file_path":"node_modules/proxy-memoize/package.json"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Grep**
```
{"pattern":"shallow|useShallow","path":"src","output_mode":"content","-n":true}
```

**←**
```
No matches found
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

**→ Glob**
```
{"pattern":"**/.vite/**/proxy-memoize*"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"**/*.md"}
```

**←**
```
No files found
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/store/selectors.ts","old_string":"import { memoize, memoizeWithArgs } from 'proxy-memoize';\nimport type { Chat } from './chat';\n\nexport const selectWorkspace = (s: Chat) => s.workspace;\nexport const selectUnread = (s: Chat) => s.workspace.unread;\n\nexport const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));\n\nexport const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });\nexport const selectMessageInfo = memoizeWithArgs(messageInfo);","new_str … [809 more]
```

**←**
```
The file src/store/selectors.ts has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's verify the dev server didn't error, and record a fresh "before is already captured" — let's do an after recording replaying the same scenario and compare.

**→ rpr:record_page**
```
{"replay":"20260928-075815-app-panel-e0ba","label":"after"}
```

**←**
```
{"id":"20260928-080022-app-record-e1b4","url":"http://localhost:33695/?tick=150","requested":"http://localhost:33695/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-075815-app-panel-e0ba has no actions: recorded the page as it is for 5013 ms instead"]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-075815-app-panel-e0ba","after":"20260928-080022-app-record-e1b4"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-075815-app-panel-e0ba","durationMs":5013},"after":{"id":"20260928-080022-app-record-e1b4","durationMs":5027},"totals":{"commits":"44 → 43 (-2%)","renders":"171 → 66 (-61%)","commitsPerSec":"8.78 → 8.55 (-3%)","rendersPerSec":"34.11 → 13.13 (-62%)","rendersPerCommit":"3.9 → 1.5 (-62%)","rendersWithoutDomPerSec":"18.55 → 0 (-100%)","rendersPerTextChange":"4.2 → 2 (-52%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Status","source":"src/components/Messages.tsx:37","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"6.78 → 1.19 (-82%)","perHit":"3 → 1 (-67%)","instances":"3 → 1 (-67%)","cascadePerSec":"20.35 → 1.19 (-94%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.78 → 6.56 (-3%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.78 → 6.56 (-3%)"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync … [2183 more]
```

**→ rpr:get_recording**
```
{"id":"20260928-080022-app-record-e1b4","section":"roots"}
```

**←**
```
{"id":"20260928-080022-app-record-e1b4","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-080022-app-record-e1b4","roots":{"total":5,"offset":0,"items":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.56,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.15,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["33× zustand:feed/tick","33× core:message Worker"],"lanes":"Sync:33","hooks":{"2":{"type":"useSyncExternalStore","path":["useBoundStore","useStore","useSyncExternalStoreWithSelector","SyncExternalStore"],"library":"zustand","libraryAt":0,"site":"src/components/ChatView.tsx:44","code":"const at = useChatStore((s) => s.workspace.lastEventAt);"}}},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.22,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → success [\"topic\"]","10× react-query:fetch → success [\"presence\"]"],"lanes":"Sync:10","hooks":{"3":{"type":"useSyncExternalStore","pa … [2625 more]
```

**agent:** ## Root cause

The chat page looked busy because `Status` (the ❤ reactions / read-receipt badge in `src/components/Messages.tsx:37`) was re-rendering **every tick**, for **all 3 visible messages**, even on ticks that touched a completely different message.

The cause was in `src/store/selectors.ts:10`:

```ts
export const selectMessageInfo = memoizeWithArgs(messageInfo);
```

`memoizeWithArgs` caches by argument set, but with no `size` given it defaults to caching **one** argument set. Three `Status` rows call it with three different `id`s every tick, so each call evicted the previous row's cache entry before that row was read again — every row recomputed from scratch on every tick, producing a brand-new object each time (`messageInfo` spreads into a new `{...message, reactions}`). Since zustand's `useStore` compares selector output by reference, a new object every tick meant a re-render every tick, whether or not that row's reactions/content actually changed (confirmed by the recording: 95 of 102 renders had identical content).

## Fix

`src/store/selectors.ts` — size the cache to the number of rows that can actually be mounted at once (`MAX_MESSAGES`, already defined in `store/chat.ts`), so each id keeps its own cache slot instead of evicting the others:

```ts
export const selectMessageInfo = memoizeWithArgs(messageInfo, { size: MAX_MESSAGES });
```

No behavior, data, or DOM output changed — only when a *new* object is handed to React.

## Before / after (react-perf-recorder, same 5s replay)

| Metric | Before | After | Δ |
|---|---|---|---|
| Total renders | 171 | 66 | −61% |
| Renders that changed nothing on screen | 93 (18.55/s) | 0 | −100% |
| `Status` renders/sec | 6.78 | 1.19 | −82% |
| `Status` cascade renders/sec | 20.35 | 1.19 | −94% |
| `selectMessageInfo` recomputes/sec | 40.89 | 1.19 | −97% |
| Wasting roots remaining | Status | none | ✓ |

`Status` now only re-renders the one row whose reaction actually changed, and every one of those renders changes the DOM (`noDomChange: 0`). `SyncBar` still re-renders every tick, but that's legitimate — it visibly animates a sync bar (`noDomChange: 0` before and after), so it was left untouched.
