# cost-over-count-rec, with the plugin, run 1

fixed (waste 0.42); checks 5 of 5; $0.28, 118 s, 3 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the idle page stutters about twice a second; scrolling the messages catches on it.
To reproduce: open the page, wait for the messages to load, then leave it alone for a few seconds.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> Both changes check out — small, targeted, and behavior-preserving. Summary:
> 
> **Root cause — two wasted re-render sources feeding the ~2/s stutter:**
> 
> 1. **`OnlineNow` (`src/components/OnlineNow.tsx`)** — the actual stutter. It called `useSortedMembers({ sensitivity: 'base', numeric: true })` with a fresh object literal every render, so the hook's internal `useMemo` never hit its cache and re-sorted a 1500-entry roster with `localeCompare` on every tick — 54ms of wasted work each time, matching the observed long tasks.
> 2. **`Unread` (`src/components/Header.tsx`)** — subscribed to the whole `workspace` store slice via `selectWorkspace`, which changes its reference on every worker tick even though the `unread` count itself rarely changes, causing 33 no-op renders in 5s.
> 
> **Fix (no visible/behavioral change):**
> - Hoisted the collator-options object to a module-level constant `MEMBER_ORDER` so the memo dependency is stable.
> - Switched `Unread` to the existing narrow selector `selectUnread` instead of `selectWorkspace`.
> 
> **Before → after (same recording setup, ~5s idle):**
> | Metric | Before | After |
> |---|---|---|
> | Total renders | 111 | 66 |
> | No-op renders (no DOM change) | 33 | 0 |
> | `OnlineNow` render cost | 54.12ms | 0.58ms |
> | Longest task | 85ms | 0ms |
> | Worst frame | 86ms | 0ms |
> 
> Both roots disappear from the recorder's "wasting" list after the fix, and the long tasks causing the visible stutter are gone.

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
diff -ruN a/src/components/OnlineNow.tsx b/src/components/OnlineNow.tsx
--- a/src/components/OnlineNow.tsx
+++ b/src/components/OnlineNow.tsx
@@ -1,10 +1,12 @@
 import { useQuery } from '@tanstack/react-query';
 import { useSortedMembers } from '../hooks/useSortedMembers';
 
+const MEMBER_ORDER: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
+
 /** The first few of the workspace by name, and how many of them are online now. */
 export const OnlineNow = () => {
   const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
-  const sorted = useSortedMembers({ sensitivity: 'base', numeric: true });
+  const sorted = useSortedMembers(MEMBER_ORDER);
   return (
     <p className="side-line" data-testid="online">
       {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-081316-app-panel-1721
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:46591/?tick=150
2	
```

**agent:** This matches the react-perf-recorder skill exactly — I'll delegate to the perf-recorder agent to analyze the recording, find the root cause, apply a fix in ./src, and produce before/after numbers.

**→ Agent**
```
{"description":"Diagnose and fix idle-page re-render stutter","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app's dev server is running at http://localhost:46591/?tick=150 (see ./dev-url.txt), source in ./src.\n\nComplaint: the idle page stutters about twice a second; scrolling the messages list catches on it. Repro: open the page, wait for messages to load, then leave it alone for a few seconds (no user interaction) — the stutter happens even while idle.\n\nThere's already an existing recording captured via the page's recorder panel, id: 20260928-081316-app-panel-1721  … [1608 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: ad61b19a0510eb23f (internal ID - do not mention to user. Use SendMessage with to: 'ad61b19a0510eb23f', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-TrdQRu/tmp/claude-0/-tmp-claude-eval-TrdQRu-home-cwd/fdd70e54-0419-474f-a174-97253b6df0ad/tasks/ad61b19a0510eb23f.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording, find any wasted re-renders behind the idle-page stutter, fix them in `./src` without changing visible behavior, and produce before/after numbers. I'll report back once it finishes.

> **→ rpr:get_recording**
> ```
> {"id":"20260928-081316-app-panel-1721"}
> ```

> **←**
> ```
> {"id":"20260928-081316-app-panel-1721","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081316-app-panel-1721","summary":{"id":"20260928-081316-app-panel-1721","status":"done","createdAt":"2026-09-28T08:13:21.632Z","source":"panel","url":"http://localhost:46591/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":44,"commitsPerSec":8.77,"commitsInScope":44,"renders":111,"rendersPerScopeCommit":2.5,"rendersFromOutside":0,"rendersWithoutDom":33,"domTextChanges":41,"rendersPerTextChange":2.7},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.09,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":33,"renderMsPerHit":0.04,"reasons":["34× external store #2 [useChatStore] selectWorkspace · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/Header.tsx:11 const workspace = useChatStore … [5795 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/OnlineNow.tsx"}
> ```

> **←**
> ```
> 1	import { useQuery } from '@tanstack/react-query';
> 2	import { useSortedMembers } from '../hooks/useSortedMembers';
> 3	
> 4	/** The first few of the workspace by name, and how many of them are online now. */
> 5	export const OnlineNow = () => {
> 6	  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
> 7	  const sorted = useSortedMembers({ sensitivity: 'base', numeric: true });
> 8	  return (
> 9	    <p className="side-line" data-testid="online">
> 10	      {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
> 11	    </p>
> 12	  );
> 13	};
> 14	
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

> **→ Read**
> ```
> {"file_path":"src/hooks/useSortedMembers.ts"}
> ```

> **←**
> ```
> 1	import { useMemo } from 'react';
> 2	import { ROSTER, sortMembers } from '../lib/members';
> 3	
> 4	export function useSortedMembers(order: Intl.CollatorOptions) {
> 5	  return useMemo(() => sortMembers(ROSTER, order), [order]);
> 6	}
> 7	
> ```

> **→ Read**
> ```
> {"file_path":"src/lib/members.ts"}
> ```

> **←**
> ```
> 1	const FIRST = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ida', 'Jo', 'Kai', 'Liv', 'Max', 'Nia'];
> 2	const LAST = ['Ames', 'Bell', 'Cole', 'Dunn', 'Enns', 'Ford', 'Gray', 'Hart', 'Ives', 'Jett', 'Kerr', 'Lowe', 'Mace', 'Nash'];
> 3	
> 4	/** Everyone in the workspace. */
> 5	export const ROSTER = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 5) % FIRST.length]} ${LAST[(i * 3) % LAST.length]} ${i}`);
> 6	
> 7	export function sortMembers(names: string[], order: Intl.CollatorOptions): string[] {
> 8	  return [...names].sort((a, b) => a.localeCompare(b, 'en', order));
> 9	}
> 10	
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"import { selectWorkspace } from '../store/selectors';\nimport { ChannelTopic } from './ChannelTopic';\nimport { TimezoneBadge } from './Settings';\nimport { TypingBadge } from './TypingBadge';\nimport Workspace from './Workspace';\n\nconst Unread = () => {\n  const workspace = useChatStore(selectWorkspace);\n  return (\n    <span className=\"badge\" data-testid=\"unread\">\n      {workspace.unread} unread\n    </span>\n  );\n};","new_string":"import { selectUnread } from '../store/select … [369 more]
> ```

> **←**
> ```
> The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now fix the OnlineNow / useSortedMembers unstable options object.

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/OnlineNow.tsx","old_string":"import { useQuery } from '@tanstack/react-query';\nimport { useSortedMembers } from '../hooks/useSortedMembers';\n\n/** The first few of the workspace by name, and how many of them are online now. */\nexport const OnlineNow = () => {\n  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });\n  const sorted = useSortedMembers({ sensitivity: 'base', numeric: true });","new_string":"import { useQuery } from '@tanstack/react-query';\nimport { useSortedM … [395 more]
> ```

> **←**
> ```
> The file src/components/OnlineNow.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-081316-app-panel-1721","label":"after-fix"}
> ```

> **←**
> ```
> {"id":"20260928-081422-app-record-58e8","url":"http://localhost:46591/?tick=150","requested":"http://localhost:46591/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-081316-app-panel-1721 has no actions: recorded the page as it is for 5015 ms instead"]}
> ```

> **agent:** Renders dropped from 111 to 66, wasted no-DOM renders from 33 to 0, and `wasting` is now empty. Let's compare directly against the original recording for full numbers.

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-081316-app-panel-1721","after":"20260928-081422-app-record-58e8"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-081316-app-panel-1721","durationMs":5015},"after":{"id":"20260928-081422-app-record-58e8","durationMs":5035},"totals":{"commits":"44 → 43 (-2%)","renders":"111 → 66 (-41%)","commitsPerSec":"8.77 → 8.54 (-3%)","rendersPerSec":"22.13 → 13.11 (-41%)","rendersPerCommit":"2.5 → 1.5 (-40%)","rendersWithoutDomPerSec":"6.58 → 0 (-100%)","rendersPerTextChange":"2.7 → 2 (-26%)","longTaskMaxMs":"85 → 0 (-100%)"},"roots":[{"root":"Unread","source":"src/components/Header.tsx:32","path":"Header < SettingsBySync < Layout","status":"gone","hitsPerSec":"6.78 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.78 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.79 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.79 → 1.39 (-22%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.79 → 1.39 (-22%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","statu … [2202 more]
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-081422-app-record-58e8"}
> ```

> **←**
> ```
> {"id":"20260928-081422-app-record-58e8","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081422-app-record-58e8","summary":{"id":"20260928-081422-app-record-58e8","status":"done","createdAt":"2026-09-28T08:14:27.798Z","label":"after-fix","source":"script:record","url":"http://localhost:46591/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":43,"commitsPerSec":8.54,"commitsInScope":43,"renders":66,"rendersPerScopeCommit":1.5,"rendersFromOutside":0,"rendersWithoutDom":0,"domTextChanges":33,"rendersPerTextChange":2},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":33,"hitsPerSec":6.55,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.13,"reasons":["33× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["33× zustand:feed/tick","33× core:message Worker"],"lanes":"Sync:33"},{"root":"ChannelStats","source":"src/components/ChatView.tsx:30","path":"ChatView < SettingsBySync < Layout","hits":10,"hitsPerSec":1.99,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.23,"reasons":["10× external store #3 · [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ChannelStats.tsx:22 const { data } = useQuery({"],"causes":["10× react-query:fetch → su … [3364 more]
> ```

> **agent:** ## Root cause
> 
> Two components were re-rendering for nothing during idle, both cascading from the same ~150ms worker tick (`?tick=150`) and driving the ~2/s stutter:
> 
> **1. `OnlineNow` — expensive wasted recompute (the stutter itself)**
> - Root: `OnlineNow` at `src/components/ChatView.tsx:32`, component in `src/components/OnlineNow.tsx:7` (was line 7, now line 8).
> - Reason: `useSortedMembers({ sensitivity: 'base', numeric: true })` passed a **new object literal every render**. The `useMemo` inside `useSortedMembers` (`src/hooks/useSortedMembers.ts:5`) depends on that object, so it never memoized and re-sorted the 1500-entry `ROSTER` (`src/lib/members.ts:5`) with `localeCompare` on every render — 10 times over 5s, **54.12ms each**, matching the "twice a second" stutter and the recording's long tasks (`frames.longTasks: 5`, `maxLongTaskMs: 85`, `worstFrameMs: 86`). The recorder's own memo diagnostic flagged it: *"`order` is a new object with the same content every time"*. The sorted list content never actually changes (static roster), so this work was 100% wasted.
> - Fix: hoisted the options object to a module-level constant `MEMBER_ORDER` in `src/components/OnlineNow.tsx:4`, so the memo dependency is stable and the sort only ever runs once.
> 
> **2. `Unread` — over-subscribed selector (cheap but a genuine wasted-render root)**
> - Root: `Unread` at `src/components/Header.tsx:32` (formerly, now removed as a root).
> - Reason: `useChatStore(selectWorkspace)` (`src/store/selectors.ts:4`, used at old `Header.tsx:11`) subscribed to the *entire* `workspace` object. `workspace.lastEventAt` changes on every worker tick, so the object reference changed 34 times/5s even though `workspace.unread` (the only field rendered) stayed the same in 33 of those 34 renders — recorded `noDomChange: 33`.
> - Fix: switched to the already-existing narrow selector `selectUnread = (s) => s.workspace.unread` (`src/store/selectors.ts:5`) in `src/components/Header.tsx`, so zustand's default equality check skips the re-render when `unread` hasn't changed.
> 
> ## What changed
> 
> - `src/components/Header.tsx`: `Unread` now uses `selectUnread` instead of `selectWorkspace`; renders `{unread}` instead of `{workspace.unread}`. No visible/behavioral change — same number displayed, same conditions.
> - `src/components/OnlineNow.tsx`: extracted `MEMBER_ORDER` constant outside the component instead of a fresh literal per render; `useSortedMembers(MEMBER_ORDER)`. Same sort options, same output, same behavior.
> 
> ## Before / after (compare_recordings, before = `20260928-081316-app-panel-1721`, after = fresh replay `20260928-081422-app-record-58e8`, same URL `http://localhost:46591/?tick=150`, viewport 1280×720, ~5s idle each)
> 
> | Metric | Before | After | Δ |
> |---|---|---|---|
> | Total renders | 111 | 66 | -41% |
> | Renders with no DOM change | 33 (6.58/s) | 0 | -100% |
> | `Unread` cascade root | 34 hits/5s, 33 no-op | gone entirely | — |
> | `OnlineNow` renderMsPerHit | 54.12ms | 0.58ms | -99% |
> | Longest task | 85ms | 0ms | -100% |
> | Worst frame | 86ms | 0ms | -100% |
> | `wastingAfter` (recorder's own verdict) | — | `[]` | nothing left wasting |
> 
> The `Unread` root disappearing from the cascade-root list, `rendersWithoutDom` going to zero, and `longTaskMaxMs`/`worstFrameMs` going to 0 together confirm both the cheap-but-wasteful selector and the expensive wasted sort were the causes, and that the stutter (long tasks) is gone. A few other roots (`Connect(ActivityLog)`, `MessageList`, `MessageCount`) appear/disappear between runs — that's normal run-to-run variance in the simulated worker's random events, unrelated to the fix (their `hitsPerSec` were already ≤0.2, i.e. one-off, in the original recording).
> 
> ## What's left / not checked
> 
> - `SyncBar`'s and `TypingLine`'s internal `useMemo` recomputing every render is flagged by the recorder as a library-internal (zustand `useBoundStore`/`useStore`) artifact, not a real render — explicitly noted as fine unless the selector body itself is expensive; it is a trivial property read here, so left as is.
> - Did not investigate `ChannelStats`/`ChannelTopic`/other roots beyond the top of the list; their `noDomChange` was already 0 (real, visible updates), so no evidence of waste there.
> - Did not re-run with `throttle` or a longer duration; both recordings used the default (no CPU throttle, ~5s), matching the original panel recording's conditions.
> - Did not test other viewports or logged-out states — out of scope for this idle-stutter repro.

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
{"file_path":"src/components/OnlineNow.tsx"}
```

**←**
```
1	import { useQuery } from '@tanstack/react-query';
2	import { useSortedMembers } from '../hooks/useSortedMembers';
3	
4	const MEMBER_ORDER: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
5	
6	/** The first few of the workspace by name, and how many of them are online now. */
7	export const OnlineNow = () => {
8	  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
9	  const sorted = useSortedMembers(MEMBER_ORDER);
10	  return (
11	    <p className="side-line" data-testid="online">
12	      {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
13	    </p>
14	  );
15	};
16	
```

**agent:** Both changes check out — small, targeted, and behavior-preserving. Summary:

**Root cause — two wasted re-render sources feeding the ~2/s stutter:**

1. **`OnlineNow` (`src/components/OnlineNow.tsx`)** — the actual stutter. It called `useSortedMembers({ sensitivity: 'base', numeric: true })` with a fresh object literal every render, so the hook's internal `useMemo` never hit its cache and re-sorted a 1500-entry roster with `localeCompare` on every tick — 54ms of wasted work each time, matching the observed long tasks.
2. **`Unread` (`src/components/Header.tsx`)** — subscribed to the whole `workspace` store slice via `selectWorkspace`, which changes its reference on every worker tick even though the `unread` count itself rarely changes, causing 33 no-op renders in 5s.

**Fix (no visible/behavioral change):**
- Hoisted the collator-options object to a module-level constant `MEMBER_ORDER` so the memo dependency is stable.
- Switched `Unread` to the existing narrow selector `selectUnread` instead of `selectWorkspace`.

**Before → after (same recording setup, ~5s idle):**
| Metric | Before | After |
|---|---|---|
| Total renders | 111 | 66 |
| No-op renders (no DOM change) | 33 | 0 |
| `OnlineNow` render cost | 54.12ms | 0.58ms |
| Longest task | 85ms | 0ms |
| Worst frame | 86ms | 0ms |

Both roots disappear from the recorder's "wasting" list after the fix, and the long tasks causing the visible stutter are gone.
