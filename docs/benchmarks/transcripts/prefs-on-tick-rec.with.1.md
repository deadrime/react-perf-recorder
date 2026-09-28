# prefs-on-tick-rec, with the plugin, run 1

fixed (waste 0); checks 4 of 5, failed: fixed; $0.42, 224 s, 26 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the chat page keeps rendering while nobody touches it, and the profiler shows it on every socket event.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> ## Root cause
> 
> Every socket tick, `tick()` in `src/store/chat.ts` called `completePrefs(s)` — which did `{ ...DEFAULT_PREFS, ...s.prefs }` — and spread the result into the new state unconditionally, even though `prefs` never actually changes on a tick. That allocated a brand-new `prefs` object on every single tick (33 times in 5s), so `PrefsLine`'s `useChatStore((s) => s.prefs)` selector saw a new reference and re-rendered — producing zero DOM change every time. The recording flagged this exactly: `PrefsLine … SAME-CONTENT … noDomChange: 33/33 hits`.
> 
> Everything else that rendered (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) changed real DOM on every hit (`noDomChange: 0`), so those are legitimate.
> 
> ## Fix
> 
> `src/store/chat.ts:67-74` — `completePrefs` now returns the same `prefs` object reference when the merge didn't actually change any field, only allocating a new one when a field was genuinely missing/different.
> 
> ## Proof (same 5s idle scenario, before/after)
> 
> | metric | before | after |
> |---|---|---|
> | renders/sec | 19.74 | 13.17 (-33%) |
> | renders without DOM change/sec | 6.58 | **0** (-100%) |
> | renders per commit | 2.3 | 1.5 |
> | `PrefsLine` renders/sec | 6.58 | **0 (gone)** |
> | commits/sec (real updates) | 8.58 | 8.58 (unchanged) |
> | every other root's hits/sec | unchanged | unchanged |
> 
> Commit rate and every other component's render count are identical before and after — only the wasted `PrefsLine` re-renders were eliminated. The page shows nothing different.

## What it changed

```
diff -ruN a/src/store/chat.ts b/src/store/chat.ts
--- a/src/store/chat.ts
+++ b/src/store/chat.ts
@@ -64,8 +64,14 @@
 const withMessage = (all: Record<string, Message>, message: Message) =>
   Object.fromEntries([...Object.entries(all), [message.id, message] as const].slice(-MAX_MESSAGES));
 
-/** Prefs saved by an older build can miss a field: every write keeps them complete. */
-const completePrefs = (s: Chat): Partial<Chat> => ({ prefs: { ...DEFAULT_PREFS, ...s.prefs } });
+/** Prefs saved by an older build can miss a field: every write keeps them complete.
+ *  Kept referentially stable when nothing actually changed, so selecting `prefs` doesn't
+ *  re-render on every unrelated tick. */
+const completePrefs = (s: Chat): Partial<Chat> => {
+  const merged = { ...DEFAULT_PREFS, ...s.prefs };
+  const changed = (Object.keys(merged) as (keyof Prefs)[]).some((key) => merged[key] !== s.prefs[key]);
+  return { prefs: changed ? merged : s.prefs };
+};
 
 const feed: Slice<FeedSlice> = (set) => ({
   reactionsById: { m1: 2, m2: 0, m3: 5 },
```

## The steps

**agent:** This matches the react-perf-recorder skill's exact purpose — let me use it to analyze the recording and diagnose the re-render issue.

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

A dev-only Vite plugin that records React re-renders from the page. Re … [3506 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-235437-app-panel-9c6d
2	
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/reading-a-recording.md"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/causes-and-actions.md"}
```

**✗ error**
```
Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

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
{"id":"20260927-235437-app-panel-9c6d"}
```

**←**
```
{"id":"20260927-235437-app-panel-9c6d","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235437-app-panel-9c6d","summary":{"id":"20260927-235437-app-panel-9c6d","status":"done","createdAt":"2026-09-27T23:54:42.167Z","source":"panel","url":"http://localhost:39431/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.78,"commitsInScope":44,"renders":112,"rendersPerScopeCommit":2.5,"rendersFromOutside":0,"rendersWithoutDom":34,"domTextChanges":41,"rendersPerTextChange":2.7},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.12,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"PrefsLine","source":"src/components/ChatView.tsx:33","path":"ChatView < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":34,"renderMsPerHit":0.05,"reasons":["34× external store #2 SAME-CONTENT [useChatStore] (s)=>s.prefs · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/PrefsLine.tsx:4 const prefs … [6401 more]
```

**→ Read**
```
{"file_path":"src/components/PrefsLine.tsx"}
```

**←**
```
1	import { useChatStore } from '../store/chat';
2	
3	export const PrefsLine = () => {
4	  const prefs = useChatStore((s) => s.prefs);
5	  return (
6	    <p className="side-line" data-testid="prefs">
7	      {prefs.timeFormat} clock · {prefs.compact ? 'compact' : 'comfortable'} rows
8	    </p>
9	  );
10	};
11	
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

**→ Grep**
```
{"pattern":"prefs","path":"src/store","output_mode":"content","-n":true}
```

**←**
```
src/store/chat.ts:43:  prefs: Prefs;
src/store/chat.ts:68:const completePrefs = (s: Chat): Partial<Chat> => ({ prefs: { ...DEFAULT_PREFS, ...s.prefs } });
src/store/chat.ts:97:  prefs: DEFAULT_PREFS,
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
49	  /**  … [3709 more]
```

**→ Grep**
```
{"pattern":"completePrefs|persist|hydrat","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/store/chat.ts:68:const completePrefs = (s: Chat): Partial<Chat> => ({ prefs: { ...DEFAULT_PREFS, ...s.prefs } });
src/store/chat.ts:88:        return { ...next, ...completePrefs(s) };
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:39431/?tick=150
2	
```

**→ Grep**
```
{"pattern":"data-testid","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/components/TimeAgo.tsx:6:  return <small data-testid="time-ago">{label}</small>;
src/components/ChannelTopic.tsx:9:    <span className="topic" data-testid="topic">
src/components/ChannelStats.tsx:11:  <ul className="members" data-testid="members">
src/components/ChannelStats.tsx:29:      <p className="side-line" data-testid="stats">
src/components/Header.tsx:13:    <span className="badge" data-testid="unread">
src/components/Header.tsx:22:    <span className="badge muted" data-testid="draft">
src/components/Header.tsx:29:  <header className="head" data-testid="header">
src/components/WebhookForm.tsx:6:    <form className="side-form" data-testid="webhook-form" onSubmit={(e) => e.preventDefault()}>
src/components/WebhookForm.tsx:7:      <input name="name" data-testid="hook-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="webhook name" />
src/components/WebhookForm.tsx:8:      <input name="secret" data-testid="hook-secret" type="password" placeholder="signing secret" />
src/components/PrefsLine.tsx:6:    <p className="side-line" data-testid="prefs">
src/components/ActivityLog.tsx:5:  <ul className="activity" data-testid="activity">
src/components/TypingLine.tsx:13:    <small className="connection" data-testid="typing">
src/components/MessageCount.tsx:6:    <p className="side-line" data-testid="count">
src/components/Messages.tsx:34:    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
src/components/Messages.tsx:45:   … [1495 more]
```

**→ rpr:record_page**
```
{"url":"http://localhost:39431/?tick=150","setup":"async (page) => { await page.locator('[data-testid=\\\"messages\\\"] li').first().waitFor(); }","ms":5000,"label":"before"}
```

**✗ error**
```
locator.waitFor: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('[data-testid="messages"] li').first() to be visible[22m
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

**→ rpr:record_page**
```
{"url":"http://localhost:39431/?tick=150","ms":3000,"fromLoad":true}
```

**←**
```
{"id":"20260927-235649-app-record-5317","url":"http://localhost:39431/?tick=150&rpr=rec","requested":"http://localhost:39431/?tick=150","durationSec":3.3,"commits":29,"renders":70,"rendersWithoutDom":27,"rendersPerCommit":2.4,"topRoot":"SyncBar ×20","warnings":[]}
```

**→ rpr:record_page**
```
{"url":"http://localhost:39431/?tick=150","setup":"async (page) => { await page.locator('[data-testid=\\\"message-m1\\\"]').waitFor(); }","ms":5000,"label":"before"}
```

**✗ error**
```
locator.waitFor: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('[data-testid="message-m1"]') to be visible[22m
```

**→ rpr:record_page**
```
{"setup":"async (page) => { await page.goto('http://localhost:39431/?tick=150'); await page.locator('[data-testid=\\\"message-m1\\\"]').waitFor(); }","ms":5000,"label":"before"}
```

**←**
```
{"id":"20260927-235735-app-record-07c1","url":"http://localhost:39431/?tick=150","requested":"http://localhost:39431/?tick=150","durationSec":5,"commits":43,"renders":99,"rendersWithoutDom":33,"rendersPerCommit":2.3,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** Good, that worked. Now let's confirm this baseline shows the same PrefsLine issue, then apply the fix.

**→ rpr:get_recording**
```
{"id":"20260927-235735-app-record-07c1","section":"summary"}
```

**←**
```
{"id":"20260927-235735-app-record-07c1","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-235735-app-record-07c1","summary":{"id":"20260927-235735-app-record-07c1","status":"done","createdAt":"2026-09-27T23:57:41.005Z","label":"before","source":"script:record","url":"http://localhost:39431/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":43,"commitsPerSec":8.58,"commitsInScope":43,"renders":99,"rendersPerScopeCommit":2.3,"rendersFromOutside":0,"rendersWithoutDom":33,"domTextChanges":33,"rendersPerTextChange":3},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.58,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.14,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["33× zustand:feed/tick","33× core:message Worker"],"lanes":"Sync:33"},{"root":"PrefsLine","source":"src/components/ChatView.tsx:33","path":"ChatView < SettingsBySync < Layout","hits":33,"hitsPerSec":6.58,"instances":1,"perHit":1,"noDomChange":33,"renderMsPerHit":0.03,"reasons":["33× external store #2 SAME-CONTENT [useChatStore] (s)=>s.prefs · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/PrefsLine.tsx:4 const prefs  … [4224 more]
```

**agent:** Confirmed: PrefsLine renders 33/33 times with zero DOM changes (`noDomChange:33`), tagged `SAME-CONTENT`. Now applying the fix in `chat.ts`.

**→ Edit**
```
{"replace_all":false,"file_path":"src/store/chat.ts","old_string":"/** Prefs saved by an older build can miss a field: every write keeps them complete. */\nconst completePrefs = (s: Chat): Partial<Chat> => ({ prefs: { ...DEFAULT_PREFS, ...s.prefs } });","new_string":"/** Prefs saved by an older build can miss a field: every write keeps them complete.\n *  Kept referentially stable when nothing actually changed, so selecting `prefs` doesn't\n *  re-render on every unrelated tick. */\nconst completePrefs = (s: Chat): Partial<Chat> => {\n  const merged = { ...DEFA … [184 more]
```

**←**
```
The file src/store/chat.ts has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now recording the "after" scenario with the same setup/duration for a fair comparison.

**→ rpr:record_page**
```
{"setup":"async (page) => { await page.goto('http://localhost:39431/?tick=150'); await page.locator('[data-testid=\\\"message-m1\\\"]').waitFor(); }","ms":5000,"label":"after"}
```

**←**
```
{"id":"20260927-235753-app-record-1762","url":"http://localhost:39431/?tick=150","requested":"http://localhost:39431/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","warnings":[]}
```

**agent:** `rendersWithoutDom` dropped from 33 to 0. Let's get the full comparison.

**→ rpr:compare_recordings**
```
{"before":"20260927-235735-app-record-07c1","after":"20260927-235753-app-record-1762"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260927-235735-app-record-07c1","durationMs":5014},"after":{"id":"20260927-235753-app-record-1762","durationMs":5013},"totals":{"commits":"43 → 43 (0%)","renders":"99 → 66 (-33%)","commitsPerSec":"8.58 → 8.58 (0%)","rendersPerSec":"19.74 → 13.17 (-33%)","rendersPerCommit":"2.3 → 1.5 (-35%)","rendersWithoutDomPerSec":"6.58 → 0 (-100%)","rendersPerTextChange":"3 → 2 (-33%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"PrefsLine","source":"src/components/ChatView.tsx:33","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.58 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.58 → 0 (-100%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"6.58 → 6.58 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"6.58 → 6.58 (0%)"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 1.99 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.99 → 1.99 (0%)"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"1.99 → 1.99 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.99 → 1.99 (0%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"change … [1317 more]
```

**agent:** The comparison confirms the fix: `PrefsLine` is completely gone from the cascade (was 6.58 renders/sec, now 0), every other root is unchanged (same hits, same per-hit cost — nothing else shifted), and commits/sec stayed identical (8.58 → 8.58), so the page's actual behavior didn't change, only the wasted render did.

**→ Read**
```
{"file_path":"src/store/chat.ts","offset":60,"limit":30}
```

**←**
```
60	/** Only the latest messages are kept. */
61	export const MAX_MESSAGES = 24;
62	let lastId = 3; // after the three the chat starts with
63	const newId = () => `m${++lastId}`;
64	const withMessage = (all: Record<string, Message>, message: Message) =>
65	  Object.fromEntries([...Object.entries(all), [message.id, message] as const].slice(-MAX_MESSAGES));
66	
67	/** Prefs saved by an older build can miss a field: every write keeps them complete.
68	 *  Kept referentially stable when nothing actually changed, so selecting `prefs` doesn't
69	 *  re-render on every unrelated tick. */
70	const completePrefs = (s: Chat): Partial<Chat> => {
71	  const merged = { ...DEFAULT_PREFS, ...s.prefs };
72	  const changed = (Object.keys(merged) as (keyof Prefs)[]).some((key) => merged[key] !== s.prefs[key]);
73	  return { prefs: changed ? merged : s.prefs };
74	};
75	
76	const feed: Slice<FeedSlice> = (set) => ({
77	  reactionsById: { m1: 2, m2: 0, m3: 5 },
78	  tick: (step) =>
79	    set(
80	      (s) => {
81	        const next: Partial<Chat> = { workspace: { ...s.workspace, lastEventAt: step } };
82	        // A reaction lands on one message at a time, not on all of them at once.
83	        if (step % REACTION_EVERY === 0) {
84	          const ids = Object.keys(s.messageById);
85	          const id = ids[Math.floor(step / REACTION_EVERY) % ids.length];
86	          next.reactionsById = { ...s.reactionsById, [id]: (s.reactionsById[id] ?? 0) + 1 };
87	        }
88	        if (step % ARRIVAL_E … [46 more]
```

**agent:** ## Root cause

Every socket tick, `tick()` in `src/store/chat.ts` called `completePrefs(s)` — which did `{ ...DEFAULT_PREFS, ...s.prefs }` — and spread the result into the new state unconditionally, even though `prefs` never actually changes on a tick. That allocated a brand-new `prefs` object on every single tick (33 times in 5s), so `PrefsLine`'s `useChatStore((s) => s.prefs)` selector saw a new reference and re-rendered — producing zero DOM change every time. The recording flagged this exactly: `PrefsLine … SAME-CONTENT … noDomChange: 33/33 hits`.

Everything else that rendered (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`) changed real DOM on every hit (`noDomChange: 0`), so those are legitimate.

## Fix

`src/store/chat.ts:67-74` — `completePrefs` now returns the same `prefs` object reference when the merge didn't actually change any field, only allocating a new one when a field was genuinely missing/different.

## Proof (same 5s idle scenario, before/after)

| metric | before | after |
|---|---|---|
| renders/sec | 19.74 | 13.17 (-33%) |
| renders without DOM change/sec | 6.58 | **0** (-100%) |
| renders per commit | 2.3 | 1.5 |
| `PrefsLine` renders/sec | 6.58 | **0 (gone)** |
| commits/sec (real updates) | 8.58 | 8.58 (unchanged) |
| every other root's hits/sec | unchanged | unchanged |

Commit rate and every other component's render count are identical before and after — only the wasted `PrefsLine` re-renders were eliminated. The page shows nothing different.
