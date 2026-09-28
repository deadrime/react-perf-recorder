# effect-derived-state-rec, with the plugin, run 1

fixed (waste 6); checks 5 of 5; $0.30, 123 s, 17 turns

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

> Confirmed. Comparing raw counts for the identical 6 clicks:
> 
> **ChatPanel** (src/components/ChatPanel.tsx)
> - Before: 11 renders / 6 clicks, **6 with no DOM change at all** (pure waste)
> - After: 6 renders / 6 clicks, **0 with no DOM change** — every render now does something
> 
> **Tab** buttons (children of ChatPanel, memoized)
> - Before: 22 renders (12 from the wasted context commit + 10 from the redundant state commit)
> - After: 12 renders (one clean cascade per click)
> 
> **Cause "`core:effect @ ChatPanel.tsx`"** (the `useEffect(() => setShown(active), [active])` firing)
> - Before: 5 commits caused by this effect
> - After: 0 — the cause is gone entirely, because the effect is gone
> 
> ## Root cause
> 
> `ChatPanel` (src/components/ChatPanel.tsx:18-21) derived the current tab from the router (`active`, via `useActiveTab`/`useSearchParams`), but then copied it into a second local state (`tab`, via `useState` + a `useEffect` that ran `setShown(active)` whenever `active` changed). Every tab click therefore produced two commits instead of one:
> 
> 1. The route/context updates → `active` changes, but `tab` hasn't caught up yet → **a commit that renders the old tab again, changing nothing on screen.**
> 2. The effect fires, updates `tab` → a second commit that actually paints the new tab.
> 
> That doubled the render work (and cascaded into the memoized `Tab` buttons and the list components) on every single tab switch.
> 
> ## Fix
> 
> Removed the redundant `tab`/`setShown`/`useEffect` and now render directly from `active`, the value that was already the single source of truth:
> 
> ```tsx
> export const ChatPanel = () => {
>   const [active, setTab] = useActiveTab();
>   return (
>     <section className="panel" data-testid="chat-panel">
>       <div className="tabs" role="tablist">
>         {['chat', 'people'].map((name) => (
>           <Tab key={name} name={name} active={active === name} onPick={setTab} />
>         ))}
>       </div>
>       {active === 'chat' ? <MessageList /> : <PeopleList />}
>     </section>
>   );
> };
> ```
> 
> Page output is identical (same tabs, same content, same click handler) — only the wasted extra commit per click is gone.

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

**agent:** This is exactly the react-perf-recorder skill's job — it can read the existing recording, find cascade roots, and prove a fix with numbers.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Investigate sluggish tab switching between chat and people tabs. Repro: open page, switch to people tab and back to chat, three times. Recording id is in ./recording.txt, dev server url in ./dev-url.txt. Find out whether anything re-renders for nothing and why, fix it in ./src without changing what the page shows, and prove with before/after numbers. If nothing does, say so and change nothing."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [3915 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-234050-app-panel-089a
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:35483/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
```

**→ rpr:get_recording**
```
{"id":"20260927-234050-app-panel-089a"}
```

**←**
```
{"id":"20260927-234050-app-panel-089a","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234050-app-panel-089a","summary":{"id":"20260927-234050-app-panel-089a","status":"done","createdAt":"2026-09-27T23:40:50.752Z","source":"panel","url":"http://localhost:35483/?tick=150&tab=chat","viewport":"1280×720","durationSec":0.4,"scope":null,"totals":{"commits":14,"commitsPerSec":37.53,"commitsInScope":14,"renders":115,"rendersPerScopeCommit":8.2,"rendersFromOutside":0,"rendersWithoutDom":96,"domTextChanges":1,"rendersPerTextChange":115},"topRoots":[{"root":"RouterProvider","source":"src/main.tsx:15","path":"","hits":6,"hitsPerSec":16.09,"instances":1,"perHit":12,"noDomChange":6,"renderMsPerHit":0.68,"reasons":["6× state #0 · State"],"causes":["6× core:navigation push","6× core:input click"],"lanes":"Sync:6"},{"root":"ChatPanel","source":"src/components/ChatView.tsx:25","path":"ChatView < SettingsBySync < Layout","hits":11,"hitsPerSec":29.49,"instances":1,"perHit":4,"noDomChange":6,"mounts":29,"renderMsPerHit":0.59,"reasons":["12× context Location · useActiveTab › [react-router-dom] useSearchParams › useLocation › useInRouterContext › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();","12× context Route SAME-CONTENT · useActiveTab › [react-router-dom] useSearchParams › useNavigate › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();","5× state #8 · State @ src/components/ChatPanel.tsx:20 const [tab, setShown] = useSta … [4280 more]
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

**→ rpr:get_recording**
```
{"id":"20260927-234050-app-panel-089a","section":"components","top":30}
```

**←**
```
{"id":"20260927-234050-app-panel-089a","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234050-app-panel-089a","components":{"total":22,"offset":0,"items":[{"name":"Tab","renders":22,"withoutDom":12,"byParent":22,"memo":true,"reasons":[{"i":8,"n":12,"reason":"parent: props new ref, same content: onPick"},{"i":11,"n":10,"reason":"parent: props active"}],"chains":[{"n":12,"way":"core:navigation push › RouterProvider · state #0 › ChatPanel · context Location › Tab · new ref, same content onPick"},{"n":10,"way":"core:navigation push › ChatPanel · state tab › Tab · prop active"}]},{"name":"ChatPanel","renders":11,"withoutDom":6,"byParent":0,"reasons":[{"i":6,"n":12,"reason":"context Location"},{"i":7,"n":12,"reason":"context Route SAME-CONTENT"},{"i":10,"n":5,"reason":"state #8"}]},{"name":"PeopleList","renders":3,"mounts":3,"withoutDom":3,"byParent":3,"reasons":[{"i":9,"n":3,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":3,"way":"core:navigation push › RouterProvider · state #0 › ChatPanel · context Location › PeopleList · props equal"}]},{"name":"MessageRow","renders":0,"mounts":6,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"TimeAgo","renders":0,"mounts":6,"withoutDom":0,"byParent":0,"reasons":[]},{"name":"Status","renders":0,"mounts":6,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"Attachments","renders":0,"mounts":6,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"MessageList","renders":3,"mounts":2,"withou … [2235 more]
```

**agent:** Found it: `ChatPanel` (src/components/ChatPanel.tsx:18-21) keeps a local `tab` state that mirrors the router-derived `active` value via a `useEffect`. Every tab click causes two commits: one when the route/context updates (`active` changes but `tab` hasn't caught up yet — this commit changes nothing on screen), and a second when the effect fires `setShown(active)` to actually paint the new tab. That doubles the render work for every click (visible in `components`: `ChatPanel` renders 11 times over 6 clicks, 6 of those with no DOM change at all, and `Tab`/`MessageList`/`PeopleList` all re-render an extra time in lockstep).

Fixing by dropping the redundant state and deriving `tab` directly from `active`.

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

**agent:** Now I need to record the same repro against the fixed code to get after-numbers.

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**agent:** I'll replay the exact same recorded actions against the now-fixed page to get comparable after-numbers.

**→ rpr:record_page**
```
{"replay":"20260927-234050-app-panel-089a","label":"after"}
```

**←**
```
{"id":"20260927-234203-app-record-281a","url":"http://localhost:35483/?tick=150&tab=chat&rpr=rec","requested":"http://localhost:35483/?tick=150&tab=chat","durationSec":1.1,"commits":16,"renders":110,"rendersWithoutDom":7,"rendersPerCommit":6.9,"topRoot":"RouterProvider ×6","warnings":[]}
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":3}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ rpr:compare_recordings**
```
{"before":"20260927-234050-app-panel-089a","after":"20260927-234203-app-record-281a"}
```

**←**
```
{"comparable":false,"warnings":["durations differ more than twice: 373ms vs 1095ms"],"before":{"id":"20260927-234050-app-panel-089a","durationMs":373},"after":{"id":"20260927-234203-app-record-281a","durationMs":1095},"totals":{"commits":"14 → 16 (+14%)","renders":"115 → 110 (-4%)","commitsPerSec":"37.53 → 14.61 (-61%)","rendersPerSec":"308.31 → 100.46 (-67%)","rendersPerCommit":"8.2 → 6.9 (-16%)","rendersWithoutDomPerSec":"257.37 → 6.39 (-98%)","rendersPerTextChange":"115 → 15.7 (-86%)","longTaskMaxMs":"0 → 89"},"roots":[{"root":"RouterProvider","source":"src/main.tsx:15","path":"","status":"changed","hitsPerSec":"16.09 → 5.48 (-66%)","perHit":"12 → 12 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"193.03 → 65.75 (-66%)"},{"root":"ChatPanel","source":"src/components/ChatView.tsx:25","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"29.49 → 5.48 (-81%)","perHit":"4 → 3 (-25%)","instances":"1 → 1 (0%)","cascadePerSec":"104.56 → 16.44 (-84%)"},{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 0.91","perHit":"– → 6","instances":"– → 1","cascadePerSec":"0 → 5.48"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 2.74","perHit":"– → 1","instances":"– → 1","cascadePerSec":"0 → 2.74"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","sta … [2524 more]
```

**agent:** The duration mismatch makes the raw per-second comparison noisy (background timers fired more in the longer replay). Let me pull the raw hit counts for ChatPanel directly from the "after" recording, which is the number that isolates the fix.

**→ rpr:get_recording**
```
{"id":"20260927-234203-app-record-281a","section":"components","top":10}
```

**←**
```
{"id":"20260927-234203-app-record-281a","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234203-app-record-281a","components":{"total":50,"offset":0,"items":[{"name":"Tab","renders":12,"mounts":2,"withoutDom":0,"byParent":12,"memo":true,"reasons":[{"i":11,"n":12,"reason":"parent: props active | new ref, same content: onPick"}],"chains":[{"n":12,"way":"core:navigation push › RouterProvider · state #0 › ChatPanel · context Location › Tab · prop active · new ref, same content onPick"}]},{"name":"Status","renders":1,"mounts":12,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":15,"n":1,"reason":"external store #3 [useChatStore] outer"}]},{"name":"MessageRow","renders":0,"mounts":12,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"TimeAgo","renders":0,"mounts":12,"withoutDom":0,"byParent":0,"reasons":[]},{"name":"Attachments","renders":0,"mounts":12,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"SyncBar","renders":6,"mounts":1,"withoutDom":0,"byParent":0,"reasons":[{"i":12,"n":6,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"ChatPanel","renders":6,"mounts":1,"withoutDom":0,"byParent":0,"reasons":[{"i":9,"n":12,"reason":"context Location"},{"i":10,"n":12,"reason":"context Route SAME-CONTENT"}]},{"name":"MessageList","renders":0,"mounts":4,"withoutDom":0,"byParent":0,"reasons":[]},{"name":"MetaInput","renders":2,"mounts":2,"withoutDom":2,"byParent":2,"reasons":[{"i":2,"n":2,"reason":"parent: same props, mem … [259 more]
```

**agent:** Confirmed. Comparing raw counts for the identical 6 clicks:

**ChatPanel** (src/components/ChatPanel.tsx)
- Before: 11 renders / 6 clicks, **6 with no DOM change at all** (pure waste)
- After: 6 renders / 6 clicks, **0 with no DOM change** — every render now does something

**Tab** buttons (children of ChatPanel, memoized)
- Before: 22 renders (12 from the wasted context commit + 10 from the redundant state commit)
- After: 12 renders (one clean cascade per click)

**Cause "`core:effect @ ChatPanel.tsx`"** (the `useEffect(() => setShown(active), [active])` firing)
- Before: 5 commits caused by this effect
- After: 0 — the cause is gone entirely, because the effect is gone

## Root cause

`ChatPanel` (src/components/ChatPanel.tsx:18-21) derived the current tab from the router (`active`, via `useActiveTab`/`useSearchParams`), but then copied it into a second local state (`tab`, via `useState` + a `useEffect` that ran `setShown(active)` whenever `active` changed). Every tab click therefore produced two commits instead of one:

1. The route/context updates → `active` changes, but `tab` hasn't caught up yet → **a commit that renders the old tab again, changing nothing on screen.**
2. The effect fires, updates `tab` → a second commit that actually paints the new tab.

That doubled the render work (and cascaded into the memoized `Tab` buttons and the list components) on every single tab switch.

## Fix

Removed the redundant `tab`/`setShown`/`useEffect` and now render directly from `active`, the value that was already the single source of truth:

```tsx
export const ChatPanel = () => {
  const [active, setTab] = useActiveTab();
  return (
    <section className="panel" data-testid="chat-panel">
      <div className="tabs" role="tablist">
        {['chat', 'people'].map((name) => (
          <Tab key={name} name={name} active={active === name} onPick={setTab} />
        ))}
      </div>
      {active === 'chat' ? <MessageList /> : <PeopleList />}
    </section>
  );
};
```

Page output is identical (same tabs, same content, same click handler) — only the wasted extra commit per click is gone.
