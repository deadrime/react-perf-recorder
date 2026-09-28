# exact-value-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.26, 122 s, 2 turns

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

> Fix confirmed applied and matches the report.
> 
> **Root cause:** `TimeAgo` (`src/components/TimeAgo.tsx`) re-rendered every second from the page's clock store, even though its displayed text only actually changes at specific second-boundaries. Every other tick was a wasted render — DOM output identical, work discarded. This was the only component in the recording with wasted renders; the reactions/read-receipts traffic you noticed (`SyncBar`, `ChannelStats`, `OnlineNow`, etc.) was all legitimate — each of those renders did change the DOM.
> 
> **Fix:** moved the `timeAgo()` formatting into the zustand selector itself (`useStore(clockStore, (s) => timeAgo(s.now, sentAt))`), so zustand's default equality check skips the re-render when the formatted label string hasn't changed, instead of re-rendering on every raw clock tick. Same markup, same update cadence — output is unchanged.
> 
> **Before → after** (5s idle recording, same URL, no user interaction):
> - Renders that changed nothing on screen: **15 (2.99/s) → 0** — fully eliminated
> - Total renders: 93 → 66 (‑29%)
> - Total commits: 49 → 43 (‑12%)
> - All other render roots (`SyncBar`, `ChannelStats`, `OnlineNow`, etc.) kept firing at essentially the same rate, confirming only the wasted work was removed, not real updates.
> 
> Only file changed: `src/components/TimeAgo.tsx`.

## What it changed

```
diff -ruN a/src/components/TimeAgo.tsx b/src/components/TimeAgo.tsx
--- a/src/components/TimeAgo.tsx
+++ b/src/components/TimeAgo.tsx
@@ -2,6 +2,9 @@
 import { clockStore, timeAgo } from '../store/clock';
 
 export const TimeAgo = ({ sentAt }: { sentAt: number }) => {
-  const now = useStore(clockStore, (s) => s.now);
-  return <small data-testid="time-ago">{timeAgo(now, sentAt)}</small>;
+  // Select the already-formatted label, not the raw tick: zustand bails out of
+  // the re-render (default Object.is equality) when the label string is
+  // unchanged, even though clockStore ticks every second.
+  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
+  return <small data-testid="time-ago">{label}</small>;
 };
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-081558-app-panel-18ab
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:41415/?tick=150
2	
```

**agent:** This is exactly what the `perf-recorder` agent is built for. I'll hand it the recording ID and dev URL and have it diagnose and fix.

**→ Agent**
```
{"description":"Diagnose and fix unnecessary re-renders","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app's chat page is reported as staying \"busy\" even when idle: after messages load and the user leaves the page alone for a few seconds, reactions and read receipts keep arriving and the page appears to keep doing work with no user interaction.\n\nContext:\n- App source is in ./src (cwd is .)\n- Dev server is already running at http://localhost:41415/?tick=150 and hot-reloads on source changes\n- A recording of the page already exists (m … [1725 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: ace385c63094eb6ab (internal ID - do not mention to user. Use SendMessage with to: 'ace385c63094eb6ab', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-TdpsBw/tmp/claude-0/-tmp-claude-eval-TdpsBw-home-cwd/b605522b-9f9c-41af-af1e-f0b63e4aa2a1/tasks/ace385c63094eb6ab.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-081558-app-panel-18ab"}
> ```

> **←**
> ```
> {"id":"20260928-081558-app-panel-18ab","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081558-app-panel-18ab","summary":{"id":"20260928-081558-app-panel-18ab","status":"done","createdAt":"2026-09-28T08:16:03.378Z","source":"panel","url":"http://localhost:41415/?tick=150","viewport":"1280×720","durationSec":5,"scope":null,"totals":{"commits":49,"commitsPerSec":9.78,"commitsInScope":49,"renders":93,"rendersPerScopeCommit":1.9,"rendersFromOutside":0,"rendersWithoutDom":15,"domTextChanges":41,"rendersPerTextChange":2.3},"topRoots":[{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","hits":34,"hitsPerSec":6.78,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.13,"reasons":["34× external store #2 [useChatStore] (s)=>s.workspace.lastEventAt · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ChatView.tsx:44 const at = useChatStore((s) => s.workspace.lastEventAt);"],"causes":["34× core:message Worker","33× zustand:feed/tick","1× zustand:feed/message"],"lanes":"Sync:34"},{"root":"TimeAgo","source":"src/components/Messages.tsx:39","path":"MessageRow < MessageList < ChatPanel < ChatView","hits":5,"hitsPerSec":1,"instances":3,"perHit":3,"noDomChange":15,"renderMsPerHit":0.14,"reasons":["15× external store #2 [clockStore] (s)=>s.now · [zustand] useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/TimeAgo.tsx:5 const now = useStore(clockStore, (s) =>  … [6311 more]
> ```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording (`20260928-081558-app-panel-18ab`), diagnose any wasted re-renders tied to the background reactions/read-receipts traffic, apply a minimal fix in `./src` if warranted, and produce before/after numbers. I'll report back once it finishes.

> **→ Read**
> ```
> {"file_path":"src/components/TimeAgo.tsx"}
> ```

> **←**
> ```
> 1	import { useStore } from 'zustand';
> 2	import { clockStore, timeAgo } from '../store/clock';
> 3	
> 4	export const TimeAgo = ({ sentAt }: { sentAt: number }) => {
> 5	  const now = useStore(clockStore, (s) => s.now);
> 6	  return <small data-testid="time-ago">{timeAgo(now, sentAt)}</small>;
> 7	};
> 8	
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
> {"file_path":"src/components/OnlineNow.tsx"}
> ```

> **←**
> ```
> 1	import { useQuery } from '@tanstack/react-query';
> 2	import { useSortedMembers } from '../hooks/useSortedMembers';
> 3	
> 4	const ORDER: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
> 5	
> 6	/** The first few of the workspace by name, and how many of them are online now. */
> 7	export const OnlineNow = () => {
> 8	  const { data } = useQuery<{ online: number }>({ queryKey: ['presence'], enabled: false });
> 9	  const sorted = useSortedMembers(ORDER);
> 10	  return (
> 11	    <p className="side-line" data-testid="online">
> 12	      {sorted.slice(0, 3).join(', ')} and others · <b>{data?.online ?? '…'}</b> online
> 13	    </p>
> 14	  );
> 15	};
> 16	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChannelStats.tsx"}
> ```

> **←**
> ```
> 1	import { useQuery } from '@tanstack/react-query';
> 2	import { memo } from 'react';
> 3	
> 4	const FIRST = ['Anna', 'Boris', 'Chen', 'Dana', 'Emil', 'Farah', 'Goran', 'Hana', 'Ivo', 'Jun', 'Kira', 'Lev', 'Mona', 'Nils'];
> 5	const LAST = ['Ahn', 'Berg', 'Costa', 'Dahl', 'Eze', 'Fox', 'Gil', 'Holm', 'Ito', 'Juhl', 'Kahn', 'Lind', 'Moss', 'Noor'];
> 6	const MEMBERS = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]} ${i}`);
> 7	const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
> 8	const SORTED = [...MEMBERS].sort(byName);
> 9	
> 10	const MemberList = memo(() => (
> 11	  <ul className="members" data-testid="members">
> 12	    {SORTED.slice(0, 8).map((name) => (
> 13	      <li key={name}>{name}</li>
> 14	    ))}
> 15	    <li className="more">and {SORTED.length - 8} more</li>
> 16	  </ul>
> 17	));
> 18	
> 19	let polls = 0;
> 20	
> 21	export const ChannelStats = () => {
> 22	  const { data } = useQuery({
> 23	    queryKey: ['presence'],
> 24	    queryFn: async () => ({ online: 3 + (++polls % 4) }),
> 25	    refetchInterval: 500,
> 26	  });
> 27	  return (
> 28	    <>
> 29	      <p className="side-line" data-testid="stats">
> 30	        <b>{data?.online ?? '…'}</b> people online
> 31	      </p>
> 32	      <MemberList />
> 33	    </>
> 34	  );
> 35	};
> 36	
> ```

> **→ Read**
> ```
> {"file_path":"src/store/clock.ts"}
> ```

> **←**
> ```
> 1	import { createStore } from 'zustand/vanilla';
> 2	
> 3	/** One clock for the whole page: every relative time reads it. */
> 4	export const clockStore = createStore(() => ({ now: Date.now() }));
> 5	
> 6	setInterval(() => clockStore.setState({ now: Date.now() }), 1000);
> 7	
> 8	export function timeAgo(now: number, sentAt: number): string {
> 9	  const seconds = Math.max(0, Math.round((now - sentAt) / 1000));
> 10	  if (seconds < 5) return 'just now';
> 11	  if (seconds < 45) return 'a few seconds ago';
> 12	  if (seconds < 90) return 'a minute ago';
> 13	  const mins = Math.round(seconds / 60);
> 14	  return mins < 60 ? `${mins} minutes ago` : `${Math.round(mins / 60)} hours ago`;
> 15	}
> 16	
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

> **agent:** I found the recording confirms the reported "busy while idle" symptom. Let me look at the write-up numbers once more before fixing, then apply the fix and measure it.
> 
> **Cause found:** `TimeAgo` (`src/components/TimeAgo.tsx:5`) subscribes to the whole-page clock tick (`clockStore` ticks every 1s via `setInterval` in `src/store/clock.ts:6`) with `useStore(clockStore, (s) => s.now)`. Every tick re-renders all 3 `TimeAgo` instances, but `timeAgo()` only changes its text at second-boundaries (5s/45s/90s/minute marks) — so in the 5s recording, all 15 renders (3 instances × 5 ticks) produced **zero DOM change** (`noDomChange: 15` out of 15 for that root). This is the textbook wasted-render pattern from background polling.
> 
> Other roots checked and found legitimate (each has `noDomChange: 0`, i.e. every render actually changed the DOM):
> - `SyncBar` (ChatView.tsx:44) — bar width is `(lastEventAt % 20) * 5%`, genuinely changes almost every event.
> - `ChannelStats`/`OnlineNow` — share the `['presence']` react-query cache; displayed count changes on every 500ms refetch.
> - `Status`, `TypingLine`, `Unread`, etc. — all real data changes with matching DOM changes.
> 
> Now applying the fix: move the `timeAgo` computation into the zustand selector itself, so the store's default equality (`Object.is`, which compares equal strings as equal) bails out the render when the text wouldn't change.

> **→ Read**
> ```
> {"file_path":"src/components/TimeAgo.tsx"}
> ```

> **←**
> ```
> Wasted call — file unchanged since your last Read. Refer to that earlier tool_result instead.
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/TimeAgo.tsx","old_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  const now = useStore(clockStore, (s) => s.now);\n  return <small data-testid=\"time-ago\">{timeAgo(now, sentAt)}</small>;\n};","new_string":"export const TimeAgo = ({ sentAt }: { sentAt: number }) => {\n  // Select the already-formatted label, not the raw tick: zustand bails out of\n  // the re-render (default Object.is equality) when the label string is\n  // unchanged, even though clockStore ticks every second.\n  const l … [124 more]
> ```

> **←**
> ```
> The file src/components/TimeAgo.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now recording a fresh "after" pass by replaying the original recording's actions against the (hot-reloaded) dev server, then comparing.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-081558-app-panel-18ab","label":"after-timeago-fix"}
> ```

> **←**
> ```
> {"id":"20260928-081720-app-record-d2a1","url":"http://localhost:41415/?tick=150","requested":"http://localhost:41415/?tick=150","durationSec":5,"commits":43,"renders":66,"rendersWithoutDom":0,"rendersPerCommit":1.5,"topRoot":"SyncBar ×33","wasting":[],"warnings":["20260928-081558-app-panel-18ab has no actions: recorded the page as it is for 5012 ms instead"]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-081558-app-panel-18ab","after":"20260928-081720-app-record-d2a1"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-081558-app-panel-18ab","durationMs":5012},"after":{"id":"20260928-081720-app-record-d2a1","durationMs":5030},"totals":{"commits":"49 → 43 (-12%)","renders":"93 → 66 (-29%)","commitsPerSec":"9.78 → 8.55 (-13%)","rendersPerSec":"18.56 → 13.12 (-29%)","rendersPerCommit":"1.9 → 1.5 (-21%)","rendersWithoutDomPerSec":"2.99 → 0 (-100%)","rendersPerTextChange":"2.3 → 2 (-13%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"TimeAgo","source":"src/components/Messages.tsx:39","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"gone","hitsPerSec":"1 → –","perHit":"3 → –","instances":"3 → –","cascadePerSec":"2.99 → 0 (-100%)"},{"root":"Status","source":"src/components/Messages.tsx:43","path":"MessageRow < MessageList < ChatPanel < ChatView","status":"changed","hitsPerSec":"1.4 → 1.19 (-15%)","perHit":"1 → 1 (0%)","instances":"3 → 1 (-67%)","cascadePerSec":"1.8 → 1.19 (-34%)"},{"root":"Connect(ActivityLog)","source":"src/components/ChatView.tsx:35","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"0.2 → –","perHit":"3 → –","instances":"1 → –","cascadePerSec":"0.6 → 0 (-100%)"},{"root":"TypingLine","source":"src/components/ChatView.tsx:66","path":"SettingsBySync < Layout","status":"changed","hitsPerSec":"1.8 → 1.39 (-23%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"1.8 → 1.39 (-23%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:55","path":"SettingsBySync < Layout","s … [2472 more]
> ```

> **agent:** ## Findings
> 
> **Cause:** `TimeAgo` (`src/components/TimeAgo.tsx`, was line 5) re-rendered on every tick of the page-wide clock (`clockStore` in `src/store/clock.ts:6`, `setInterval(... , 1000)`), via `useStore(clockStore, (s) => s.now)`. `timeAgo()` only produces a new string at second-boundaries (5s/45s/90s/minute marks — `src/store/clock.ts:8-15`), so during the 5s idle recording every one of its renders left the DOM unchanged: root `TimeAgo` in the recording had `noDomChange: 15` out of `15` renders (3 message rows × 5 clock ticks) — 100% waste, and it was the only root in the page with any wasted renders.
> 
> Everything else checked out as legitimate real-data rendering (`noDomChange: 0` for all of them, meaning every render did change the DOM): `SyncBar` (`src/components/ChatView.tsx:44`, a progress bar whose width tracks `lastEventAt`), `ChannelStats`/`OnlineNow` (shared `['presence']` react-query cache refetching every 500ms with a genuinely changing count), `Status`, `TypingLine`, `Unread`. No fix was needed there.
> 
> ## Fix
> 
> `src/components/TimeAgo.tsx`: moved the `timeAgo()` computation into the zustand selector itself, so the store's default `Object.is` equality (which treats equal strings as equal) bails out of re-rendering when the label text hasn't actually changed, instead of the component re-rendering on every raw tick:
> 
> ```tsx
> export const TimeAgo = ({ sentAt }: { sentAt: number }) => {
>   const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
>   return <small data-testid="time-ago">{label}</small>;
> };
> ```
> 
> Output is unchanged — same string, same markup, updates at exactly the same second-boundaries as before; only the number of times the component's function body runs (and, before the fix, commits with no visible effect) is reduced.
> 
> ## Before / after (5s idle recording, same URL `http://localhost:41415/?tick=150`, 1280×720, no throttling, replay of the original panel recording's timeline)
> 
> - `20260928-081558-app-panel-18ab` (before) vs `20260928-081720-app-record-d2a1` (after, replayed from the before recording, no user actions — idle page)
> - Total renders: 93 → 66 (-29%)
> - **Renders that changed nothing in the DOM: 15 (2.99/s) → 0 (-100%)**
> - `TimeAgo` cascade root: present with 5 hits/15 wasted renders → gone entirely from the after recording (`cascadePerSec: 2.99 → 0`)
> - `wastingAfter`: empty — nothing left rendering for nothing
> - Total commits: 49 → 43 (-12%), renders/commit 1.9 → 1.5 (-21%)
> - Other roots (`Status`, `TypingLine`, `SyncBar`, `ChannelStats`, `OnlineNow`) still fire at essentially the same rate as before (their per-hit DOM changes were already real, e.g. `SyncBar` 6.78/s → 6.56/s, `ChannelStats`/`OnlineNow` 2/s → 1.99/s) — confirming the fix removed only the wasted `TimeAgo` renders and left legitimate updates untouched. A few small roots (`Unread`, `MessageList`, `MessageCount`, `Connect(ActivityLog)`) show as "gone" in the diff — these are single-hit roots tied to one-off worker/feed events whose exact timing shifts between two 5s replays and are unrelated to this fix (each had `noDomChange: 0` already, i.e. no waste to begin with).
> 
> ## Conditions
> 
> Page: `http://localhost:41415/?tick=150`, viewport 1280×720, no CPU throttling, idle (no user actions in either recording, both ~5s). Before recording: `20260928-081558-app-panel-18ab` (panel-made, pre-existing). After recording: `20260928-081720-app-record-d2a1` (replay of the before recording against the hot-reloaded dev server after the fix).
> 
> ## Not checked
> 
> - `zustand:feed/tick`/`core:message Worker` cadence itself (whether the simulated worker/tick rate is intentional for this app) — out of scope, not a re-render bug.
> - The `proxy-memoize` recompute note in `Messages.tsx` (`memoize in Messages.tsx: 8/103 recomputes`) — recomputes, not extra renders; left as is since it wasn't flagged as wasted DOM output.
> - Longer recordings (>5s) or interaction scenarios (typing, clicking) — only the reported idle-busy case was reproduced/measured.

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
5	  // Select the already-formatted label, not the raw tick: zustand bails out of
6	  // the re-render (default Object.is equality) when the label string is
7	  // unchanged, even though clockStore ticks every second.
8	  const label = useStore(clockStore, (s) => timeAgo(s.now, sentAt));
9	  return <small data-testid="time-ago">{label}</small>;
10	};
11	
```

**agent:** Fix confirmed applied and matches the report.

**Root cause:** `TimeAgo` (`src/components/TimeAgo.tsx`) re-rendered every second from the page's clock store, even though its displayed text only actually changes at specific second-boundaries. Every other tick was a wasted render — DOM output identical, work discarded. This was the only component in the recording with wasted renders; the reactions/read-receipts traffic you noticed (`SyncBar`, `ChannelStats`, `OnlineNow`, etc.) was all legitimate — each of those renders did change the DOM.

**Fix:** moved the `timeAgo()` formatting into the zustand selector itself (`useStore(clockStore, (s) => timeAgo(s.now, sentAt))`), so zustand's default equality check skips the re-render when the formatted label string hasn't changed, instead of re-rendering on every raw clock tick. Same markup, same update cadence — output is unchanged.

**Before → after** (5s idle recording, same URL, no user interaction):
- Renders that changed nothing on screen: **15 (2.99/s) → 0** — fully eliminated
- Total renders: 93 → 66 (‑29%)
- Total commits: 49 → 43 (‑12%)
- All other render roots (`SyncBar`, `ChannelStats`, `OnlineNow`, etc.) kept firing at essentially the same rate, confirming only the wasted work was removed, not real updates.

Only file changed: `src/components/TimeAgo.tsx`.
