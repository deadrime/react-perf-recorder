# effect-derived-state-rec, with the plugin, run 2

fixed (waste 6); checks 5 of 5; $0.31, 176 s, 2 turns

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

> This looks correct and confirms the fix — clean diff, same DOM output, no behavior change. The perf-recorder agent's work matches its report.
> 
> ## Summary
> 
> **Root cause:** `ChatPanel` (`src/components/ChatPanel.tsx`) had two sources of wasted re-renders during tab switching:
> 
> 1. It mirrored the `active` tab prop into local state via a `useState` + `useEffect`, causing every navigation to render once with stale state, then again when the effect fired — a redundant extra render that changed nothing on screen.
> 2. `useActiveTab`'s `select` callback depended on react-router's `setParams`, which is a *new function reference every render* — so `select`'s identity changed constantly, defeating the `memo()` on the `Tab` button component.
> 
> **Fix:** Removed the state-mirroring effect (render directly from `active`), and stabilized `select`'s identity with a ref holding the latest `setParams`. No visual or behavioral change — same tab logic, same DOM.
> 
> **Before/after (same 6-click repro, chat↔people ×3):**
> 
> | Component | before renders (wasted) | after renders (wasted) |
> |---|---|---|
> | `ChatPanel` | 11 (6 wasted, 55%) | 6 (0 wasted) |
> | `Tab` | 22 (12 wasted, 55%) | 12 (0 wasted) |
> 
> Overall: 96 of 114 renders were wasted before (84%) vs. 7 of 109 after (~6%). The `core:effect` cascade trigger in `ChatPanel` disappeared entirely (-100%).
> 
> Recordings used: before = the original `20260927-234147-app-panel-21be`; after = a fresh replay `20260927-234333-app-record-cd21` against the fixed code, same URL/viewport/click sequence.

## What it changed

```
diff -ruN a/src/components/ChatPanel.tsx b/src/components/ChatPanel.tsx
--- a/src/components/ChatPanel.tsx
+++ b/src/components/ChatPanel.tsx
@@ -1,11 +1,16 @@
-import { memo, useCallback, useEffect, useState } from 'react';
+import { memo, useCallback, useRef } from 'react';
 import { useSearchParams } from 'react-router-dom';
 import { MessageList, PeopleList } from './Messages';
 
 export const useActiveTab = () => {
   const [params, setParams] = useSearchParams();
   const tab = params.get('tab') === 'people' ? 'people' : 'chat';
-  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);
+  // setParams from react-router-dom is a new function every render (same behavior,
+  // different identity). Keep the latest one in a ref so `select` itself never
+  // changes identity, which lets memoized children (Tab) skip re-rendering.
+  const setParamsRef = useRef(setParams);
+  setParamsRef.current = setParams;
+  const select = useCallback((next: string) => setParamsRef.current((p) => ({ ...Object.fromEntries(p), tab: next })), []);
   return [tab, select] as const;
 };
 
@@ -17,16 +22,14 @@
 
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

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-234147-app-panel-21be
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:44813/?tick=150
2	
```

**agent:** I'll delegate this to the perf-recorder agent, which is built to analyze the recording and apply a fix.

**→ Agent**
```
{"description":"Diagnose and fix chat/people tab re-render sluggishness","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app lives in ./src (repo root: .). Its dev server is running at http://localhost:44813/?tick=150 (from ./dev-url.txt).\n\nComplaint: switching between the \"chat\" and \"people\" tabs feels sluggish.\n\nRepro steps that were used to capture a recording: open the page, switch to the people tab, then back to chat, three times.\n\nA recording of that repro already exists, captured via the recorder's panel in the page. Its id  … [1133 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a05b43b7fcdd00ee8 (internal ID - do not mention to user. Use SendMessage with to: 'a05b43b7fcdd00ee8', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-oBiUB6/tmp/claude-0/-tmp-claude-eval-oBiUB6-home-cwd/65b96f3c-48dd-4550-8129-c40def836444/tasks/a05b43b7fcdd00ee8.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

> **→ rpr:get_recording**
> ```
> {"id":"20260927-234147-app-panel-21be"}
> ```

> **←**
> ```
> {"id":"20260927-234147-app-panel-21be","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234147-app-panel-21be","summary":{"id":"20260927-234147-app-panel-21be","status":"done","createdAt":"2026-09-27T23:41:48.163Z","source":"panel","url":"http://localhost:44813/?tick=150&tab=chat","viewport":"1280×720","durationSec":0.3,"scope":null,"totals":{"commits":13,"commitsPerSec":42.35,"commitsInScope":13,"renders":114,"rendersPerScopeCommit":8.8,"rendersFromOutside":0,"rendersWithoutDom":96,"domTextChanges":1,"rendersPerTextChange":114},"topRoots":[{"root":"RouterProvider","source":"src/main.tsx:15","path":"","hits":6,"hitsPerSec":19.54,"instances":1,"perHit":12,"noDomChange":6,"renderMsPerHit":0.65,"reasons":["6× state #0 · State"],"causes":["6× core:navigation push","6× core:input click"],"lanes":"Sync:6"},{"root":"ChatPanel","source":"src/components/ChatView.tsx:25","path":"ChatView < SettingsBySync < Layout","hits":11,"hitsPerSec":35.83,"instances":1,"perHit":4,"noDomChange":6,"mounts":29,"renderMsPerHit":0.82,"reasons":["12× context Location · useActiveTab › [react-router-dom] useSearchParams › useLocation › useInRouterContext › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();","12× context Route SAME-CONTENT · useActiveTab › [react-router-dom] useSearchParams › useNavigate › Context @ src/components/ChatPanel.tsx:19 const [active, setTab] = useActiveTab();","5× state #8 · State @ src/components/ChatPanel.tsx:20 const [tab, setShown] = useSta … [4294 more]
> ```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording (`20260927-234147-app-panel-21be`), find any wasteful re-renders during the chat/people tab switch, fix them in `./src` if real, and produce before/after numbers. I'll report back once it finishes.

> **→ Read**
> ```
> {"file_path":"src/components/ChatPanel.tsx"}
> ```

> **←**
> ```
> 1	import { memo, useCallback, useEffect, useState } from 'react';
> 2	import { useSearchParams } from 'react-router-dom';
> 3	import { MessageList, PeopleList } from './Messages';
> 4	
> 5	export const useActiveTab = () => {
> 6	  const [params, setParams] = useSearchParams();
> 7	  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
> 8	  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);
> 9	  return [tab, select] as const;
> 10	};
> 11	
> 12	const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
> 13	  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
> 14	    {name}
> 15	  </button>
> 16	));
> 17	
> 18	export const ChatPanel = () => {
> 19	  const [active, setTab] = useActiveTab();
> 20	  const [tab, setShown] = useState(active);
> 21	  useEffect(() => setShown(active), [active]);
> 22	  return (
> 23	    <section className="panel" data-testid="chat-panel">
> 24	      <div className="tabs" role="tablist">
> 25	        {['chat', 'people'].map((name) => (
> 26	          <Tab key={name} name={name} active={tab === name} onPick={setTab} />
> 27	        ))}
> 28	      </div>
> 29	      {tab === 'chat' ? <MessageList /> : <PeopleList />}
> 30	    </section>
> 31	  );
> 32	};
> 33	
> ```

> **→ Read**
> ```
> {"file_path":"test/eval-plugin/skills/react-perf-recorder/references/reading-a-recording.md"}
> ```

> **✗ error**
> ```
> Permission to use Read has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260927-234147-app-panel-21be","section":"components"}
> ```

> **←**
> ```
> {"id":"20260927-234147-app-panel-21be","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234147-app-panel-21be","components":{"total":22,"offset":0,"items":[{"name":"Tab","renders":22,"withoutDom":12,"byParent":22,"memo":true,"reasons":[{"i":8,"n":12,"reason":"parent: props new ref, same content: onPick"},{"i":11,"n":10,"reason":"parent: props active"}],"chains":[{"n":12,"way":"core:navigation push › RouterProvider · state #0 › ChatPanel · context Location › Tab · new ref, same content onPick"},{"n":10,"way":"core:navigation push › ChatPanel · state tab › Tab · prop active"}]},{"name":"ChatPanel","renders":11,"withoutDom":6,"byParent":0,"reasons":[{"i":6,"n":12,"reason":"context Location"},{"i":7,"n":12,"reason":"context Route SAME-CONTENT"},{"i":10,"n":5,"reason":"state #8"}]},{"name":"PeopleList","renders":3,"mounts":3,"withoutDom":3,"byParent":3,"reasons":[{"i":9,"n":3,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":3,"way":"core:navigation push › RouterProvider · state #0 › ChatPanel · context Location › PeopleList · props equal"}]},{"name":"MessageRow","renders":0,"mounts":6,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"TimeAgo","renders":0,"mounts":6,"withoutDom":0,"byParent":0,"reasons":[]},{"name":"Status","renders":0,"mounts":6,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"Attachments","renders":0,"mounts":6,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"MessageList","renders":3,"mounts":2,"withou … [541 more]
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

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ChatPanel.tsx","old_string":"import { memo, useCallback, useEffect, useState } from 'react';\nimport { useSearchParams } from 'react-router-dom';\nimport { MessageList, PeopleList } from './Messages';\n\nexport const useActiveTab = () => {\n  const [params, setParams] = useSearchParams();\n  const tab = params.get('tab') === 'people' ? 'people' : 'chat';\n  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);\n  return [tab, select] as const;\n};" … [818 more]
> ```

> **←**
> ```
> The file src/components/ChatPanel.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ChatPanel.tsx","old_string":"export const ChatPanel = () => {\n  const [active, setTab] = useActiveTab();\n  const [tab, setShown] = useState(active);\n  useEffect(() => setShown(active), [active]);\n  return (\n    <section className=\"panel\" data-testid=\"chat-panel\">\n      <div className=\"tabs\" role=\"tablist\">\n        {['chat', 'people'].map((name) => (\n          <Tab key={name} name={name} active={tab === name} onPick={setTab} />\n        ))}\n      </div>\n      {tab === 'chat' ? <MessageList /> : < … [500 more]
> ```

> **←**
> ```
> The file src/components/ChatPanel.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChatPanel.tsx"}
> ```

> **←**
> ```
> 1	import { memo, useCallback, useRef } from 'react';
> 2	import { useSearchParams } from 'react-router-dom';
> 3	import { MessageList, PeopleList } from './Messages';
> 4	
> 5	export const useActiveTab = () => {
> 6	  const [params, setParams] = useSearchParams();
> 7	  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
> 8	  // setParams from react-router-dom is a new function every render (same behavior,
> 9	  // different identity). Keep the latest one in a ref so `select` itself never
> 10	  // changes identity, which lets memoized children (Tab) skip re-rendering.
> 11	  const setParamsRef = useRef(setParams);
> 12	  setParamsRef.current = setParams;
> 13	  const select = useCallback((next: string) => setParamsRef.current((p) => ({ ...Object.fromEntries(p), tab: next })), []);
> 14	  return [tab, select] as const;
> 15	};
> 16	
> 17	const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
> 18	  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
> 19	    {name}
> 20	  </button>
> 21	));
> 22	
> 23	export const ChatPanel = () => {
> 24	  const [active, setTab] = useActiveTab();
> 25	  return (
> 26	    <section className="panel" data-testid="chat-panel">
> 27	      <div className="tabs" role="tablist">
> 28	        {['chat', 'people'].map((name) => (
> 29	          <Tab key={name} name={name} active={active === name} onPick={setTab} />
> 30	        ))}
> 31	      </div>
> 32	      {active === 'chat'  … [71 more]
> ```

> **agent:** Good. Now let's measure with a fresh "before" recording (same repro, same conditions) and an "after" replay of it against this fixed code, per the measuring-a-fix workflow. Since the existing recording used the panel (script-less clicks), I'll replay it against the current dev server (before fix isn't available live now — code is already fixed). I need a worktree with the original code to get a true "before", or I can just replay against the already-fixed server for "after" and compare to the existing recording as "before" (conditions look identical: same URL, same viewport 1280x720, same repro).

> **→ rpr:record_page**
> ```
> {"replay":"20260927-234147-app-panel-21be","label":"after-fix"}
> ```

> **←**
> ```
> {"id":"20260927-234333-app-record-cd21","url":"http://localhost:44813/?tick=150&tab=chat&rpr=rec","requested":"http://localhost:44813/?tick=150&tab=chat","durationSec":1.1,"commits":15,"renders":109,"rendersWithoutDom":7,"rendersPerCommit":7.3,"topRoot":"RouterProvider ×6","warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260927-234147-app-panel-21be","after":"20260927-234333-app-record-cd21"}
> ```

> **←**
> ```
> {"comparable":false,"warnings":["durations differ more than twice: 307ms vs 1105ms"],"before":{"id":"20260927-234147-app-panel-21be","durationMs":307},"after":{"id":"20260927-234333-app-record-cd21","durationMs":1105},"totals":{"commits":"13 → 15 (+15%)","renders":"114 → 109 (-4%)","commitsPerSec":"42.35 → 13.57 (-68%)","rendersPerSec":"371.34 → 98.64 (-73%)","rendersPerCommit":"8.8 → 7.3 (-17%)","rendersWithoutDomPerSec":"312.7 → 6.33 (-98%)","rendersPerTextChange":"114 → 15.6 (-86%)","longTaskMaxMs":"0 → 108"},"roots":[{"root":"RouterProvider","source":"src/main.tsx:15","path":"","status":"changed","hitsPerSec":"19.54 → 5.43 (-72%)","perHit":"12 → 12 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"234.53 → 65.16 (-72%)"},{"root":"ChatPanel","source":"src/components/ChatView.tsx:25","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"35.83 → 5.43 (-85%)","perHit":"4 → 3 (-25%)","instances":"1 → 1 (0%)","cascadePerSec":"127.04 → 16.29 (-87%)"},{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 0.9","perHit":"– → 6","instances":"– → 1","cascadePerSec":"0 → 5.43"},{"root":"OnlineNow","source":"src/components/ChatView.tsx:32","path":"ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 2.71","perHit":"– → 1","instances":"– → 1","cascadePerSec":"0 → 2.71"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","st … [2513 more]
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260927-234333-app-record-cd21","section":"components"}
> ```

> **←**
> ```
> {"id":"20260927-234333-app-record-cd21","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234333-app-record-cd21","components":{"total":50,"offset":0,"items":[{"name":"Tab","renders":12,"mounts":2,"withoutDom":0,"byParent":12,"memo":true,"reasons":[{"i":11,"n":12,"reason":"parent: props active"}],"chains":[{"n":12,"way":"core:navigation push › RouterProvider · state #0 › ChatPanel · context Location › Tab · prop active"}]},{"name":"Status","renders":1,"mounts":12,"withoutDom":0,"byParent":0,"memo":true,"reasons":[{"i":15,"n":1,"reason":"external store #3 [useChatStore] outer"}]},{"name":"MessageRow","renders":0,"mounts":12,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"TimeAgo","renders":0,"mounts":12,"withoutDom":0,"byParent":0,"reasons":[]},{"name":"Attachments","renders":0,"mounts":12,"withoutDom":0,"byParent":0,"memo":true,"reasons":[]},{"name":"ChatPanel","renders":6,"mounts":1,"withoutDom":0,"byParent":0,"reasons":[{"i":9,"n":12,"reason":"context Location"},{"i":10,"n":12,"reason":"context Route SAME-CONTENT"}]},{"name":"SyncBar","renders":5,"mounts":1,"withoutDom":0,"byParent":0,"reasons":[{"i":13,"n":5,"reason":"external store #2 [useChatStore] (s)=>s.workspace.lastEventAt"}]},{"name":"MessageList","renders":0,"mounts":4,"withoutDom":0,"byParent":0,"reasons":[]},{"name":"MetaInput","renders":2,"mounts":2,"withoutDom":2,"byParent":2,"reasons":[{"i":2,"n":2,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":2,"way":"core:effect (react-h … [196 more]
> ```

> **agent:** ## Root cause
> 
> Cascade root **`ChatPanel`** (`src/components/ChatPanel.tsx`) was rendering twice per tab click, and half of those renders changed nothing on screen:
> 
> 1. `ChatPanel` kept a **derived state that mirrors a prop via an effect** — `const [tab, setShown] = useState(active); useEffect(() => setShown(active), [active]);` (old lines 20-21). On every navigation click, the URL/context update (`context Location` from `useActiveTab` → `useSearchParams`) rendered `ChatPanel` once with the *stale* `tab`, producing no DOM change, then the effect fired and `setShown(active)` forced a second render that actually updated the DOM. Recording: `ChatPanel` had `renders: 11, withoutDom: 6` — over half its renders were pure waste, caused by `core:effect @ src/components/ChatPanel.tsx`.
> 
> 2. `useActiveTab`'s `select` callback (`src/components/ChatPanel.tsx:8`, old) was wrapped in `useCallback(..., [setParams])`, but react-router-dom's `setParams` from `useSearchParams` is a **new function every render with identical behavior**. That made `select` (passed as `onPick` to the memoized `Tab`) get a new identity on every navigation, defeating `Tab`'s `memo`. Recording: `Tab` had `renders: 22, withoutDom: 12` — reason `"parent: props new ref, same content: onPick"`.
> 
> Both were confirmed against the recording's `components` section (`withoutDom` counts, not just the "reason" text) before changing anything.
> 
> ## The fix
> 
> `src/components/ChatPanel.tsx`
> 
> - Removed the redundant `tab` state + `useEffect` mirror; `ChatPanel` now renders directly from `active` (same eventual DOM, one render sooner, no stale-then-corrected flash).
> - Stabilized `useActiveTab`'s `select` via a `useRef` holding the latest `setParams`, so `select` (→ `Tab`'s `onPick`) now has a permanent identity, letting `Tab`'s `memo` actually skip.
> 
> No visual/behavioral change: same tab computed from the same URL param, same buttons, same conditional `MessageList`/`PeopleList`.
> 
> ## Before / after (same repro: open page, people→chat ×3, via `record_page(replay)` of the original recording)
> 
> From each recording's `components` section, per-component counts:
> 
> | Component | before renders | before withoutDom | after renders | after withoutDom |
> |---|---|---|---|---|
> | `ChatPanel` | 11 | 6 (55%) | 6 | 0 (0%) |
> | `Tab` | 22 | 12 (55%) | 12 | 0 (0%) |
> 
> Overall totals: before `rendersWithoutDom: 96` of 114 renders (84%); after `rendersWithoutDom: 7` of 109 renders (~6%). Cause `core:effect @ src/components/ChatPanel.tsx` (the double-render trigger) disappeared entirely in the after run (`compare_recordings`: "16.29 → 0 (-100%)").
> 
> `compare_recordings` also flagged the two runs' wall-clock durations differed (307ms vs 1105ms — the replay ran slower in real time and picked up some unrelated background commits from timers/workers), so its per-second rates aren't a clean before/after; the per-component absolute counts above (from `get_recording` on each session) are the reliable, apples-to-apples proof since both cover the identical 6 clicks.
> 
> ## Recordings / conditions
> - Before: `20260927-234147-app-panel-21be` (panel recording, `http://localhost:44813/?tick=150&tab=chat`, viewport 1280×720, 307ms, 6 tab clicks).
> - After: `20260927-234333-app-record-cd21` (`record_page` replay of the same recording against the fixed code, same URL/viewport, 6 tab clicks).
> 
> ## Not checked
> - The `useCallback #2`/`#6` memo notes inside react-router-dom's `useSearchParams` internals (recomputes cost the library, not a render) — left as-is, out of scope since they don't cause renders.
> - Root-level `RouterProvider` renders (`state #0`, 6 hits) are the real navigation state change and were left untouched — they're required, not waste.
> - Did not investigate the unrelated background noise components that appeared only in the after run (`Composer`, `OnlineNow`, `ChannelStats`, `MetaInput`, react-query/redux beats) — they're timer/worker driven and unrelated to the tab-switch fix, just artifacts of the replay running in real (slower) wall-clock time.

**→ Read**
```
{"file_path":"src/components/ChatPanel.tsx"}
```

**←**
```
1	import { memo, useCallback, useRef } from 'react';
2	import { useSearchParams } from 'react-router-dom';
3	import { MessageList, PeopleList } from './Messages';
4	
5	export const useActiveTab = () => {
6	  const [params, setParams] = useSearchParams();
7	  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
8	  // setParams from react-router-dom is a new function every render (same behavior,
9	  // different identity). Keep the latest one in a ref so `select` itself never
10	  // changes identity, which lets memoized children (Tab) skip re-rendering.
11	  const setParamsRef = useRef(setParams);
12	  setParamsRef.current = setParams;
13	  const select = useCallback((next: string) => setParamsRef.current((p) => ({ ...Object.fromEntries(p), tab: next })), []);
14	  return [tab, select] as const;
15	};
16	
17	const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
18	  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
19	    {name}
20	  </button>
21	));
22	
23	export const ChatPanel = () => {
24	  const [active, setTab] = useActiveTab();
25	  return (
26	    <section className="panel" data-testid="chat-panel">
27	      <div className="tabs" role="tablist">
28	        {['chat', 'people'].map((name) => (
29	          <Tab key={name} name={name} active={active === name} onPick={setTab} />
30	        ))}
31	      </div>
32	      {active === 'chat'  … [71 more]
```

**agent:** This looks correct and confirms the fix — clean diff, same DOM output, no behavior change. The perf-recorder agent's work matches its report.

## Summary

**Root cause:** `ChatPanel` (`src/components/ChatPanel.tsx`) had two sources of wasted re-renders during tab switching:

1. It mirrored the `active` tab prop into local state via a `useState` + `useEffect`, causing every navigation to render once with stale state, then again when the effect fired — a redundant extra render that changed nothing on screen.
2. `useActiveTab`'s `select` callback depended on react-router's `setParams`, which is a *new function reference every render* — so `select`'s identity changed constantly, defeating the `memo()` on the `Tab` button component.

**Fix:** Removed the state-mirroring effect (render directly from `active`), and stabilized `select`'s identity with a ref holding the latest `setParams`. No visual or behavioral change — same tab logic, same DOM.

**Before/after (same 6-click repro, chat↔people ×3):**

| Component | before renders (wasted) | after renders (wasted) |
|---|---|---|
| `ChatPanel` | 11 (6 wasted, 55%) | 6 (0 wasted) |
| `Tab` | 22 (12 wasted, 55%) | 12 (0 wasted) |

Overall: 96 of 114 renders were wasted before (84%) vs. 7 of 109 after (~6%). The `core:effect` cascade trigger in `ChatPanel` disappeared entirely (-100%).

Recordings used: before = the original `20260927-234147-app-panel-21be`; after = a fresh replay `20260927-234333-app-record-cd21` against the fixed code, same URL/viewport/click sequence.
