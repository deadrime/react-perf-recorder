# decoys-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.26, 120 s, 15 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: a code review found several things that "re-render too much", but the idle page is still busy.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> ## What I found
> 
> The idle page had exactly one component re-rendering for nothing: **`TypingBadge`** (`src/components/TypingBadge.tsx`).
> 
> Its `useQuietSoon()` hook runs a `setInterval` every 250ms and called `setState({ soon: ... })` with a **brand-new object every tick**, even though the boolean value practically never changes (`QUIET_AT` is fixed 60 minutes ahead at module load, so `soon` stays `false` until the last minute). Because it's a new object reference each time, React can't bail out via `Object.is` and re-renders regardless.
> 
> The recording proved this precisely: in a 5-second idle window, `TypingBadge` fired **20 times**, and **all 20** of those renders (`noDomChange: 20/20`) changed nothing in the DOM. Every other cascade root in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`, etc.) had `noDomChange: 0` — every one of *their* renders actually updated visible content (live sync bar, query data, typing indicator), so those were legitimate and I left them untouched.
> 
> ## Fix
> 
> In `src/components/TypingBadge.tsx`, only build a new state object when the boolean actually flips:
> 
> ```ts
> const id = setInterval(() => {
>   const soon = QUIET_AT - Date.now() < 60_000;
>   setState((prev) => (prev.soon === soon ? prev : { soon }));
> }, 250);
> ```
> 
> Now React sees the same state reference when nothing changed and skips the render — the displayed text and its future switch to "quiet hours soon" behave identically.
> 
> ## Before / after (same 5s idle scenario, replayed)
> 
> | metric | before | after |
> |---|---|---|
> | commits | 64 | 43 (**-33%**) |
> | renders | 98 | 66 (**-33%**) |
> | renders/sec that changed no DOM | 3.98 | **0** (-100%) |
> | `TypingBadge` renders/sec | 3.98 | **0** (gone) |
> 
> `wastingAfter` (roots whose renders still mostly change nothing) is now empty — no wasted-render cascade root remains on the idle page.

## What it changed

```
diff -ruN a/src/components/TypingBadge.tsx b/src/components/TypingBadge.tsx
--- a/src/components/TypingBadge.tsx
+++ b/src/components/TypingBadge.tsx
@@ -5,7 +5,10 @@
 function useQuietSoon() {
   const [state, setState] = useState({ soon: false });
   useEffect(() => {
-    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);
+    const id = setInterval(() => {
+      const soon = QUIET_AT - Date.now() < 60_000;
+      setState((prev) => (prev.soon === soon ? prev : { soon }));
+    }, 250);
     return () => clearInterval(id);
   }, []);
   return state.soon;
```

## The steps

**agent:** This task matches the react-perf-recorder skill exactly — it's designed to find why a page re-renders and prove a fix with numbers. Let me invoke it.

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
{"file_path":"./recording.txt"}
```

**←**
```
1	20260928-081317-app-panel-2934
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

**agent:** Now let me load the recording.

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
{"id":"20260928-081317-app-panel-2934"}
```

**←**
```
{"id":"20260928-081317-app-panel-2934","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081317-app-panel-2934","summary":{"id":"20260928-081317-app-panel-2934","status":"done","createdAt":"2026-09-28T08:13:22.669Z","source":"panel","url":"http://localhost:38481/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":64,"commitsPerSec":12.74,"commitsInScope":64,"renders":98,"rendersPerScopeCommit":1.5,"rendersFromOutside":0,"rendersWithoutDom":20,"domTextChanges":41,"rendersPerTextChange":2.4},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.77,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.1,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"TypingBadge","source":"src/components/Header.tsx:34","path":"Header < SettingsBySync < Layout","hits":20,"hitsPerSec":3.98,"instances":1,"perHit":1,"noDomChange":20,"renderMsPerHit":0.06,"reasons":["20× state #0 SAME-CONTENT · useQuietSoon › State @ src/components/TypingBadge.tsx:15 const quiet = useQuietSoon();"],"causes":["20× core:timer setInterval @ src/components/TypingBadge.tsx"],"lanes":"Def … [6125 more]
```

**→ Read**
```
{"file_path":"./src/components/Header.tsx"}
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
29	  <header className="head" data-testid="header" style={{ alignItems: 'center' }}>
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
{"file_path":"./src/components/TypingBadge.tsx"}
```

**←**
```
1	import { useEffect, useState } from 'react';
2	
3	const QUIET_AT = Date.now() + 60 * 60_000;
4	
5	function useQuietSoon() {
6	  const [state, setState] = useState({ soon: false });
7	  useEffect(() => {
8	    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);
9	    return () => clearInterval(id);
10	  }, []);
11	  return state.soon;
12	}
13	
14	export const TypingBadge = () => {
15	  const quiet = useQuietSoon();
16	  return (
17	    <span className="badge muted" data-testid="typing-badge">
18	      {quiet ? 'quiet hours soon' : 'everyone is around'}
19	    </span>
20	  );
21	};
22	
```

**→ Read**
```
{"file_path":"./src/components/ChatView.tsx"}
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

**agent:** The recording shows one clear culprit: **`TypingBadge`** fires 20 times in 5 seconds (every 250ms, from a `setInterval`), and **all 20** of those renders change nothing in the DOM (`noDomChange: 20` out of `hits: 20`) — literally 100% wasted. Let me confirm the mechanism before fixing.

**→ Read**
```
{"file_path":"./src/components/TypingBadge.tsx"}
```

**←**
```
Wasted call — file unchanged since your last Read. Refer to that earlier tool_result instead.
```

**agent:** Confirmed the mechanism: `useQuietSoon` in `src/components/TypingBadge.tsx` runs a `setInterval` every 250ms and calls `setState({ soon: ... })` with a **new object every time**, even when the boolean value hasn't changed. Since it's a new reference, React can't bail out via `Object.is`, so it re-renders — but the JSX only depends on the boolean, which stays `false` for the entire ~60 minutes until quiet hours approach. That's why 20/20 renders in the recording changed nothing in the DOM.

All the other cascade roots (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`, etc.) have `noDomChange: 0` — every one of their renders actually changed visible content (live sync bar, query results, typing text), so those are real updates, not waste. I'll leave them alone.

Fix: only produce a new state object when the boolean actually flips, so React bails out when it hasn't.

**→ Edit**
```
{"replace_all":false,"file_path":"./src/components/TypingBadge.tsx","old_string":"    const id = setInterval(() => setState({ soon: QUIET_AT - Date.now() < 60_000 }), 250);","new_string":"    const id = setInterval(() => {\n      const soon = QUIET_AT - Date.now() < 60_000;\n      setState((prev) => (prev.soon === soon ? prev : { soon }));\n    }, 250);"}
```

**←**
```
The file ./src/components/TypingBadge.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's record after the fix and compare, using the same scenario (load, then idle a few seconds).

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**→ rpr:record_page**
```
{"replay":"20260928-081317-app-panel-2934","label":"after"}
```

**←**
```
{"id":"20260928-081445-app-record-5ec9","url":"http://localhost:38481/?tick=150","requested":"http://localhost:38481/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-081317-app-panel-2934 has no actions: recorded the page as it is for 5022 ms instead"]}
```

**agent:** `rendersWithoutDom` dropped from 20 to 0 and `wasting` is now empty. Let's get the full comparison for before/after numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-081317-app-panel-2934","after":"20260928-081445-app-record-5ec9"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-081317-app-panel-2934","durationMs":5022},"after":{"id":"20260928-081445-app-record-5ec9","durationMs":5035},"totals":{"commits":"64 → 43 (-33%)","renders":"98 → 66 (-33%)","commitsPerSec":"12.74 → 8.54 (-33%)","rendersPerSec":"19.51 → 13.11 (-33%)","rendersPerCommit":"1.5 → 1.5 (0%)","rendersWithoutDomPerSec":"3.98 → 0 (-100%)","rendersPerTextChange":"2.4 → 2 (-17%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"TypingBadge","source":"src/components/Header.tsx:34","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"3.98 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"3.98 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.39 → 1.19 (-14%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.79 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.79 → 1.39 (-22%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.79 → 1.39 (-22%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","status": … [2511 more]
```

**agent:** ## What I found

The idle page had exactly one component re-rendering for nothing: **`TypingBadge`** (`src/components/TypingBadge.tsx`).

Its `useQuietSoon()` hook runs a `setInterval` every 250ms and called `setState({ soon: ... })` with a **brand-new object every tick**, even though the boolean value practically never changes (`QUIET_AT` is fixed 60 minutes ahead at module load, so `soon` stays `false` until the last minute). Because it's a new object reference each time, React can't bail out via `Object.is` and re-renders regardless.

The recording proved this precisely: in a 5-second idle window, `TypingBadge` fired **20 times**, and **all 20** of those renders (`noDomChange: 20/20`) changed nothing in the DOM. Every other cascade root in the recording (`SyncBar`, `ChannelStats`, `OnlineNow`, `TypingLine`, `Status`, etc.) had `noDomChange: 0` — every one of *their* renders actually updated visible content (live sync bar, query data, typing indicator), so those were legitimate and I left them untouched.

## Fix

In `src/components/TypingBadge.tsx`, only build a new state object when the boolean actually flips:

```ts
const id = setInterval(() => {
  const soon = QUIET_AT - Date.now() < 60_000;
  setState((prev) => (prev.soon === soon ? prev : { soon }));
}, 250);
```

Now React sees the same state reference when nothing changed and skips the render — the displayed text and its future switch to "quiet hours soon" behave identically.

## Before / after (same 5s idle scenario, replayed)

| metric | before | after |
|---|---|---|
| commits | 64 | 43 (**-33%**) |
| renders | 98 | 66 (**-33%**) |
| renders/sec that changed no DOM | 3.98 | **0** (-100%) |
| `TypingBadge` renders/sec | 3.98 | **0** (gone) |

`wastingAfter` (roots whose renders still mostly change nothing) is now empty — no wasted-render cascade root remains on the idle page.
