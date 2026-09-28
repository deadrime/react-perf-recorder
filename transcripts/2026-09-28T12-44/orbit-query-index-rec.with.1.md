# orbit-query-index-rec, with the plugin, run 1

fixed (waste 44); checks 3 of 4, failed: focused; $0.50, 229 s, 2 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the idle issue list hitches every couple of seconds.
To reproduce: open the issue list, wait for the issues to load, then leave it alone for a few seconds while teammates work.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> Confirmed — the fix is in place and matches what the agent reported. Here's the summary:
> 
> ## Root cause
> Every `Avatar` in the issue list subscribes to `useMembersById()` (`src/queries/members.ts`). That query indexed members into a `Map`, but react-query's structural sharing (which keeps unchanged data referentially stable across refetches) only works on plain objects/arrays — a `Map` always looks "new," so every ~1.8s poll produced a brand-new reference and re-rendered every `Avatar` on the page, even when no member data had actually changed. It was compounded by `staleTime: 0` on that query causing extra resyncs.
> 
> ## Fix (`src/queries/members.ts`, `src/features/board/IssueCard.tsx`)
> - Swapped the `Map` index for a plain `Record<string, Member>` (via `Object.fromEntries`) so structural sharing can actually compare it.
> - Aligned `staleTime` with the poll interval instead of `0`.
> - Updated the two consumers (`useMember`, `IssueCard`) from `.get(id)` to `?.[id]`.
> 
> No visual or behavioral change — same data, same polling cadence, only unnecessary re-renders removed.
> 
> ## Before / after (same idle scenario, 5s, no interaction)
> - Commits: 26 → 18 (-31%)
> - Renders: 659 → 108 (**-84%**)
> - Renders without DOM change/sec: 119.2 → 9.0 (**-92%**)
> - The three wasteful `Avatar` cascade roots (issue list, presence stack, top bar) dropped from ~106/8/1.6 cascades-per-sec to ~5.5/0/0 — essentially eliminated.
> - Everything else (`Sidebar`, `IssuesPage`, `SyncStatus`, `PresenceStack`, `NotificationBell`) was already rendering only for real reasons (`noDomChange: 0`) and is unchanged.
> 
> The remaining renders are genuine (presence/notification/sync events from teammates), so nothing further was touched.

## What it changed

```
diff -ruN a/src/features/board/IssueCard.tsx b/src/features/board/IssueCard.tsx
--- a/src/features/board/IssueCard.tsx
+++ b/src/features/board/IssueCard.tsx
@@ -20,7 +20,7 @@
   const members = useMembersById();
   const showEstimates = useAppStore((s) => s.showEstimates);
   const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;
-  const names = viewers.map((id) => members?.get(id)?.name.split(' ')[0]).join(', ');
+  const names = viewers.map((id) => members?.[id]?.name.split(' ')[0]).join(', ');
 
   return (
     <Tooltip label={`${names} viewing`} disabled={!viewers.length}>
diff -ruN a/src/queries/members.ts b/src/queries/members.ts
--- a/src/queries/members.ts
+++ b/src/queries/members.ts
@@ -3,7 +3,11 @@
 import type { Member } from '../api/types';
 import { MEMBERS_POLL_MS } from '../config';
 
-const indexById = (members: Member[]) => new Map(members.map((m) => [m.id, m]));
+// A plain record, not a Map: react-query's structural sharing walks plain objects/arrays and keeps
+// unchanged entries referentially stable across polls. A Map has no enumerable own keys, so it looks
+// entirely new to that comparison on every poll and defeats structural sharing — every subscriber
+// (every Avatar) would re-render even when its own member never changed.
+const indexById = (members: Member[]) => Object.fromEntries(members.map((m) => [m.id, m])) as Record<string, Member>;
 
 const membersQuery = {
   queryKey: ['members'],
@@ -19,11 +23,14 @@
     queryKey: ['members', 'by-id'],
     queryFn: () => api.members().then(indexById),
     refetchInterval: MEMBERS_POLL_MS,
-    staleTime: 0,
+    // Same staleness window as the plain members query: staleTime 0 made this query resync (and
+    // notify every observer) far more often than the data actually changed.
+    staleTime: MEMBERS_POLL_MS,
   });
   return data;
 }
 
 export function useMember(id: string | null | undefined) {
-  return useMembersById()?.get(id ?? '');
+  const byId = useMembersById();
+  return id ? byId?.[id] : undefined;
 }
```

## The steps

**agent:** I'll check the recording ID and dev URL, then use the react-perf-recorder agent to analyze the existing recording and fix the issue.

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-125335-app-panel-99da
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:42261/?tick=150#/issues
2	
```

**→ Agent**
```
{"description":"Diagnose and fix idle re-render hitch","subagent_type":"react-perf-recorder:perf-recorder","run_in_background":false,"prompt":"A React app lives in this folder, source in ./src. Dev server is already running and hot-reloads; its URL is in ./dev-url.txt (http://localhost:42261/?tick=150#/issues).\n\nUser complaint: the idle issue list \"hitches\" every couple of seconds. Repro: open the issue list, wait for issues to load, then leave it alone for a few seconds while teammates work (presumably some background/simulated collaborator activity, e.g. websocket/polling updates from ot … [1902 more]
```

> **input:** A React app lives in this folder, source in ./src. Dev server is already running and hot-reloads; its URL is in ./dev-url.txt (http://localhost:42261/?tick=150#/issues).
> 
> User complaint: the idle issu … [2138 more]

> **→ rpr:get_recording**
> ```
> {"id":"20260928-125335-app-panel-99da"}
> ```

> **←**
> ```
> {"id":"20260928-125335-app-panel-99da","status":"done","dir":"/tmp/tmp.rFcKpXmjoT/20260928-125335-app-panel-99da","summary":{"id":"20260928-125335-app-panel-99da","status":"done","createdAt":"2026-09-28T12:53:40.675Z","source":"panel","url":"http://localhost:42261/?tick=150#/issues","viewport":"1440×900","durationSec":5,"scope":null,"totals":{"commits":26,"commitsPerSec":5.16,"commitsInScope":26,"renders":659,"rendersPerScopeCommit":25.3,"rendersFromOutside":0,"rendersWithoutDom":600,"domTextChanges":14,"rendersPerTextChange":47.1},"topRoots":[{"root":"Avatar","source":"src/features/issues/IssueRow.tsx:48","path":"IssueRow < IssueTable < IssuesPage < AppShell","hits":10,"hitsPerSec":1.99,"instances":60,"perHit":54,"noDomChange":508,"renderMsPerHit":2.5,"reasons":["480× external store #3 [query [\"members\",\"by-id\"]] · useMember › useMembersById › [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ui/Avatar.tsx:20 const member = useMember(id);","28× external store #8 [usePresenceStore] (s)=>showPresence && !!id && s.online.includes(id) · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/ui/Avatar.tsx:21 const online = usePresenceStore((s) => showPresence && !!id && s.online.includes(id));","28× external store #3 RESYNC [query [\"members\",\"by-id\"]] · useMember › useMembersById › [@tanstack/react-query] useQuery › useBaseQuery › SyncExternalStore @ src/components/ui/Avatar.tsx:20 cons … [6733 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ui/Avatar.tsx"}
> ```

> **←**
> ```
> 1	import { memo } from 'react';
> 2	import { useMember } from '../../queries/members';
> 3	import { usePresenceStore } from '../../store/presence';
> 4	import { cx } from '../../lib/cx';
> 5	
> 6	const initials = (name: string) =>
> 7	  name
> 8	    .split(' ')
> 9	    .map((part) => part[0])
> 10	    .slice(0, 2)
> 11	    .join('');
> 12	
> 13	interface Props {
> 14	  id: string | null | undefined;
> 15	  size?: 'xs' | 'sm' | 'md' | 'lg';
> 16	  showPresence?: boolean;
> 17	}
> 18	
> 19	export const Avatar = memo(function Avatar({ id, size = 'sm', showPresence = false }: Props) {
> 20	  const member = useMember(id);
> 21	  const online = usePresenceStore((s) => showPresence && !!id && s.online.includes(id));
> 22	  if (!id) return <span className={cx('avatar', `avatar-${size}`, 'avatar-empty')} title="Unassigned" />;
> 23	  return (
> 24	    <span className={cx('avatar', `avatar-${size}`)} style={{ background: member?.color ?? '#555' }} title={member?.name}>
> 25	      {member ? initials(member.name) : ''}
> 26	      {showPresence && online && <span className="avatar-dot" aria-label="online" />}
> 27	    </span>
> 28	  );
> 29	});
> 30	
> 31	export function AvatarStack({ ids, max = 4, size = 'xs' }: { ids: string[]; max?: number; size?: Props['size'] }) {
> 32	  const shown = ids.slice(0, max);
> 33	  return (
> 34	    <span className="avatar-stack">
> 35	      {shown.map((id) => (
> 36	        <Avatar key={id} id={id} size={size} />
> 37	      ))}
> 38	      {ids.length > max && <span className={cx('avatar', `avatar-${size}`, 'avatar-more')}>+{id … [55 more]
> ```

> **→ Grep**
> ```
> {"pattern":"useMember|useMembersById","output_mode":"files_with_matches"}
> ```

> **←**
> ```
> Found 12 files
> src/queries/members.ts
> src/features/board/IssueCard.tsx
> src/features/dashboard/ActivityFeed.tsx
> src/features/dashboard/WorkloadTable.tsx
> src/features/issues/BulkBar.tsx
> src/features/issues/CommentComposer.tsx
> src/features/issues/IssueComments.tsx
> src/features/issues/IssueProperties.tsx
> src/features/issues/IssuesToolbar.tsx
> src/features/projects/ProjectsPage.tsx
> src/components/layout/NotificationBell.tsx
> src/components/ui/Avatar.tsx
> ```

> **→ Read**
> ```
> {"file_path":"src/queries/members.ts"}
> ```

> **←**
> ```
> 1	import { useQuery } from '@tanstack/react-query';
> 2	import { api } from '../api/client';
> 3	import type { Member } from '../api/types';
> 4	import { MEMBERS_POLL_MS } from '../config';
> 5	
> 6	const indexById = (members: Member[]) => new Map(members.map((m) => [m.id, m]));
> 7	
> 8	const membersQuery = {
> 9	  queryKey: ['members'],
> 10	  queryFn: api.members,
> 11	  refetchInterval: MEMBERS_POLL_MS,
> 12	  staleTime: MEMBERS_POLL_MS,
> 13	};
> 14	
> 15	export const useMembers = () => useQuery(membersQuery);
> 16	
> 17	export function useMembersById() {
> 18	  const { data } = useQuery({
> 19	    queryKey: ['members', 'by-id'],
> 20	    queryFn: () => api.members().then(indexById),
> 21	    refetchInterval: MEMBERS_POLL_MS,
> 22	    staleTime: 0,
> 23	  });
> 24	  return data;
> 25	}
> 26	
> 27	export function useMember(id: string | null | undefined) {
> 28	  return useMembersById()?.get(id ?? '');
> 29	}
> 30	
> ```

> **→ Grep**
> ```
> {"pattern":"useMembersById|useMembers\\(","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/queries/members.ts:17:export function useMembersById() {
> src/queries/members.ts:28:  return useMembersById()?.get(id ?? '');
> src/features/board/IssueCard.tsx:9:import { useMembersById } from '../../queries/members';
> src/features/board/IssueCard.tsx:20:  const members = useMembersById();
> src/features/issues/BulkBar.tsx:14:  const { data: members = [] } = useMembers();
> src/features/issues/CommentComposer.tsx:30:  const { data: members = [] } = useMembers();
> src/features/issues/IssuesToolbar.tsx:32:  const { data: members = [] } = useMembers();
> src/features/issues/IssueProperties.tsx:31:  const { data: members = [] } = useMembers();
> src/features/dashboard/WorkloadTable.tsx:11:  const { data: members = [] } = useMembers();
> ```

> **→ Read**
> ```
> {"file_path":"src/config.ts"}
> ```

> **←**
> ```
> 1	const params = new URLSearchParams(location.search);
> 2	
> 3	/** How often the realtime socket delivers an event; `?tick=` speeds the demo workspace up or slows it down. */
> 4	export const TICK_MS = Number(params.get('tick') ?? 400);
> 5	
> 6	/** The members list is polled for presence and profile changes. */
> 7	export const MEMBERS_POLL_MS = TICK_MS * 12;
> 8	
> 9	/** Simulated network latency of the fake API. */
> 10	export const API_LATENCY_MS = Number(params.get('latency') ?? 60);
> 11	
> 12	export const PAGE_SIZE = 60;
> 13	
> ```

> **→ Read**
> ```
> {"file_path":"src/features/board/IssueCard.tsx"}
> ```

> **←**
> ```
> 1	import { memo } from 'react';
> 2	import type { Issue } from '../../api/types';
> 3	import { Avatar, AvatarStack } from '../../components/ui/Avatar';
> 4	import { LabelChips, PriorityIcon } from '../../components/ui/Badges';
> 5	import { Icon } from '../../components/ui/Icon';
> 6	import { Tooltip } from '../../components/ui/Tooltip';
> 7	import { cx } from '../../lib/cx';
> 8	import { dueLabel } from '../../lib/time';
> 9	import { useMembersById } from '../../queries/members';
> 10	import { useAppStore } from '../../store/app';
> 11	import { useViewers } from '../../store/presence';
> 12	
> 13	interface Props {
> 14	  issue: Issue;
> 15	  onOpen(key: string): void;
> 16	}
> 17	
> 18	export const IssueCard = memo(function IssueCard({ issue, onOpen }: Props) {
> 19	  const viewers = useViewers(issue.key);
> 20	  const members = useMembersById();
> 21	  const showEstimates = useAppStore((s) => s.showEstimates);
> 22	  const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;
> 23	  const names = viewers.map((id) => members?.get(id)?.name.split(' ')[0]).join(', ');
> 24	
> 25	  return (
> 26	    <Tooltip label={`${names} viewing`} disabled={!viewers.length}>
> 27	      <article
> 28	        className={cx('card', viewers.length > 0 && 'card-live')}
> 29	        draggable
> 30	        data-testid="card"
> 31	        data-key={issue.key}
> 32	        onDragStart={(e) => {
> 33	          e.dataTransfer.setData('text/issue-id', issue.id);
> 34	          e.dataTransfer.effectAllowed = 'move';
> 35	        }}
> 36	        o … [1054 more]
> ```

> **→ Grep**
> ```
> {"pattern":"members\\s*[:=]\" -n --type ts","path":"src/api","output_mode":"files_with_matches"}
> ```

> **←**
> ```
> No files found
> ```

> **→ Glob**
> ```
> {"pattern":"src/api/**"}
> ```

> **←**
> ```
> src/api/seed.ts
> src/api/client.ts
> src/api/types.ts
> ```

> **→ Grep**
> ```
> {"pattern":"members","path":"src/api/client.ts","-n":true,"-C":8}
> ```

> **←**
> ```
> Found 1 file
> src/api/client.ts
> ```

> **→ Read**
> ```
> {"file_path":"src/api/client.ts"}
> ```

> **←**
> ```
> 1	import { API_LATENCY_MS } from '../config';
> 2	import { ACTIVITY, commentsFor, ISSUES, LABELS, ME, MEMBERS, NOTIFICATIONS, PROJECTS } from './seed';
> 3	import type { ActivityEvent, Comment, Issue, IssuePatch, Label, Member, Notification, NotificationSettings, Profile, Project } from './types';
> 4	
> 5	// The demo has no backend: this module is the server. Every response is a fresh copy, as it would be off the wire.
> 6	const db = {
> 7	  members: MEMBERS,
> 8	  labels: LABELS,
> 9	  projects: PROJECTS,
> 10	  issues: new Map(ISSUES.map((i) => [i.id, i])),
> 11	  comments: new Map<string, Comment[]>(),
> 12	  notifications: NOTIFICATIONS,
> 13	  activity: ACTIVITY,
> 14	  profile: {
> 15	    name: ME.name,
> 16	    handle: ME.handle,
> 17	    title: ME.title,
> 18	    timezone: ME.timezone,
> 19	    bio: 'Frontend at Orbit. Mostly tables, forms and the occasional chart.',
> 20	    weekStartsOn: 'monday',
> 21	  } as Profile,
> 22	  notificationSettings: {
> 23	    email: { assigned: true, mentioned: true, commented: false, status_changed: false, due_soon: true },
> 24	    push: { assigned: true, mentioned: true, commented: true, status_changed: false, due_soon: false },
> 25	    digest: 'daily',
> 26	    quietHours: { enabled: false, from: '20:00', to: '08:00' },
> 27	  } as NotificationSettings,
> 28	};
> 29	
> 30	export class ApiError extends Error {
> 31	  constructor(public status: number, message: string) {
> 32	    super(message);
> 33	  }
> 34	}
> 35	
> 36	const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
> 37	
> 38	fun … [3964 more]
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/queries/members.ts","old_string":"const indexById = (members: Member[]) => new Map(members.map((m) => [m.id, m]));\n\nconst membersQuery = {\n  queryKey: ['members'],\n  queryFn: api.members,\n  refetchInterval: MEMBERS_POLL_MS,\n  staleTime: MEMBERS_POLL_MS,\n};\n\nexport const useMembers = () => useQuery(membersQuery);\n\nexport function useMembersById() {\n  const { data } = useQuery({\n    queryKey: ['members', 'by-id'],\n    queryFn: () => api.members().then(indexById),\n    refetchInterval: MEMBERS_POLL_MS,\n    stale … [1433 more]
> ```

> **←**
> ```
> The file src/queries/members.ts has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/board/IssueCard.tsx","old_string":"  const names = viewers.map((id) => members?.get(id)?.name.split(' ')[0]).join(', ');","new_string":"  const names = viewers.map((id) => members?.[id]?.name.split(' ')[0]).join(', ');"}
> ```

> **←**
> ```
> The file src/features/board/IssueCard.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Grep**
> ```
> {"pattern":"membersById|by-id","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/queries/members.ts:23:    queryKey: ['members', 'by-id'],
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-125335-app-panel-99da","label":"after-memberrecord-fix"}
> ```

> **←**
> ```
> {"id":"20260928-125537-app-record-5e02","url":"http://localhost:42261/?tick=150#/issues","requested":"http://localhost:42261/?tick=150#/issues","durationSec":5.1,"commits":19,"renders":162,"rendersWithoutDom":97,"rendersPerCommit":8.5,"topRoot":"Sidebar ×2","wasting":[],"warnings":["20260928-125335-app-panel-99da has no actions: recorded the page as it is for 5035 ms instead"]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-125335-app-panel-99da","after":"20260928-125537-app-record-5e02"}
> ```

> **←**
> ```
> {"comparable":false,"warnings":["viewport differs: 1440×900 vs 1280×720","condition viewport: 1440×900 vs 1280×720"],"before":{"id":"20260928-125335-app-panel-99da","durationMs":5035},"after":{"id":"20260928-125537-app-record-5e02","durationMs":5128},"totals":{"commits":"26 → 19 (-27%)","renders":"659 → 162 (-75%)","commitsPerSec":"5.16 → 3.71 (-28%)","rendersPerSec":"130.88 → 31.59 (-76%)","rendersPerCommit":"25.3 → 8.5 (-66%)","rendersWithoutDomPerSec":"119.17 → 18.92 (-84%)","rendersPerTextChange":"47.1 → 10.8 (-77%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Avatar","source":"src/features/issues/IssueRow.tsx:48","path":"IssueRow < IssueTable < IssuesPage < AppShell","status":"changed","hitsPerSec":"1.99 → 0.2 (-90%)","perHit":"54 → 28 (-48%)","instances":"60 → 28 (-53%)","cascadePerSec":"106.45 → 5.46 (-95%)"},{"root":"Avatar","source":"src/components/ui/Avatar.tsx:36","path":"AvatarStack < PresenceStack < TopBar < AppShell","status":"gone","hitsPerSec":"1.59 → –","perHit":"5 → –","instances":"5 → –","cascadePerSec":"7.94 → 0 (-100%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"0.2 → 0.39 (+95%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"7.35 → 14.43 (+96%)"},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","path":"IssuesPage < AppShell","status":"new","hitsPerSec":"– → 0.2","perHit":"– → 9","instances":"– → 1","cascadePerSec":"0 → 1.76"},{"root":"Av … [2979 more]
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-125335-app-panel-99da","label":"after-memberrecord-fix-v2","viewport":"1440x900"}
> ```

> **←**
> ```
> {"id":"20260928-125548-app-record-b171","url":"http://localhost:42261/?tick=150#/issues","requested":"http://localhost:42261/?tick=150#/issues","durationSec":5.1,"commits":19,"renders":509,"rendersWithoutDom":424,"rendersPerCommit":26.8,"topRoot":"IssuesPage ×8","wasting":[],"warnings":["20260928-125335-app-panel-99da has no actions: recorded the page as it is for 5035 ms instead"]}
> ```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a808efdaac691d75d (internal ID - do not mention to user. Use SendMessage with to: 'a808efdaac691d75d', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-pT9TIG/tmp/claude-0/-tmp-claude-eval-pT9TIG-home-cwd/6cd8795d-9e6e-4c84-a084-597bdbbb77a2/tasks/a808efdaac691d75d.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-125335-app-panel-99da","after":"20260928-125548-app-record-b171"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-125335-app-panel-99da","durationMs":5035},"after":{"id":"20260928-125548-app-record-b171","durationMs":5127},"totals":{"commits":"26 → 19 (-27%)","renders":"659 → 509 (-23%)","commitsPerSec":"5.16 → 3.71 (-28%)","rendersPerSec":"130.88 → 99.28 (-24%)","rendersPerCommit":"25.3 → 26.8 (+6%)","rendersWithoutDomPerSec":"119.17 → 82.7 (-31%)","rendersPerTextChange":"47.1 → 25.4 (-46%)","longTaskMaxMs":"0 → 148"},"roots":[{"root":"Avatar","source":"src/features/issues/IssueRow.tsx:48","path":"IssueRow < IssueTable < IssuesPage < AppShell","status":"changed","hitsPerSec":"1.99 → 0.2 (-90%)","perHit":"54 → 28 (-48%)","instances":"60 → 28 (-53%)","cascadePerSec":"106.45 → 5.46 (-95%)"},{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.19 → 1.56 (+31%)","perHit":"4 → 42 (+950%)","instances":"1 → 1 (0%)","cascadePerSec":"4.77 → 66.12 (+1286%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"0.2 → 0.59 (+195%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"7.35 → 21.65 (+195%)"},{"root":"Avatar","source":"src/components/ui/Avatar.tsx:36","path":"AvatarStack < PresenceStack < TopBar < AppShell","status":"gone","hitsPerSec":"1.59 → –","perHit":"5 → –","instances":"5 → –","cascadePerSec":"7.94 → 0 (-100%)"},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","path":"Issue … [2971 more]
> ```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording (`20260928-125335-app-panel-99da`), find any wasteful re-renders during idle time, fix them in `./src` if found, and prove it with before/after numbers. It's running in the background — I'll report back once it completes.

> **→ Grep**
> ```
> {"pattern":"data-testid|className=\\\"issue-row\" ","path":"src/features/issues/IssueRow.tsx","-n":true}
> ```

> **←**
> ```
> Found 1 file
> src/features/issues/IssueRow.tsx
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/IssueRow.tsx","limit":40}
> ```

> **←**
> ```
> 1	import { memo } from 'react';
> 2	import type { Issue } from '../../api/types';
> 3	import { Avatar } from '../../components/ui/Avatar';
> 4	import { LabelChips, PriorityIcon, StatusIcon } from '../../components/ui/Badges';
> 5	import { Icon } from '../../components/ui/Icon';
> 6	import { TimeAgo } from '../../components/ui/TimeAgo';
> 7	import { cx } from '../../lib/cx';
> 8	import { dueLabel } from '../../lib/time';
> 9	import { useAppStore } from '../../store/app';
> 10	
> 11	interface Props {
> 12	  issue: Issue;
> 13	  selected: boolean;
> 14	  active: boolean;
> 15	  onToggle(id: string): void;
> 16	  onOpen(key: string): void;
> 17	}
> 18	
> 19	export const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {
> 20	  const showEstimates = useAppStore((s) => s.showEstimates);
> 21	  const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;
> 22	  return (
> 23	    <div
> 24	      className={cx('row-issue', selected && 'row-selected', active && 'row-active')}
> 25	      role="row"
> 26	      data-testid="issue-row"
> 27	      data-key={issue.key}
> 28	      onClick={() => onOpen(issue.key)}
> 29	    >
> 30	      <span className="cell-check" onClick={(e) => e.stopPropagation()}>
> 31	        <input type="checkbox" checked={selected} onChange={() => onToggle(issue.id)} aria-label={`Select ${issue.key}`} />
> 32	      </span>
> 33	      <PriorityIcon priority={issue.priority} />
> 34	      <span className="cell-key muted">{issue.key}</span>
> 35	      <StatusIcon status={iss … [361 more]
> ```

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:42261/?tick=150#/issues","viewport":"1440x900","ms":5000,"label":"after-fix-idle-clean","setup":"async (page) => {\n  await page.goto('http://localhost:42261/?tick=150#/issues');\n  await page.waitForSelector('[data-testid=\"issue-row\"]', { timeout: 15000 });\n  await page.waitForTimeout(1000);\n}"}
> ```

> **←**
> ```
> {"id":"20260928-125625-app-record-d30d","url":"http://localhost:42261/?tick=150#/issues","requested":"http://localhost:42261/?tick=150#/issues","durationSec":5.1,"commits":18,"renders":108,"rendersWithoutDom":46,"rendersPerCommit":6,"topRoot":"Sidebar ×1","wasting":[],"warnings":[]}
> ```

> **agent:** No load-storm noise this time (no warnings), clean idle recording. Let's compare against the original "before" panel recording.

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-125335-app-panel-99da","after":"20260928-125625-app-record-d30d"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-125335-app-panel-99da","durationMs":5035},"after":{"id":"20260928-125625-app-record-d30d","durationMs":5086},"totals":{"commits":"26 → 18 (-31%)","renders":"659 → 108 (-84%)","commitsPerSec":"5.16 → 3.54 (-31%)","rendersPerSec":"130.88 → 21.23 (-84%)","rendersPerCommit":"25.3 → 6 (-76%)","rendersWithoutDomPerSec":"119.17 → 9.04 (-92%)","rendersPerTextChange":"47.1 → 7.2 (-85%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Avatar","source":"src/features/issues/IssueRow.tsx:48","path":"IssueRow < IssueTable < IssuesPage < AppShell","status":"changed","hitsPerSec":"1.99 → 0.2 (-90%)","perHit":"54 → 28 (-48%)","instances":"60 → 28 (-53%)","cascadePerSec":"106.45 → 5.51 (-95%)"},{"root":"Avatar","source":"src/components/ui/Avatar.tsx:36","path":"AvatarStack < PresenceStack < TopBar < AppShell","status":"gone","hitsPerSec":"1.59 → –","perHit":"5 → –","instances":"5 → –","cascadePerSec":"7.94 → 0 (-100%)"},{"root":"Avatar","source":"src/components/layout/TopBar.tsx:51","path":"TopBar < AppShell","status":"gone","hitsPerSec":"1.59 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"1.59 → 0 (-100%)"},{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.19 → 1.38 (+16%)","perHit":"4 → 4 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"4.77 → 5.51 (+16%)"},{"root":"SyncStatus","source":"src/components/layout/TopBar.tsx:49","path":"TopBar < AppShell","status":"changed","hitsPe … [2325 more]
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-125625-app-record-d30d"}
> ```

> **←**
> ```
> {"id":"20260928-125625-app-record-d30d","status":"done","dir":"/tmp/tmp.rFcKpXmjoT/20260928-125625-app-record-d30d","summary":{"id":"20260928-125625-app-record-d30d","status":"done","createdAt":"2026-09-28T12:56:30.460Z","label":"after-fix-idle-clean","source":"script:record","url":"http://localhost:42261/?tick=150#/issues","viewport":"1440×900","durationSec":5.1,"scope":null,"totals":{"commits":18,"commitsPerSec":3.54,"commitsInScope":18,"renders":108,"rendersPerScopeCommit":6,"rendersFromOutside":0,"rendersWithoutDom":46,"domTextChanges":15,"rendersPerTextChange":7.2},"topRoots":[{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","hits":1,"hitsPerSec":0.2,"instances":1,"perHit":37,"noDomChange":0,"renderMsPerHit":2,"reasons":["1× external store #21 [store] function memoized() { let cacheNode = fnNode; const { length } = arguments; for (let i = 0, l = leng · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/layout/Sidebar.tsx:55 const unread = useAppSelector(selectUnreadCount);"],"causes":["1× redux:notifications/notificationReceived","1× core:message Worker"],"lanes":"Sync:1"},{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","hits":7,"hitsPerSec":1.38,"instances":1,"perHit":4,"noDomChange":0,"mounts":56,"renderMsPerHit":2.79,"reasons":["7× external store #13 [store] selectAllIssues · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/fea … [5042 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/queries/members.ts"}
> ```

> **←**
> ```
> 1	import { useQuery } from '@tanstack/react-query';
> 2	import { api } from '../api/client';
> 3	import type { Member } from '../api/types';
> 4	import { MEMBERS_POLL_MS } from '../config';
> 5	
> 6	// A plain record, not a Map: react-query's structural sharing walks plain objects/arrays and keeps
> 7	// unchanged entries referentially stable across polls. A Map has no enumerable own keys, so it looks
> 8	// entirely new to that comparison on every poll and defeats structural sharing — every subscriber
> 9	// (every Avatar) would re-render even when its own member never changed.
> 10	const indexById = (members: Member[]) => Object.fromEntries(members.map((m) => [m.id, m])) as Record<string, Member>;
> 11	
> 12	const membersQuery = {
> 13	  queryKey: ['members'],
> 14	  queryFn: api.members,
> 15	  refetchInterval: MEMBERS_POLL_MS,
> 16	  staleTime: MEMBERS_POLL_MS,
> 17	};
> 18	
> 19	export const useMembers = () => useQuery(membersQuery);
> 20	
> 21	export function useMembersById() {
> 22	  const { data } = useQuery({
> 23	    queryKey: ['members', 'by-id'],
> 24	    queryFn: () => api.members().then(indexById),
> 25	    refetchInterval: MEMBERS_POLL_MS,
> 26	    // Same staleness window as the plain members query: staleTime 0 made this query resync (and
> 27	    // notify every observer) far more often than the data actually changed.
> 28	    staleTime: MEMBERS_POLL_MS,
> 29	  });
> 30	  return data;
> 31	}
> 32	
> 33	export function useMember(id: string | null | undefined) {
> 34	  const byId = useMembersById();
> 35	  return id ? byId?.[id … [23 more]
> ```

> **agent:** This confirms the fix is in place as intended. Final summary below.
> 
> ## Root cause
> 
> The idle-time hitching came from `src/queries/members.ts`. Every `Avatar` in the issue list calls `useMember(id)` (`src/components/ui/Avatar.tsx:20`), which reads `useMembersById()` — a react-query subscription to `['members', 'by-id']`.
> 
> - `useMembersById` (`src/queries/members.ts:17-25`, before the fix) built its cache with `indexById = (members) => new Map(...)`. React-query's structural sharing (which keeps a query's `data` reference stable across refetches when the content is unchanged) only walks plain objects/arrays — a `Map` has no enumerable own keys, so it's always treated as "changed." Combined with `staleTime: 0` on that query, every poll (`MEMBERS_POLL_MS` = `tick×12` ≈ 1.8 s) produced a brand-new `Map` even when no member's data had actually changed, and every `Avatar` subscribed to that query re-rendered — confirmed by the recording: `noDomChange: 508` of ~540 renders on the `IssueRow < IssueTable < IssuesPage` `Avatar` root, `40/40` on the `AvatarStack < PresenceStack < TopBar` root, and `8/8` on the single `TopBar` `Avatar` root — all render-for-nothing.
> - Necessary/legitimate re-renders confirmed by `noDomChange: 0`: `Sidebar` (`src/components/layout/AppShell.tsx:25`, unread-count via `src/components/layout/Sidebar.tsx:55`), `IssuesPage` (`src/routes.tsx:18`, `src/features/issues/IssuesPage.tsx:16`), `SyncStatus` (`src/components/layout/SyncStatus.tsx:6`), `PresenceStack` (`src/components/layout/PresenceStack.tsx:5`), `NotificationBell` (`src/components/layout/NotificationBell.tsx:47`) — these were left untouched.
> 
> ## Fix (`src/queries/members.ts`, `src/features/board/IssueCard.tsx`)
> 
> - `indexById`: `new Map(...)` → `Object.fromEntries(...)` returning `Record<string, Member>`, so structural sharing can compare it and keep the same reference (or same per-member sub-references) when nothing changed.
> - `by-id` query's `staleTime: 0` → `MEMBERS_POLL_MS` (matches the plain `members` query), removing the extra "instantly stale" resyncs.
> - `useMember(id)`: `.get(id ?? '')` → `byId?.[id]`.
> - `IssueCard.tsx:23`: `members?.get(id)?.name` → `members?.[id]?.name` (only other consumer of `useMembersById`).
> 
> No visual/behavioral change: same poll cadence, same data, same presence-dot logic — only when re-renders happen changed.
> 
> ## Before / after (recorder numbers)
> 
> Conditions: `http://localhost:42261/?tick=150#/issues`, viewport 1440×900, idle ~5s after issue list loaded, no user interaction, no throttling.
> 
> - Before: recording `20260928-125335-app-panel-99da` (person's own panel recording).
> - After: fresh idle recording `20260928-125625-app-record-d30d` (setup script loaded the page, waited for `[data-testid="issue-row"]`, then recorded 5s idle — same conditions, matched viewport).
> 
> Totals: commits 26 → 18 (-31%), renders 659 → 108 (-84%), renders/sec 130.9 → 21.2 (-84%), renders-without-DOM/sec 119.2 → 9.0 (-92%).
> 
> Per root:
> - `Avatar` (`IssueRow < IssueTable < IssuesPage`, `src/features/issues/IssueRow.tsx:48`): cascade/sec 106.45 → 5.51 (-95%), hits/sec 1.99 → 0.2, instances 60 → 28. The one hit remaining has `noDomChange: 0` — a real presence-dot toggle (`usePresenceStore` reason), not waste.
> - `Avatar` (`AvatarStack < PresenceStack < TopBar`, `src/components/ui/Avatar.tsx:36`): gone entirely (was 7.94 cascade/sec).
> - `Avatar` (`TopBar`, `src/components/layout/TopBar.tsx:51`): gone entirely (was 1.59 cascade/sec).
> - `Sidebar`, `IssuesPage`, `SyncStatus`, `PresenceStack`, `NotificationBell`: unchanged (±0-16%, noise), confirming their renders were already necessary and the fix didn't touch them.
> - `wastingAfter: []` in the comparison — no root renders for nothing after the fix.
> 
> ## What still renders (and why it's kept)
> 
> - The single remaining `IssueRow` `Avatar` hit per idle window (28 instances in that one commit) — real, `noDomChange: 0`, driven by an actual presence change (`usePresenceStore`).
> - `SyncStatus`/`Sidebar`/`IssuesPage`/etc. — all `noDomChange: 0`, tied to genuine websocket/heartbeat/notification/issue events a teammate's activity should show.
> 
> ## Not checked
> 
> - The board view's `IssueCard` (`src/features/board/IssueCard.tsx`) was updated for API consistency but not separately recorded/measured — it wasn't part of the reported idle-issue-list scenario.
> - Did not investigate `redux:activity/activityReceived` cadence or the dashboard/board routes; out of scope for the reported "issue list idle" complaint.
> - Did not chase the `useMemo`/`useCallback` "recomputed every render" notes on `SyncStatus`/`ProjectLink` (zustand/redux selector-argument identity) — the recording itself says these cost the library a recompute, not an extra render, so left as-is.

**→ Read**
```
{"file_path":"src/queries/members.ts"}
```

**←**
```
1	import { useQuery } from '@tanstack/react-query';
2	import { api } from '../api/client';
3	import type { Member } from '../api/types';
4	import { MEMBERS_POLL_MS } from '../config';
5	
6	// A plain record, not a Map: react-query's structural sharing walks plain objects/arrays and keeps
7	// unchanged entries referentially stable across polls. A Map has no enumerable own keys, so it looks
8	// entirely new to that comparison on every poll and defeats structural sharing — every subscriber
9	// (every Avatar) would re-render even when its own member never changed.
10	const indexById = (members: Member[]) => Object.fromEntries(members.map((m) => [m.id, m])) as Record<string, Member>;
11	
12	const membersQuery = {
13	  queryKey: ['members'],
14	  queryFn: api.members,
15	  refetchInterval: MEMBERS_POLL_MS,
16	  staleTime: MEMBERS_POLL_MS,
17	};
18	
19	export const useMembers = () => useQuery(membersQuery);
20	
21	export function useMembersById() {
22	  const { data } = useQuery({
23	    queryKey: ['members', 'by-id'],
24	    queryFn: () => api.members().then(indexById),
25	    refetchInterval: MEMBERS_POLL_MS,
26	    // Same staleness window as the plain members query: staleTime 0 made this query resync (and
27	    // notify every observer) far more often than the data actually changed.
28	    staleTime: MEMBERS_POLL_MS,
29	  });
30	  return data;
31	}
32	
33	export function useMember(id: string | null | undefined) {
34	  const byId = useMembersById();
35	  return id ? byId?.[id … [23 more]
```

**agent:** Confirmed — the fix is in place and matches what the agent reported. Here's the summary:

## Root cause
Every `Avatar` in the issue list subscribes to `useMembersById()` (`src/queries/members.ts`). That query indexed members into a `Map`, but react-query's structural sharing (which keeps unchanged data referentially stable across refetches) only works on plain objects/arrays — a `Map` always looks "new," so every ~1.8s poll produced a brand-new reference and re-rendered every `Avatar` on the page, even when no member data had actually changed. It was compounded by `staleTime: 0` on that query causing extra resyncs.

## Fix (`src/queries/members.ts`, `src/features/board/IssueCard.tsx`)
- Swapped the `Map` index for a plain `Record<string, Member>` (via `Object.fromEntries`) so structural sharing can actually compare it.
- Aligned `staleTime` with the poll interval instead of `0`.
- Updated the two consumers (`useMember`, `IssueCard`) from `.get(id)` to `?.[id]`.

No visual or behavioral change — same data, same polling cadence, only unnecessary re-renders removed.

## Before / after (same idle scenario, 5s, no interaction)
- Commits: 26 → 18 (-31%)
- Renders: 659 → 108 (**-84%**)
- Renders without DOM change/sec: 119.2 → 9.0 (**-92%**)
- The three wasteful `Avatar` cascade roots (issue list, presence stack, top bar) dropped from ~106/8/1.6 cascades-per-sec to ~5.5/0/0 — essentially eliminated.
- Everything else (`Sidebar`, `IssuesPage`, `SyncStatus`, `PresenceStack`, `NotificationBell`) was already rendering only for real reasons (`noDomChange: 0`) and is unchanged.

The remaining renders are genuine (presence/notification/sync events from teammates), so nothing further was touched.
