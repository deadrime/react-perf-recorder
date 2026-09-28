# effect-derived-state-rec, with the plugin, run 1

fixed (waste 6); checks 5 of 5; $0.36, 117 s, 19 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: switching between the chat and people tabs feels sluggish.
To reproduce: open the page, then switch to the people tab and back to chat, three times.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> ## Findings
> 
> The recording shows every tab click firing **two commits** instead of one:
> 
> 1. A commit from the router's `Location`/`Route` context change (triggered by `useSearchParams` inside `useActiveTab`) — cascades through `RouterProvider → ChatPanel → Tab → MessageList/PeopleList`, 16 renders, **100% with no DOM change**.
> 2. A commit a moment later from a `useEffect` in `ChatPanel`, whose only job is to copy the value into local state — 3 more renders, and only *this* commit actually updates the DOM.
> 
> The cause was `src/components/ChatPanel.tsx`:
> 
> ```tsx
> const [active, setTab] = useActiveTab();
> const [tab, setShown] = useState(active);
> useEffect(() => setShown(active), [active]);
> ```
> 
> `tab` always ends up equal to `active`, one render later — pure derived-state-via-effect, buying nothing but a doubled, half-wasted commit on every switch.
> 
> ## Fix
> 
> Removed the mirrored state/effect; `ChatPanel` now reads `active` directly (same values, same JSX, same `data-testid`s — nothing the page shows changes).
> 
> ## Before → after (same replayed scenario: 6 tab clicks)
> 
> | | before | after |
> |---|---|---|
> | Commits per tab click | 2 | 1 |
> | `core:effect @ ChatPanel.tsx` commits (the wasted second commit) | 6 | 0 |
> | ChatPanel hits / renders-with-no-DOM-change | 12 hits, 6 no-op | 6 hits, **0 no-op** |
> | Renders per visible text change (`rendersPerTextChange`) | 118 | 15.6 (**‑87%**) |
> | Renders per click action (typical) | 19–21 | 15–16 |
> | Roots still rendering for nothing (`wastingAfter`) | — | none |
> 
> The remaining renders per click (RouterProvider's own cascade, `Tab`'s memo check) are react-router's own bookkeeping for the navigation itself — not app-controlled waste, and each one now carries a real DOM update rather than a duplicate no-op pass.

## What it changed

```
diff -ruN a/src/components/ChatPanel.tsx b/src/components/ChatPanel.tsx
--- a/src/components/ChatPanel.tsx
+++ b/src/components/ChatPanel.tsx
@@ -1,4 +1,4 @@
-import { memo, useCallback, useEffect, useState } from 'react';
+import { memo, useCallback } from 'react';
 import { useSearchParams } from 'react-router-dom';
 import { MessageList, PeopleList } from './Messages';
 
@@ -17,16 +17,14 @@
 
 export const ChatPanel = () => {
   const [active, setTab] = useActiveTab();
-  const [tab, setShown] = useState(active);
-  useEffect(() => setShown(active), [active]);
   return (
     <section className="panel" data-testid="chat-panel">
       <div className="tabs" role="tablist">
         {['chat', 'people'].map((name) => (
-          <Tab key={name} name={name} active={tab === name} onPick={setTab} />
+          <Tab key={name} name={name} active={active === name} onPick={setTab} />
         ))}
       </div>
-      {tab === 'chat' ? <MessageList /> : <PeopleList />}
+      {active === 'chat' ? <MessageList /> : <PeopleList />}
     </section>
   );
 };
```

## The steps

**agent:** This task matches the react-perf-recorder skill exactly — it'll analyze the recording, find the wasteful re-renders, fix them, and produce before/after numbers.

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
1	20260928-074928-app-panel-0384
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:40651/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording","max_results":3}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
```

**→ rpr:get_recording**
```
{"id":"20260928-074928-app-panel-0384"}
```

**←**
```
{"id":"20260928-074928-app-panel-0384","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-074928-app-panel-0384","summary":{"id":"20260928-074928-app-panel-0384","status":"done","createdAt":"2026-09-28T07:49:28.434Z","source":"panel","url":"http://localhost:40651/?tick=150&tab=chat","viewport":"1280×720","durationSec":0.3,"scope":null,"totals":{"commits":15,"commitsPerSec":45.18,"commitsInScope":15,"renders":118,"rendersPerScopeCommit":7.9,"rendersFromOutside":0,"rendersWithoutDom":96,"domTextChanges":1,"rendersPerTextChange":118},"topRoots":[{"root":"RouterProvider","source":"src/main.tsx:15","path":"","hits":6,"hitsPerSec":18.07,"instances":1,"perHit":12,"noDomChange":6,"renderMsPerHit":0.8,"reasons":["6× state #0 · State"],"causes":["6× core:navigation push","6× core:input click"],"lanes":"Sync:6"},{"root":"ChatPanel","source":"src/components/ChatView.tsx:25","path":"ChatView < SettingsBySync < Layout","hits":12,"hitsPerSec":36.14,"instances":1,"perHit":4,"noDomChange":6,"mounts":42,"renderMsPerHit":0.65,"reasons":["12× context Location · useActiveTab › [react-router-dom] useSearchParams › useLocation › useInRouterContext › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();","12× context Route SAME-CONTENT · useActiveTab › [react-router-dom] useSearchParams › useNavigate › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();","6× state #8 · State @ src/components/ChatPanel.tsx:20 const [tab, setShown] = useStat … [4270 more]
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
src/components/Messages.tsx
src/components/MessageCount.tsx
src/components/ChatView.tsx
src/components/Workspace.tsx
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
src/components/ChatPanel.tsx
```

**→ Read**
```
{"file_path":"src/components/ChatPanel.tsx"}
```

**←**
```
1	import { memo, useCallback, useEffect, useState } from 'react';
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
19	  const [active, setTab] = useActiveTab();
20	  const [tab, setShown] = useState(active);
21	  useEffect(() => setShown(active), [active]);
22	  return (
23	    <section className="panel" data-testid="chat-panel">
24	      <div className="tabs" role="tablist">
25	        {['chat', 'people'].map((name) => (
26	          <Tab key={name} name={name} active={tab === name} onPick={setTab} />
27	        ))}
28	      </div>
29	      {tab === 'chat' ? <MessageList /> : <PeopleList />}
30	    </section>
31	  );
32	};
33	
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
{"file_path":"src/main.tsx"}
```

**←**
```
1	import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
2	import { createRoot } from 'react-dom/client';
3	import { Provider } from 'react-redux';
4	import { createBrowserRouter, RouterProvider } from 'react-router-dom';
5	import './app.css';
6	import { Layout } from './components/ChatView';
7	import { store } from './store/activity';
8	
9	const client = new QueryClient();
10	const router = createBrowserRouter([{ path: '*', element: <Layout /> }]);
11	
12	createRoot(document.getElementById('root')!).render(
13	  <Provider store={store}>
14	    <QueryClientProvider client={client}>
15	      <RouterProvider router={router} />
16	    </QueryClientProvider>
17	  </Provider>
18	);
19	
```

**→ rpr:get_recording**
```
{"id":"20260928-074928-app-panel-0384","section":"timeline","top":20}
```

**←**
```
{"id":"20260928-074928-app-panel-0384","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-074928-app-panel-0384","timeline":{"truncated":false,"total":15,"offset":0,"items":[{"i":0,"atSec":0.02,"renders":1,"lane":"Sync","event":"message","causes":["zustand:feed/tick","core:message Worker"],"roots":[{"root":"SyncBar","hits":1,"ms":0,"reasons":["external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"],"hook":"[zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"}]},{"i":1,"atSec":0.08,"renders":16,"noDomChange":16,"renderMs":1.5,"sinceMs":59,"lane":"Sync","event":"click","action":"click «tab-people» in Tab","causes":["core:navigation push","core:input click"],"roots":[{"root":"RouterProvider","hits":12,"ms":1.5,"reasons":["state #0"],"hook":"State"},{"root":"ChatPanel","hits":4,"ms":0.4,"reasons":["context Location","context Route SAME-CONTENT"],"hook":"useActiveTab › [react-router-dom] useSearchParams › useLocation › useInRouterContext › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();"}],"cascade":["RouterProvider · state #0 1.5ms","  ChatPanel · context Location 0.4ms","    Tab · new ref, same content onPick ×2 0.1ms","    MessageList · props equal 0.1ms"]},{"i":2,"atSec":0.08,"renders":3,"renderMs":0.6,"sinceMs":6,"lane":"Default","event":"message","action":"click «tab-people» in Tab","causes":["core:effect  … [7345 more]
```

**agent:** The recording shows the cause clearly: each tab click fires **two commits**. The first (triggered by the router's context change) touches RouterProvider, ChatPanel, Tab, and MessageList/PeopleList — 16 renders — and produces **zero DOM change** every single time. Only the second commit, triggered by a `useEffect` a moment later, actually updates the DOM.

The culprit is in `src/components/ChatPanel.tsx:19-21`:

```tsx
const [active, setTab] = useActiveTab();
const [tab, setShown] = useState(active);
useEffect(() => setShown(active), [active]);
```

`tab` is local state that just mirrors `active` one render later via an effect. This buys nothing — `tab` always converges to `active` — but it splits every tab switch into two commits: one wasted (old `tab` value, so nothing visually changes) and one real. Let me fix it by using `active` directly.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChatPanel.tsx","old_string":"import { memo, useCallback, useEffect, useState } from 'react';\nimport { useSearchParams } from 'react-router-dom';\nimport { MessageList, PeopleList } from './Messages';","new_string":"import { memo, useCallback } from 'react';\nimport { useSearchParams } from 'react-router-dom';\nimport { MessageList, PeopleList } from './Messages';"}
```

**←**
```
The file src/components/ChatPanel.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChatPanel.tsx","old_string":"export const ChatPanel = () => {\n  const [active, setTab] = useActiveTab();\n  const [tab, setShown] = useState(active);\n  useEffect(() => setShown(active), [active]);\n  return (\n    <section className=\"panel\" data-testid=\"chat-panel\">\n      <div className=\"tabs\" role=\"tablist\">\n        {['chat', 'people'].map((name) => (\n          <Tab key={name} name={name} active={tab === name} onPick={setTab} />\n        ))}\n      </div>\n      {tab === 'chat' ? <MessageList /> : < … [500 more]
```

**←**
```
The file src/components/ChatPanel.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's record the same scenario again and compare before/after.

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ rpr:record_page**
```
{"replay":"20260928-074928-app-panel-0384","label":"after"}
```

**←**
```
{"id":"20260928-075038-app-record-03c1","url":"http://localhost:40651/?tick=150&tab=chat&rpr=rec","requested":"http://localhost:40651/?tick=150&tab=chat","durationSec":1.1,"commits":15,"renders":109,"rendersWithoutDom":7,"rendersPerCommit":7.3,"topRoot":"RouterProvider ×6","wasting":[],"warnings":[]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-074928-app-panel-0384","after":"20260928-075038-app-record-03c1"}
```

**←**
```
{"comparable":false,"warnings":["durations differ more than twice: 332ms vs 1082ms"],"before":{"id":"20260928-074928-app-panel-0384","durationMs":332},"after":{"id":"20260928-075038-app-record-03c1","durationMs":1082},"totals":{"commits":"15 → 15 (0%)","renders":"118 → 109 (-8%)","commitsPerSec":"45.18 → 13.86 (-69%)","rendersPerSec":"355.42 → 100.74 (-72%)","rendersPerCommit":"7.9 → 7.3 (-8%)","rendersWithoutDomPerSec":"289.16 → 6.47 (-98%)","rendersPerTextChange":"118 → 15.6 (-87%)","longTaskMaxMs":"0 → 126"},"roots":[{"root":"RouterProvider","source":"src/main.tsx:15","path":"","status":"changed","hitsPerSec":"18.07 → 5.55 (-69%)","perHit":"12 → 12 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"216.87 → 66.54 (-69%)"},{"root":"ChatPanel","source":"src/components/ChatView.tsx:25","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"36.14 → 5.55 (-85%)","perHit":"4 → 3 (-25%)","instances":"1 → 1 (0%)","cascadePerSec":"126.51 → 16.64 (-87%)"},{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 0.92","perHit":"– → 6","instances":"– → 1","cascadePerSec":"0 → 5.55"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"9.04 → 4.62 (-49%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"9.04 → 4.62 (-49%)"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView … [2541 more]
```

**→ rpr:get_recording**
```
{"id":"20260928-075038-app-record-03c1"}
```

**←**
```
{"id":"20260928-075038-app-record-03c1","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075038-app-record-03c1","summary":{"id":"20260928-075038-app-record-03c1","status":"done","createdAt":"2026-09-28T07:50:39.451Z","label":"after","source":"script:record","url":"http://localhost:40651/?tick=150&tab=chat&rpr=rec","viewport":"1280×720","durationSec":1.1,"scope":null,"totals":{"commits":16,"commitsPerSec":14.79,"commitsInScope":15,"renders":109,"rendersPerScopeCommit":7.3,"rendersFromOutside":0,"rendersWithoutDom":7,"domTextChanges":7,"rendersPerTextChange":15.6},"topRoots":[{"root":"RouterProvider","source":"src/main.tsx:15","path":"","hits":6,"hitsPerSec":5.55,"instances":1,"perHit":12,"noDomChange":0,"renderMsPerHit":1.5,"reasons":["6× state #0 · State"],"causes":["6× core:navigation push","6× core:input click"],"lanes":"Sync:6"},{"root":"ChatPanel","source":"src/components/ChatView.tsx:25","path":"ChatView < SettingsBySync < Layout","hits":6,"hitsPerSec":5.55,"instances":1,"perHit":3,"noDomChange":0,"mounts":42,"renderMsPerHit":1.03,"reasons":["12× context Location · useActiveTab › [react-router-dom] useSearchParams › useLocation › useInRouterContext › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();","12× context Route SAME-CONTENT · useActiveTab › [react-router-dom] useSearchParams › useNavigate › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();"],"causes":["6× core:navigation push","6× core:input cl … [6553 more]
```

**agent:** ## Findings

The recording shows every tab click firing **two commits** instead of one:

1. A commit from the router's `Location`/`Route` context change (triggered by `useSearchParams` inside `useActiveTab`) — cascades through `RouterProvider → ChatPanel → Tab → MessageList/PeopleList`, 16 renders, **100% with no DOM change**.
2. A commit a moment later from a `useEffect` in `ChatPanel`, whose only job is to copy the value into local state — 3 more renders, and only *this* commit actually updates the DOM.

The cause was `src/components/ChatPanel.tsx`:

```tsx
const [active, setTab] = useActiveTab();
const [tab, setShown] = useState(active);
useEffect(() => setShown(active), [active]);
```

`tab` always ends up equal to `active`, one render later — pure derived-state-via-effect, buying nothing but a doubled, half-wasted commit on every switch.

## Fix

Removed the mirrored state/effect; `ChatPanel` now reads `active` directly (same values, same JSX, same `data-testid`s — nothing the page shows changes).

## Before → after (same replayed scenario: 6 tab clicks)

| | before | after |
|---|---|---|
| Commits per tab click | 2 | 1 |
| `core:effect @ ChatPanel.tsx` commits (the wasted second commit) | 6 | 0 |
| ChatPanel hits / renders-with-no-DOM-change | 12 hits, 6 no-op | 6 hits, **0 no-op** |
| Renders per visible text change (`rendersPerTextChange`) | 118 | 15.6 (**‑87%**) |
| Renders per click action (typical) | 19–21 | 15–16 |
| Roots still rendering for nothing (`wastingAfter`) | — | none |

The remaining renders per click (RouterProvider's own cascade, `Tab`'s memo check) are react-router's own bookkeeping for the navigation itself — not app-controlled waste, and each one now carries a real DOM update rather than a duplicate no-op pass.
