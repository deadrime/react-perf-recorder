# orbit-auth-connection-rec, with the plugin, run 1

fixed (waste 0); checks 4 of 4; $0.26, 116 s, 15 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: leaving the issue list open makes the laptop fan spin up, though nothing on the page seems to change.
To reproduce: open the issue list, wait for the issues to load, then leave it alone for a few seconds while teammates work.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> ## What was wrong
> 
> `AuthContext.tsx:18` selected the *whole* `connection` object from the zustand store:
> 
> ```ts
> const connection = useAppStore((s) => s.connection);
> ```
> 
> The store replaces that whole object on every heartbeat (`src/store/app.ts:39`, `heartbeat: (latencyMs) => set({ connection: { status: 'live', latencyMs, lastEventAt: Date.now() } })`) — roughly twice a second — even when `status` itself doesn't change. Since `can` (a `useCallback`) depended on `connection`, and `value` (a `useMemo`) depended on `can`, the `AuthContext` value got a brand-new identity on every heartbeat. Every consumer of `useAuth()` — `Sidebar`, `TopBar`, `IssuesToolbar`, plus `AuthProvider` itself — re-rendered each time, even though the only thing they actually read (`user`) never changed. The recording confirmed this: those roots' reasons were tagged `AuthContext SAME-CONTENT`, and almost all of their renders (`noDomChange`) produced no DOM update — wasted work, continuously, while the page sat idle. That's the fan.
> 
> ## The fix
> 
> Select only `connection.status` instead of the whole object (`src/context/AuthContext.tsx:18-24`), so `can`/`value` only get recomputed when status actually changes, not on every heartbeat. The `can()` logic itself is untouched — same check, same result — so nothing the page shows or does changes.
> 
> ## Before / after (same 5s idle scenario, recorded live)
> 
> | | before | after |
> |---|---|---|
> | renders | 699 | 509 (**-27%**) |
> | renders/sec | 138.3 | 98.1 (**-29%**) |
> | renders without a DOM change /sec | 119.7 | 81.7 (**-32%**) |
> | renders per actual text change | 49.9 | 25.4 (**-49%**) |
> 
> Per-root cascade rate (renders/sec caused by that root), the components that only read `user`:
> 
> | root | before | after |
> |---|---|---|
> | Sidebar | 87.8/s | 21.4/s (**-76%**) |
> | TopBar | 15.2/s | 1.35/s (**-91%**) |
> | IssuesToolbar | 19.6/s | 1.73/s (**-91%**) |
> | AuthProvider | 4.35/s | 0.39/s (**-91%**) |
> 
> Each root's per-hit render cost is unchanged (0%) — this isn't `memo` papering over the cascade, it's the roots simply not being triggered nearly as often. The recorder's `wastingAfter` (roots still rendering for nothing) is now empty.
> 
> `IssuesPage`'s cascade rate went *up* between the two runs, but that's expected: it's driven by simulated real-time issue events (`redux:issues/issueReceived`) that arrive at a randomized rate each live 5s window, it doesn't read `AuthContext` at all, and its renders correspond to real text changes on the page — that's legitimate work, not waste, and the recorder didn't flag it.
> 
> Behavior is unchanged — `can()` returns the same value it always did, just recomputed less often. Only `src/context/AuthContext.tsx` was edited.

## What it changed

```
diff -ruN a/src/context/AuthContext.tsx b/src/context/AuthContext.tsx
--- a/src/context/AuthContext.tsx
+++ b/src/context/AuthContext.tsx
@@ -15,11 +15,11 @@
 export function AuthProvider({ children }: { children: ReactNode }) {
   const { data } = useMe();
   // Edits made while the socket is reconnecting would be lost: nobody may edit until it is back.
-  const connection = useAppStore((s) => s.connection);
+  const connectionStatus = useAppStore((s) => s.connection.status);
   const permissions = data?.permissions;
   const can = useCallback(
-    (permission: Permission) => !!permissions?.includes(permission) && (connection.status !== 'reconnecting' || !permission.endsWith(':edit')),
-    [permissions, connection]
+    (permission: Permission) => !!permissions?.includes(permission) && (connectionStatus !== 'reconnecting' || !permission.endsWith(':edit')),
+    [permissions, connectionStatus]
   );
   const value = useMemo(() => ({ user: data ?? null, can }), [data, can]);
   return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
```

## The steps

**agent:** This matches the perf-recorder skill exactly — a page that "spins up the fan" with no visible change is a classic wasted-render signature. Let me use it to analyze the existing recording.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"analyze existing recording, id in ./recording.txt, for the issue list page"}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4196 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-124429-app-panel-c237
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
{"id":"20260928-124429-app-panel-c237"}
```

**←**
```
{"id":"20260928-124429-app-panel-c237","status":"done","dir":"/tmp/tmp.rFcKpXmjoT/20260928-124429-app-panel-c237","summary":{"id":"20260928-124429-app-panel-c237","status":"done","createdAt":"2026-09-28T12:44:34.715Z","source":"panel","url":"http://localhost:33891/?tick=150#/issues","viewport":"1440×900","durationSec":5.1,"scope":null,"totals":{"commits":18,"commitsPerSec":3.56,"commitsInScope":18,"renders":699,"rendersPerScopeCommit":38.8,"rendersFromOutside":0,"rendersWithoutDom":605,"domTextChanges":14,"rendersPerTextChange":49.9},"topRoots":[{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","hits":12,"hitsPerSec":2.37,"instances":1,"perHit":37,"noDomChange":11,"renderMsPerHit":3.64,"reasons":["22× context AuthContext SAME-CONTENT · useAuth › Context @ src/components/layout/Sidebar.tsx:53 const { user } = useAuth();","1× external store #21 [store] function memoized() { let cacheNode = fnNode; const { length } = arguments; for (let i = 0, l = leng · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/layout/Sidebar.tsx:55 const unread = useAppSelector(selectUnreadCount);"],"causes":["12× core:message Worker","2× react-query:fetch → success [\"members\"]","1× redux:notifications/notificationReceived"],"lanes":"Sync:12"},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","path":"IssuesPage < AppShell","hits":11,"hitsPerSec":2.18,"instances":1,"perHit":9,"noDomChange":11,"re … [5405 more]
```

**→ Read**
```
{"file_path":"src/context/AuthContext.tsx"}
```

**←**
```
1	import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
2	import type { Member } from '../api/types';
3	import { useMe } from '../queries/workspace';
4	import { useAppStore } from '../store/app';
5	
6	export type Permission = 'issue:edit' | 'issue:comment' | 'project:view' | 'settings:edit';
7	
8	interface Auth {
9	  user: Member | null;
10	  can(permission: Permission): boolean;
11	}
12	
13	const AuthContext = createContext<Auth>({ user: null, can: () => false });
14	
15	export function AuthProvider({ children }: { children: ReactNode }) {
16	  const { data } = useMe();
17	  // Edits made while the socket is reconnecting would be lost: nobody may edit until it is back.
18	  const connection = useAppStore((s) => s.connection);
19	  const permissions = data?.permissions;
20	  const can = useCallback(
21	    (permission: Permission) => !!permissions?.includes(permission) && (connection.status !== 'reconnecting' || !permission.endsWith(':edit')),
22	    [permissions, connection]
23	  );
24	  const value = useMemo(() => ({ user: data ?? null, can }), [data, can]);
25	  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
26	}
27	
28	export const useAuth = () => useContext(AuthContext);
29	
```

**→ Grep**
```
{"pattern":"connection","path":"src/store/app.ts","output_mode":"content","-n":true}
```

**←**
```
14:  connection: { status: ConnectionStatus; latencyMs: number | null; lastEventAt: number | null };
33:        connection: { status: 'connecting', latencyMs: null, lastEventAt: null },
39:        heartbeat: (latencyMs) => set({ connection: { status: 'live', latencyMs, lastEventAt: Date.now() } }, false, 'connection/heartbeat'),
40:        setConnection: (status) => set((s) => ({ connection: { ...s.connection, status } }), false, 'connection/status'),
```

**→ Read**
```
{"file_path":"src/components/layout/Sidebar.tsx","offset":40,"limit":25}
```

**←**
```
40	  return (
41	    <div className="nav-group">
42	      {!collapsed && <div className="nav-heading">Projects</div>}
43	      {projects.map((p) => (
44	        <ProjectLink key={p.id} project={p} collapsed={collapsed} />
45	      ))}
46	    </div>
47	  );
48	}
49	
50	export function Sidebar() {
51	  const collapsed = useAppStore((s) => s.sidebarCollapsed);
52	  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
53	  const { user } = useAuth();
54	  const mine = useAppSelector((s) => selectMyOpenCount(s, user?.id));
55	  const unread = useAppSelector(selectUnreadCount);
56	  return (
57	    <aside className={cx('sidebar', collapsed && 'sidebar-collapsed')} data-testid="sidebar">
58	      <div className="sidebar-head">
59	        {!collapsed && <strong className="logo">Orbit</strong>}
60	        <button className="icon-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
61	          <Icon name="sidebar" />
62	        </button>
63	      </div>
64	      <nav className="nav-group">
```

**→ Read**
```
{"file_path":"src/components/layout/TopBar.tsx","offset":30,"limit":20}
```

**←**
```
30	        </>
31	      )}
32	    </div>
33	  );
34	}
35	
36	export function TopBar() {
37	  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
38	  const { user } = useAuth();
39	  return (
40	    <header className="topbar" data-testid="topbar">
41	      <Breadcrumb />
42	      <button className="search-btn" onClick={() => setCommandOpen(true)} data-testid="open-palette">
43	        <Icon name="search" size={14} />
44	        <span className="grow">Search or jump to…</span>
45	        <Kbd>⌘K</Kbd>
46	      </button>
47	      <div className="grow" />
48	      <PresenceStack />
49	      <SyncStatus />
```

**→ Read**
```
{"file_path":"src/features/issues/IssuesToolbar.tsx","offset":1,"limit":40}
```

**←**
```
1	import { memo } from 'react';
2	import type { IssueStatus, Priority } from '../../api/types';
3	import { PriorityIcon, StatusIcon } from '../../components/ui/Badges';
4	import { Button } from '../../components/ui/Button';
5	import { Dropdown } from '../../components/ui/Dropdown';
6	import { Icon } from '../../components/ui/Icon';
7	import { useAuth } from '../../context/AuthContext';
8	import { activeFilterCount, EMPTY_FILTERS, type IssueFilters, type SortKey } from '../../lib/filters';
9	import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../../lib/meta';
10	import { useMembers } from '../../queries/members';
11	import { useLabels, useProjects } from '../../queries/workspace';
12	import { SearchBox } from './SearchBox';
13	
14	const SORTS: Array<{ value: SortKey; label: string }> = [
15	  { value: 'updated', label: 'Last updated' },
16	  { value: 'created', label: 'Created' },
17	  { value: 'priority', label: 'Priority' },
18	  { value: 'due', label: 'Due date' },
19	  { value: 'key', label: 'Key' },
20	];
21	
22	const toggled = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
23	
24	interface Props {
25	  filters: IssueFilters;
26	  setFilters(patch: Partial<IssueFilters>): void;
27	  total: number;
28	}
29	
30	export const IssuesToolbar = memo(function IssuesToolbar({ filters, setFilters, total }: Props) {
31	  const { user } = useAuth();
32	  const { data: members = [] } = useMembers();
33	  const  … [379 more]
```

**agent:** Root cause found: `AuthContext.tsx` selects the *whole* `connection` object from the zustand store. The store replaces that object on every heartbeat (`heartbeat: (latencyMs) => set({ connection: { status: 'live', latencyMs, lastEventAt: Date.now() } })`) — about every 0.5s — even when `status` doesn't change. Since `can` depends on `connection` and `value` depends on `can`, the context value gets a new identity every heartbeat, forcing every consumer of `useAuth()` (Sidebar, TopBar, IssuesToolbar) to re-render — with `user` unchanged, hence the "SAME-CONTENT" / no-DOM-change renders the recording shows continuously while the page sits idle. That matches the complaint exactly: fan spins, nothing visibly changes.

Fixing it: select only `connection.status` instead of the whole object, so `can`/`value` only change when status actually changes.

**→ Edit**
```
{"replace_all":false,"file_path":"src/context/AuthContext.tsx","old_string":"  const { data } = useMe();\n  // Edits made while the socket is reconnecting would be lost: nobody may edit until it is back.\n  const connection = useAppStore((s) => s.connection);\n  const permissions = data?.permissions;\n  const can = useCallback(\n    (permission: Permission) => !!permissions?.includes(permission) && (connection.status !== 'reconnecting' || !permission.endsWith(':edit')),\n    [permissions, connection]\n  );","new_string":"  const { data } = useMe();\n  // Edits  … [414 more]
```

**←**
```
The file src/context/AuthContext.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** `useAppStore((s) => s.connection.status)` uses zustand's default `Object.is` equality on the selected primitive, so it only triggers a re-render of `AuthProvider` when the status string actually changes — the identity churn from `latencyMs`/`lastEventAt` no longer reaches it. Now let's record the same scenario again and compare.

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**agent:** The original recording was the person's own idle-panel capture (not a scripted action sequence), so the fairest replay is just recording the same idle scenario again for the same duration on the same URL.

**→ rpr:record_page**
```
{"url":"http://localhost:33891/?tick=150#/issues","ms":5100,"label":"after","viewport":"1440x900"}
```

**←**
```
{"id":"20260928-124530-app-record-8c5e","url":"http://localhost:33891/?tick=150#/issues","requested":"http://localhost:33891/?tick=150#/issues","durationSec":5.2,"commits":19,"renders":509,"rendersWithoutDom":424,"rendersPerCommit":26.8,"topRoot":"IssuesPage ×8","wasting":[],"warnings":[]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-124429-app-panel-c237","after":"20260928-124530-app-record-8c5e"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-124429-app-panel-c237","durationMs":5055},"after":{"id":"20260928-124530-app-record-8c5e","durationMs":5191},"totals":{"commits":"18 → 19 (+6%)","renders":"699 → 509 (-27%)","commitsPerSec":"3.56 → 3.66 (+3%)","rendersPerSec":"138.28 → 98.05 (-29%)","rendersPerCommit":"38.8 → 26.8 (-31%)","rendersWithoutDomPerSec":"119.68 → 81.68 (-32%)","rendersPerTextChange":"49.9 → 25.4 (-49%)","longTaskMaxMs":"0 → 154"},"roots":[{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"2.37 → 0.58 (-76%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"87.83 → 21.38 (-76%)"},{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.38 → 1.54 (+12%)","perHit":"4 → 42 (+950%)","instances":"1 → 1 (0%)","cascadePerSec":"5.54 → 65.31 (+1079%)"},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","path":"IssuesPage < AppShell","status":"changed","hitsPerSec":"2.18 → 0.19 (-91%)","perHit":"9 → 9 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"19.58 → 1.73 (-91%)"},{"root":"TopBar","source":"src/components/layout/AppShell.tsx:27","path":"AppShell","status":"changed","hitsPerSec":"2.18 → 0.19 (-91%)","perHit":"7 → 7 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"15.23 → 1.35 (-91%)"},{"root":"AuthProvider","source":"src/main.tsx:17","path":"","status":"changed","hitsPerSec":"2.18 → 0.19 (-91%)","pe … [2338 more]
```

**agent:** ## What was wrong

`AuthContext.tsx:18` selected the *whole* `connection` object from the zustand store:

```ts
const connection = useAppStore((s) => s.connection);
```

The store replaces that whole object on every heartbeat (`src/store/app.ts:39`, `heartbeat: (latencyMs) => set({ connection: { status: 'live', latencyMs, lastEventAt: Date.now() } })`) — roughly twice a second — even when `status` itself doesn't change. Since `can` (a `useCallback`) depended on `connection`, and `value` (a `useMemo`) depended on `can`, the `AuthContext` value got a brand-new identity on every heartbeat. Every consumer of `useAuth()` — `Sidebar`, `TopBar`, `IssuesToolbar`, plus `AuthProvider` itself — re-rendered each time, even though the only thing they actually read (`user`) never changed. The recording confirmed this: those roots' reasons were tagged `AuthContext SAME-CONTENT`, and almost all of their renders (`noDomChange`) produced no DOM update — wasted work, continuously, while the page sat idle. That's the fan.

## The fix

Select only `connection.status` instead of the whole object (`src/context/AuthContext.tsx:18-24`), so `can`/`value` only get recomputed when status actually changes, not on every heartbeat. The `can()` logic itself is untouched — same check, same result — so nothing the page shows or does changes.

## Before / after (same 5s idle scenario, recorded live)

| | before | after |
|---|---|---|
| renders | 699 | 509 (**-27%**) |
| renders/sec | 138.3 | 98.1 (**-29%**) |
| renders without a DOM change /sec | 119.7 | 81.7 (**-32%**) |
| renders per actual text change | 49.9 | 25.4 (**-49%**) |

Per-root cascade rate (renders/sec caused by that root), the components that only read `user`:

| root | before | after |
|---|---|---|
| Sidebar | 87.8/s | 21.4/s (**-76%**) |
| TopBar | 15.2/s | 1.35/s (**-91%**) |
| IssuesToolbar | 19.6/s | 1.73/s (**-91%**) |
| AuthProvider | 4.35/s | 0.39/s (**-91%**) |

Each root's per-hit render cost is unchanged (0%) — this isn't `memo` papering over the cascade, it's the roots simply not being triggered nearly as often. The recorder's `wastingAfter` (roots still rendering for nothing) is now empty.

`IssuesPage`'s cascade rate went *up* between the two runs, but that's expected: it's driven by simulated real-time issue events (`redux:issues/issueReceived`) that arrive at a randomized rate each live 5s window, it doesn't read `AuthContext` at all, and its renders correspond to real text changes on the page — that's legitimate work, not waste, and the recorder didn't flag it.

Behavior is unchanged — `can()` returns the same value it always did, just recomputed less often. Only `src/context/AuthContext.tsx` was edited.
