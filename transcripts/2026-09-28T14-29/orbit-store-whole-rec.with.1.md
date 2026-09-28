# orbit-store-whole-rec, with the plugin, run 1

not verified; checks 4 of 4; $0.41, 135 s, 25 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the app keeps using CPU while it sits idle on the issue list.
To reproduce: open the issue list, wait for the issues to load, then leave it alone for a few seconds while teammates work.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> Fix confirmed and verified with the dev server (recorder attached live, so the app compiled fine and rendered correctly during the after-recording).
> 
> ## Findings
> 
> **Root cause:** `src/components/layout/Sidebar.tsx:51` called `useAppStore()` with no selector:
> 
> ```tsx
> const { sidebarCollapsed: collapsed, toggleSidebar } = useAppStore();
> ```
> 
> This subscribes `Sidebar` to the *entire* zustand `app` store. The store's `connection` field is replaced by `heartbeat()` roughly every 450ms (`src/store/app.ts:39`, a simulated websocket heartbeat), which creates a new top-level state object on every beat — even though `sidebarCollapsed` and `toggleSidebar` never change. Since `Sidebar` had no selector, it re-rendered on every one of those heartbeats. The recording showed this directly: 11 of Sidebar's 12 renders during 5 idle seconds changed nothing in the DOM (`noDomChange: 11` of `hits: 12`) — it was the only cascade root in the recording doing that; every other root's renders corresponded to a real, needed DOM update.
> 
> **Fix:** select only the two fields actually used, each with a plain selector, so zustand's `Object.is` check filters out unrelated heartbeat updates:
> 
> ```tsx
> const collapsed = useAppStore((s) => s.sidebarCollapsed);
> const toggleSidebar = useAppStore((s) => s.toggleSidebar);
> ```
> 
> No behavior, markup, or displayed data changed — just what the Sidebar subscribes to.
> 
> ## Before/after (same viewport, same idle-on-issue-list scenario, 5s)
> 
> | metric | before | after | change |
> |---|---|---|---|
> | Sidebar renders/sec | 2.38 | 0.2 | **-92%** |
> | Sidebar cascade renders/sec | 88.22 | 7.27 | **-92%** |
> | total renders/sec | 101.33 | 21.02 | **-79%** |
> | renders that touched no DOM, /sec | 89.61 | 9.04 | **-90%** |
> | commits/sec (unrelated activity, unchanged) | 3.38 | 3.34 | 0% |
> | wasted-render roots left | Sidebar | none | — |
> 
> Commit rate is unchanged (same background activity), but nearly all of Sidebar's no-op renders are gone, and it's the only root that improved — everything else (SyncStatus, PresenceStack, NotificationBell, Avatar, IssuesPage) is within noise, confirming the fix didn't touch behavior elsewhere.

## What it changed

```
diff -ruN a/src/components/layout/Sidebar.tsx b/src/components/layout/Sidebar.tsx
--- a/src/components/layout/Sidebar.tsx
+++ b/src/components/layout/Sidebar.tsx
@@ -48,7 +48,8 @@
 }
 
 export function Sidebar() {
-  const { sidebarCollapsed: collapsed, toggleSidebar } = useAppStore();
+  const collapsed = useAppStore((s) => s.sidebarCollapsed);
+  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
   const { user } = useAuth();
   const mine = useAppSelector((s) => selectMyOpenCount(s, user?.id));
   const unread = useAppSelector(selectUnreadCount);
```

## The steps

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Investigate why the issue list page keeps using CPU while idle. Recording id is in ./recording.txt, dev server url in ./dev-url.txt, source in ./src. Find any cascade roots that re-render for nothing while the page sits idle, identify the hook/store/file/line responsible, fix in ./src without changing what the page displays, and prove the fix with before/after numbers. If nothing re-renders for nothing, report that and change nothing."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4775 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-143830-app-panel-c5b8
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:35567/?tick=150#/issues
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
```

**→ rpr:get_recording**
```
{"id":"20260928-143830-app-panel-c5b8"}
```

**←**
```
{"id":"20260928-143830-app-panel-c5b8","status":"done","dir":"/tmp/tmp.1F5kXmNeJQ/20260928-143830-app-panel-c5b8","summary":{"id":"20260928-143830-app-panel-c5b8","status":"done","createdAt":"2026-09-28T14:38:35.604Z","source":"panel","url":"http://localhost:35567/?tick=150#/issues","viewport":"1440×900","durationSec":5,"scope":null,"totals":{"commits":17,"commitsPerSec":3.38,"commitsInScope":17,"renders":510,"rendersPerScopeCommit":30,"rendersFromOutside":0,"rendersWithoutDom":451,"domTextChanges":14,"rendersPerTextChange":36.4},"topRoots":[{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","hits":12,"hitsPerSec":2.38,"instances":1,"perHit":37,"noDomChange":11,"renderMsPerHit":2.31,"reasons":["11× external store #2 [useAppStore] identity · [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/layout/Sidebar.tsx:51 const { sidebarCollapsed: collapsed, toggleSidebar } = useAppStore();","1× external store #16 [store] function memoized() { let cacheNode = fnNode; const { length } = arguments; for (let i = 0, l = leng · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/layout/Sidebar.tsx:54 const unread = useAppSelector(selectUnreadCount);"],"causes":["12× core:message Worker","11× zustand:connection/heartbeat","2× react-query:fetch → success [\"members\"]"],"lanes":"Sync:12"},{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","h … [5263 more]
```

**→ Read**
```
{"file_path":"src/components/layout/Sidebar.tsx"}
```

**←**
```
1	import { NavLink } from 'react-router-dom';
2	import type { Project } from '../../api/types';
3	import { useAuth } from '../../context/AuthContext';
4	import { cx } from '../../lib/cx';
5	import { useProjects } from '../../queries/workspace';
6	import { useAppSelector } from '../../store';
7	import { useAppStore } from '../../store/app';
8	import { selectMyOpenCount, selectOpenCountByProject, selectUnreadCount } from '../../store/selectors';
9	import { Count } from '../ui/Badges';
10	import { Icon, type IconName } from '../ui/Icon';
11	
12	function NavItem({ to, icon, label, count, collapsed }: { to: string; icon: IconName; label: string; count?: number; collapsed: boolean }) {
13	  return (
14	    <NavLink
15	      to={to}
16	      className={({ isActive }) => cx('nav-item', isActive && 'nav-item-on')}
17	      title={collapsed ? label : undefined}
18	      data-testid={`nav-${to.slice(1)}`}
19	    >
20	      <Icon name={icon} />
21	      {!collapsed && <span className="grow">{label}</span>}
22	      {!collapsed && count !== undefined && <Count n={count} />}
23	    </NavLink>
24	  );
25	}
26	
27	function ProjectLink({ project, collapsed }: { project: Project; collapsed: boolean }) {
28	  const open = useAppSelector((s) => selectOpenCountByProject(s)[project.id] ?? 0);
29	  return (
30	    <NavLink to={`/board?project=${project.id}`} className="nav-item" title={project.name}>
31	      <span className="dot" style={{ background: project.color }} />
32	      {!collapsed && <sp … [1913 more]
```

**→ Read**
```
{"file_path":"src/store/app.ts"}
```

**←**
```
1	import { create } from 'zustand';
2	import { devtools, persist } from 'zustand/middleware';
3	
4	export type Density = 'comfortable' | 'compact';
5	export type Theme = 'dark' | 'light' | 'system';
6	export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';
7	
8	interface AppState {
9	  sidebarCollapsed: boolean;
10	  density: Density;
11	  theme: Theme;
12	  showEstimates: boolean;
13	  commandOpen: boolean;
14	  connection: { status: ConnectionStatus; latencyMs: number | null; lastEventAt: number | null };
15	  toggleSidebar(): void;
16	  setDensity(density: Density): void;
17	  setTheme(theme: Theme): void;
18	  setShowEstimates(show: boolean): void;
19	  setCommandOpen(open: boolean): void;
20	  heartbeat(latencyMs: number): void;
21	  setConnection(status: ConnectionStatus): void;
22	}
23	
24	export const useAppStore = create<AppState>()(
25	  devtools(
26	    persist(
27	      (set) => ({
28	        sidebarCollapsed: false,
29	        density: 'comfortable',
30	        theme: 'dark',
31	        showEstimates: true,
32	        commandOpen: false,
33	        connection: { status: 'connecting', latencyMs: null, lastEventAt: null },
34	        toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }), false, 'ui/toggleSidebar'),
35	        setDensity: (density) => set({ density }, false, 'ui/setDensity'),
36	        setTheme: (theme) => set({ theme }, false, 'ui/setTheme'),
37	        setShowEstimates: (showEstimates) => set({ showEstimates } … [655 more]
```

**→ Grep**
```
{"pattern":"\"zustand\"","path":"package.json","output_mode":"content"}
```

**✗ error**
```
Path does not exist: package.json. Note: your current working directory is ..
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
{"pattern":"*"}
```

**←**
```
src/app.css
src/components/ui/Tooltip.tsx
src/components/ui/Button.tsx
src/components/ui/Icon.tsx
src/components/ui/Badges.tsx
src/components/ui/Avatar.tsx
src/components/ui/Misc.tsx
src/components/ui/Modal.tsx
src/components/ui/Dropdown.tsx
src/components/ui/TimeAgo.tsx
src/components/layout/PresenceStack.tsx
src/components/layout/SyncStatus.tsx
src/components/layout/CommandPalette.tsx
src/components/layout/TopBar.tsx
src/components/layout/NotificationBell.tsx
src/components/layout/Toaster.tsx
src/components/layout/AppShell.tsx
src/components/withPermission.tsx
src/hooks/useClickOutside.ts
src/hooks/useDocumentTitle.ts
src/hooks/useListbox.ts
src/hooks/useIssueFilters.ts
src/hooks/useHotkey.ts
src/hooks/useDebouncedCallback.ts
src/hooks/useNow.ts
src/vite-env.d.ts
src/api/seed.ts
src/api/client.ts
src/api/types.ts
src/main.tsx
src/features/board/BoardPage.tsx
src/features/board/IssueCard.tsx
src/features/board/BoardColumn.tsx
src/features/projects/ProjectsPage.tsx
src/features/issues/IssueDrawer.tsx
src/features/issues/IssueProperties.tsx
src/features/issues/IssuesToolbar.tsx
src/features/issues/SearchBox.tsx
src/features/issues/IssueTable.tsx
src/features/issues/IssueComments.tsx
src/features/issues/CommentComposer.tsx
src/features/issues/IssueRow.tsx
src/features/issues/RichText.tsx
src/features/issues/IssueDescription.tsx
src/features/issues/BulkBar.tsx
src/features/issues/IssuesPage.tsx
src/features/settings/ProfileForm.tsx
src/features/settings/SettingsPage.tsx
src/feat … [940 more]
```

**→ Grep**
```
{"pattern":"\"zustand\"","path":".","output_mode":"files_with_matches"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"**/node_modules/zustand/package.json"}
```

**←**
```
No files found
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/layout/Sidebar.tsx","old_string":"  const { sidebarCollapsed: collapsed, toggleSidebar } = useAppStore();","new_string":"  const collapsed = useAppStore((s) => s.sidebarCollapsed);\n  const toggleSidebar = useAppStore((s) => s.toggleSidebar);"}
```

**←**
```
The file src/components/layout/Sidebar.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's prove it with a before/after recording using replay of the original scenario.

**→ rpr:record_page**
```
{"replay":"20260928-143830-app-panel-c5b8","label":"after"}
```

**←**
```
{"id":"20260928-143918-app-record-d284","url":"http://localhost:35567/?tick=150#/issues","requested":"http://localhost:35567/?tick=150#/issues","durationSec":5.1,"commits":23,"renders":619,"rendersWithoutDom":518,"rendersPerCommit":26.9,"topRoot":"IssuesPage ×8","wasting":[{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","hits":3,"instances":1,"noDomChange":3},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","hits":5,"instances":1,"noDomChange":2},{"root":"AuthProvider","source":"src/main.tsx:17","hits":2,"instances":1,"noDomChange":0,"ownDomUnchanged":2}],"warnings":["20260928-143830-app-panel-c5b8 has no actions: recorded the page as it is for 5033 ms instead"]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-143830-app-panel-c5b8","after":"20260928-143918-app-record-d284"}
```

**←**
```
{"comparable":false,"warnings":["viewport differs: 1440×900 vs 1280×720","condition viewport: 1440×900 vs 1280×720"],"before":{"id":"20260928-143830-app-panel-c5b8","durationMs":5033},"after":{"id":"20260928-143918-app-record-d284","durationMs":5129},"totals":{"commits":"17 → 23 (+35%)","renders":"510 → 619 (+21%)","commitsPerSec":"3.38 → 4.48 (+33%)","rendersPerSec":"101.33 → 120.69 (+19%)","rendersPerCommit":"30 → 26.9 (-10%)","rendersWithoutDomPerSec":"89.61 → 100.99 (+13%)","rendersPerTextChange":"36.4 → 30.9 (-15%)","longTaskMaxMs":"0 → 110"},"roots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.19 → 1.56 (+31%)","perHit":"4 → 42 (+950%)","instances":"1 → 1 (0%)","cascadePerSec":"4.77 → 66.09 (+1286%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"2.38 → 0.97 (-59%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"88.22 → 36.07 (-59%)"},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","path":"IssuesPage < AppShell","status":"new","hitsPerSec":"– → 0.58","perHit":"– → 9","instances":"– → 1","cascadePerSec":"0 → 5.26"},{"root":"TopBar","source":"src/components/layout/AppShell.tsx:27","path":"AppShell","status":"new","hitsPerSec":"– → 0.39","perHit":"– → 8","instances":"– → 1","cascadePerSec":"0 → 2.92"},{"root":"Avatar","source":"src/components/ui/Avatar.tsx:36","path":"AvatarStack < PresenceStack < Top … [3762 more]
```

**→ rpr:record_page**
```
{"url":"http://localhost:35567/?tick=150#/issues","ms":5000,"viewport":"1440x900","label":"after-idle"}
```

**←**
```
{"id":"20260928-143932-app-record-c532","url":"http://localhost:35567/?tick=150#/issues","requested":"http://localhost:35567/?tick=150#/issues","durationSec":5.1,"commits":21,"renders":614,"rendersWithoutDom":516,"rendersPerCommit":29.2,"topRoot":"IssuesPage ×7","wasting":[{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","hits":3,"instances":1,"noDomChange":3},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","hits":5,"instances":1,"noDomChange":2},{"root":"AuthProvider","source":"src/main.tsx:17","hits":2,"instances":1,"noDomChange":0,"ownDomUnchanged":2}],"warnings":[]}
```

**→ rpr:record_page**
```
{"setup":"async (page) => { await page.goto('http://localhost:35567/?tick=150#/issues'); await page.locator('[data-testid=\\\"sidebar\\\"]').waitFor(); await page.locator('table tbody tr').first().waitFor({ timeout: 15000 }); await page.waitForTimeout(1000); }","ms":5000,"viewport":"1440x900","label":"after-idle-settled"}
```

**✗ error**
```
locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('table tbody tr').first() to be visible[22m
```

**→ Grep**
```
{"pattern":"data-testid","path":"src/features/issues/IssueTable.tsx","output_mode":"content"}
```

**←**
```
35:    <div className="table" role="table" data-testid="issue-table">
```

**→ Grep**
```
{"pattern":"data-testid","path":"src/features/issues/IssueRow.tsx","output_mode":"content"}
```

**←**
```
26:      data-testid="issue-row"
```

**→ rpr:record_page**
```
{"setup":"async (page) => { await page.goto('http://localhost:35567/?tick=150#/issues'); await page.locator('[data-testid=\\\"issue-row\\\"]').first().waitFor({ timeout: 15000 }); await page.waitForTimeout(1000); }","ms":5000,"viewport":"1440x900","label":"after-idle-settled"}
```

**←**
```
{"id":"20260928-144011-app-record-1516","url":"http://localhost:35567/?tick=150#/issues","requested":"http://localhost:35567/?tick=150#/issues","durationSec":5.1,"commits":17,"renders":107,"rendersWithoutDom":46,"rendersPerCommit":6.3,"topRoot":"IssuesPage ×7","wasting":[],"warnings":[]}
```

**→ rpr:get_recording**
```
{"id":"20260928-144011-app-record-1516"}
```

**←**
```
{"id":"20260928-144011-app-record-1516","status":"done","dir":"/tmp/tmp.1F5kXmNeJQ/20260928-144011-app-record-1516","summary":{"id":"20260928-144011-app-record-1516","status":"done","createdAt":"2026-09-28T14:40:16.800Z","label":"after-idle-settled","source":"script:record","url":"http://localhost:35567/?tick=150#/issues","viewport":"1440×900","durationSec":5.1,"scope":null,"totals":{"commits":17,"commitsPerSec":3.34,"commitsInScope":17,"renders":107,"rendersPerScopeCommit":6.3,"rendersFromOutside":0,"rendersWithoutDom":46,"domTextChanges":14,"rendersPerTextChange":7.6},"topRoots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","hits":7,"hitsPerSec":1.38,"instances":1,"perHit":4,"noDomChange":0,"mounts":56,"renderMsPerHit":2.24,"reasons":["7× external store #13 [store] selectAllIssues · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssuesPage.tsx:16 const issues = useAppSelector(selectAllIssues);"],"causes":["7× core:message Worker","5× redux:issues/issueReceived","2× redux:issues/commentCounted"],"lanes":"Sync:7"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","hits":1,"hitsPerSec":0.2,"instances":1,"perHit":37,"noDomChange":0,"renderMsPerHit":2.5,"reasons":["1× external store #21 [store] function memoized() { let cacheNode = fnNode; const { length } = arguments; for (let i = 0, l = leng · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExt … [4980 more]
```

**→ rpr:compare_recordings**
```
{"before":"20260928-143830-app-panel-c5b8","after":"20260928-144011-app-record-1516"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-143830-app-panel-c5b8","durationMs":5033},"after":{"id":"20260928-144011-app-record-1516","durationMs":5090},"totals":{"commits":"17 → 17 (0%)","renders":"510 → 107 (-79%)","commitsPerSec":"3.38 → 3.34 (-1%)","rendersPerSec":"101.33 → 21.02 (-79%)","rendersPerCommit":"30 → 6.3 (-79%)","rendersWithoutDomPerSec":"89.61 → 9.04 (-90%)","rendersPerTextChange":"36.4 → 7.6 (-79%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"2.38 → 0.2 (-92%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"88.22 → 7.27 (-92%)"},{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.19 → 1.38 (+16%)","perHit":"4 → 4 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"4.77 → 5.5 (+15%)"},{"root":"Avatar","source":"src/features/issues/IssueRow.tsx:48","path":"IssueRow < IssueTable < IssuesPage < AppShell","status":"changed","hitsPerSec":"0.2 → 0.2 (0%)","perHit":"28 → 28 (0%)","instances":"28 → 28 (0%)","cascadePerSec":"5.56 → 5.5 (-1%)"},{"root":"SyncStatus","source":"src/components/layout/TopBar.tsx:49","path":"TopBar < AppShell","status":"changed","hitsPerSec":"2.19 → 2.16 (-1%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"2.19 → 2.16 (-1%)"},{"root":"PresenceStack","source":"src/components/layout/TopBar.tsx:48","path":"TopBar < AppShell","status":"changed … [1629 more]
```

**→ Read**
```
{"file_path":"src/components/layout/Sidebar.tsx","offset":50,"limit":10}
```

**←**
```
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
```

**agent:** Fix confirmed and verified with the dev server (recorder attached live, so the app compiled fine and rendered correctly during the after-recording).

## Findings

**Root cause:** `src/components/layout/Sidebar.tsx:51` called `useAppStore()` with no selector:

```tsx
const { sidebarCollapsed: collapsed, toggleSidebar } = useAppStore();
```

This subscribes `Sidebar` to the *entire* zustand `app` store. The store's `connection` field is replaced by `heartbeat()` roughly every 450ms (`src/store/app.ts:39`, a simulated websocket heartbeat), which creates a new top-level state object on every beat — even though `sidebarCollapsed` and `toggleSidebar` never change. Since `Sidebar` had no selector, it re-rendered on every one of those heartbeats. The recording showed this directly: 11 of Sidebar's 12 renders during 5 idle seconds changed nothing in the DOM (`noDomChange: 11` of `hits: 12`) — it was the only cascade root in the recording doing that; every other root's renders corresponded to a real, needed DOM update.

**Fix:** select only the two fields actually used, each with a plain selector, so zustand's `Object.is` check filters out unrelated heartbeat updates:

```tsx
const collapsed = useAppStore((s) => s.sidebarCollapsed);
const toggleSidebar = useAppStore((s) => s.toggleSidebar);
```

No behavior, markup, or displayed data changed — just what the Sidebar subscribes to.

## Before/after (same viewport, same idle-on-issue-list scenario, 5s)

| metric | before | after | change |
|---|---|---|---|
| Sidebar renders/sec | 2.38 | 0.2 | **-92%** |
| Sidebar cascade renders/sec | 88.22 | 7.27 | **-92%** |
| total renders/sec | 101.33 | 21.02 | **-79%** |
| renders that touched no DOM, /sec | 89.61 | 9.04 | **-90%** |
| commits/sec (unrelated activity, unchanged) | 3.38 | 3.34 | 0% |
| wasted-render roots left | Sidebar | none | — |

Commit rate is unchanged (same background activity), but nearly all of Sidebar's no-op renders are gone, and it's the only root that improved — everything else (SyncStatus, PresenceStack, NotificationBell, Avatar, IssuesPage) is within noise, confirming the fix didn't touch behavior elsewhere.
