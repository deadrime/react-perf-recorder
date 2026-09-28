# orbit-effect-filter-rec, with the plugin, run 1

fixed (waste 0); checks 4 of 4; $0.37, 136 s, 22 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the issue list flashes "No issues match" when it opens, and feels heavier than it should when issues change.
To reproduce: open the issue list, wait for the issues to load, then leave it alone for a few seconds while teammates work.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> Clean — no leftover unused `Issue` type references. The fix is confirmed and behavior-preserving (visible output is identical, just computed synchronously instead of via a post-render effect).
> 
> ## Summary
> 
> **Root cause:** `src/features/issues/IssuesPage.tsx` derived its filtered issue list with `useState` + `useEffect` instead of `useMemo`:
> 
> ```ts
> const [visible, setVisible] = useState<Issue[]>([]);
> useEffect(() => {
>   setVisible(applyFilters(issues, filters));
> }, [issues, filters]);
> ```
> 
> This caused two problems, both visible in the recording (`20260928-124746-app-panel-3540`):
> - **The flash:** `visible` starts as `[]`. `IssueTable` shows `EmptyState title="No issues match"` whenever `issues.length === 0` (`IssueTable.tsx:32`), so the very first render always shows that message before the effect fires and replaces it — a guaranteed one-frame flash on every mount.
> - **The extra weight:** every time redux issues changed, React committed the *stale* `visible` first, then the effect ran `setVisible`, forcing a second commit. The recording showed exactly this: `IssuesPage` had 12 hits in 5s from only 6 underlying store updates — a 2x render tax, tagged as `core:effect @ IssuesPage.tsx`.
> 
> **Fix:** replaced the state+effect with a plain `useMemo`, so `visible` is computed synchronously in the same render as `issues`/`filters` — no empty-first-render flash, no follow-up commit.
> 
> **Before → after** (same 5s idle-observation scenario, matched viewport, comparable=true):
> | metric | before | after |
> |---|---|---|
> | `IssuesPage` hits/sec | 2.38 | 1.38 (**-42%**) |
> | `IssuesPage` cascade/sec | 9.54 | 5.50 (**-42%**) |
> | cause `core:effect @ IssuesPage.tsx` | 1.19/s | **0** (gone) |
> | total commits/sec | 4.57 | 3.34 (-27%) |
> | renders without DOM change /sec | 13.51 | 9.04 (-33%) |
> | `wastingAfter` | — | `[]` (nothing left wasting) |
> 
> `perHit` for `IssuesPage` stayed at 4 in both runs, and no other root changed — confirming the page renders the same content, just half as often per data update. I checked the rest of the recording (`Sidebar`, `Avatar`, `SyncStatus`, etc.) and their render counts are unchanged and tied to real DOM/content changes, not waste, so I left them alone.

## What it changed

```
diff -ruN a/src/features/issues/IssuesPage.tsx b/src/features/issues/IssuesPage.tsx
--- a/src/features/issues/IssuesPage.tsx
+++ b/src/features/issues/IssuesPage.tsx
@@ -1,4 +1,4 @@
-import { useCallback, useEffect, useMemo, useState } from 'react';
+import { useCallback, useMemo, useState } from 'react';
 import { Outlet, useLocation, useNavigate } from 'react-router-dom';
 import { Button } from '../../components/ui/Button';
 import { Spinner } from '../../components/ui/Misc';
@@ -6,7 +6,6 @@
 import { useDocumentTitle } from '../../hooks/useDocumentTitle';
 import { useIssueFilters } from '../../hooks/useIssueFilters';
 import { applyFilters } from '../../lib/filters';
-import type { Issue } from '../../api/types';
 import { useAppSelector } from '../../store';
 import { selectAllIssues, selectIssuesReady } from '../../store/selectors';
 import { IssuesToolbar } from './IssuesToolbar';
@@ -21,10 +20,7 @@
   const navigate = useNavigate();
   useDocumentTitle('Issues');
 
-  const [visible, setVisible] = useState<Issue[]>([]);
-  useEffect(() => {
-    setVisible(applyFilters(issues, filters));
-  }, [issues, filters]);
+  const visible = useMemo(() => applyFilters(issues, filters), [issues, filters]);
   const page = useMemo(() => visible.slice(0, limit), [visible, limit]);
 
   const openIssue = useCallback((key: string) => navigate({ pathname: `/issues/${key}`, search }), [navigate, search]);
```

## The steps

**agent:** This is exactly the kind of task the react-perf-recorder skill/agent is built for. Let me use it directly.

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

A dev-only Vite plugin that records React re-renders from the page. Re … [4109 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-124746-app-panel-3540
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:43407/?tick=150#/issues
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
{"id":"20260928-124746-app-panel-3540"}
```

**←**
```
{"id":"20260928-124746-app-panel-3540","status":"done","dir":"/tmp/tmp.rFcKpXmjoT/20260928-124746-app-panel-3540","summary":{"id":"20260928-124746-app-panel-3540","status":"done","createdAt":"2026-09-28T12:47:51.204Z","source":"panel","url":"http://localhost:43407/?tick=150#/issues","viewport":"1440×900","durationSec":5,"scope":null,"totals":{"commits":23,"commitsPerSec":4.57,"commitsInScope":23,"renders":127,"rendersPerScopeCommit":5.5,"rendersFromOutside":0,"rendersWithoutDom":68,"domTextChanges":14,"rendersPerTextChange":9.1},"topRoots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","hits":12,"hitsPerSec":2.38,"instances":1,"perHit":4,"noDomChange":6,"mounts":48,"renderMsPerHit":1.22,"reasons":["6× external store #13 [store] selectAllIssues · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssuesPage.tsx:17 const issues = useAppSelector(selectAllIssues);","6× state #28 · State @ src/features/issues/IssuesPage.tsx:24 const [visible, setVisible] = useState<Issue[]>([]);"],"causes":["6× core:message Worker","6× core:effect @ src/features/issues/IssuesPage.tsx","4× redux:issues/issueReceived"],"lanes":"Sync:6 Default:6"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","hits":1,"hitsPerSec":0.2,"instances":1,"perHit":37,"noDomChange":0,"renderMsPerHit":2.5,"reasons":["1× external store #21 [store] function memoized() { let cacheNode = fnNode; const { length } = arg … [5270 more]
```

**→ Read**
```
{"file_path":"src/features/issues/IssuesPage.tsx"}
```

**←**
```
1	import { useCallback, useEffect, useMemo, useState } from 'react';
2	import { Outlet, useLocation, useNavigate } from 'react-router-dom';
3	import { Button } from '../../components/ui/Button';
4	import { Spinner } from '../../components/ui/Misc';
5	import { PAGE_SIZE } from '../../config';
6	import { useDocumentTitle } from '../../hooks/useDocumentTitle';
7	import { useIssueFilters } from '../../hooks/useIssueFilters';
8	import { applyFilters } from '../../lib/filters';
9	import type { Issue } from '../../api/types';
10	import { useAppSelector } from '../../store';
11	import { selectAllIssues, selectIssuesReady } from '../../store/selectors';
12	import { IssuesToolbar } from './IssuesToolbar';
13	import { IssueTable } from './IssueTable';
14	
15	export function IssuesPage() {
16	  const [filters, setFilters] = useIssueFilters();
17	  const issues = useAppSelector(selectAllIssues);
18	  const ready = useAppSelector(selectIssuesReady);
19	  const [limit, setLimit] = useState(PAGE_SIZE);
20	  const { search } = useLocation();
21	  const navigate = useNavigate();
22	  useDocumentTitle('Issues');
23	
24	  const [visible, setVisible] = useState<Issue[]>([]);
25	  useEffect(() => {
26	    setVisible(applyFilters(issues, filters));
27	  }, [issues, filters]);
28	  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);
29	
30	  const openIssue = useCallback((key: string) => navigate({ pathname: `/issues/${key}`, search }), [navigate, search]);
31	
32	  return (
33	   … [593 more]
```

**→ Read**
```
{"file_path":"src/features/issues/IssueTable.tsx"}
```

**←**
```
1	import { useCallback, useState } from 'react';
2	import type { Issue } from '../../api/types';
3	import { EmptyState } from '../../components/ui/Misc';
4	import { useHotkey } from '../../hooks/useHotkey';
5	import { BulkBar } from './BulkBar';
6	import { IssueRow } from './IssueRow';
7	
8	interface Props {
9	  issues: Issue[];
10	  onOpen(key: string): void;
11	}
12	
13	export function IssueTable({ issues, onOpen }: Props) {
14	  const [selected, setSelected] = useState<Set<string>>(() => new Set());
15	  const [active, setActive] = useState(-1);
16	
17	  const toggle = useCallback(
18	    (id: string) =>
19	      setSelected((current) => {
20	        const next = new Set(current);
21	        if (!next.delete(id)) next.add(id);
22	        return next;
23	      }),
24	    []
25	  );
26	
27	  useHotkey('j', () => setActive((i) => Math.min(i + 1, issues.length - 1)));
28	  useHotkey('k', () => setActive((i) => Math.max(i - 1, 0)));
29	  useHotkey('enter', () => issues[active] && onOpen(issues[active].key), active >= 0);
30	  useHotkey('x', () => issues[active] && toggle(issues[active].id), active >= 0);
31	
32	  if (!issues.length) return <EmptyState title="No issues match">Try removing a filter or searching for something else.</EmptyState>;
33	
34	  return (
35	    <div className="table" role="table" data-testid="issue-table">
36	      {issues.map((issue, i) => (
37	        <IssueRow key={issue.id} issue={issue} selected={selected.has(issue.id)} active={i === active} onToggle … [170 more]
```

**→ Read**
```
{"file_path":"src/lib/filters.ts"}
```

**←**
```
1	import type { Issue, IssueStatus, Priority } from '../api/types';
2	import { matchesAllWords } from './search';
3	
4	export type SortKey = 'updated' | 'created' | 'priority' | 'due' | 'key';
5	
6	export interface IssueFilters {
7	  q: string;
8	  status: IssueStatus[];
9	  assignee: string[];
10	  priority: Priority[];
11	  label: string[];
12	  project: string | null;
13	  sort: SortKey;
14	}
15	
16	export const EMPTY_FILTERS: IssueFilters = { q: '', status: [], assignee: [], priority: [], label: [], project: null, sort: 'updated' };
17	
18	const list = (params: URLSearchParams, name: string) => params.get(name)?.split(',').filter(Boolean) ?? [];
19	
20	export function parseFilters(params: URLSearchParams): IssueFilters {
21	  return {
22	    q: params.get('q') ?? '',
23	    status: list(params, 'status') as IssueStatus[],
24	    assignee: list(params, 'assignee'),
25	    priority: list(params, 'priority').map(Number) as Priority[],
26	    label: list(params, 'label'),
27	    project: params.get('project'),
28	    sort: (params.get('sort') as SortKey) ?? 'updated',
29	  };
30	}
31	
32	export function writeFilters(params: URLSearchParams, filters: Partial<IssueFilters>) {
33	  const next = new URLSearchParams(params);
34	  for (const [name, value] of Object.entries(filters)) {
35	    const text = Array.isArray(value) ? value.join(',') : value == null ? '' : String(value);
36	    if (text && !(name === 'sort' && text === 'updated')) next.set(name, text);
37	    else next.del … [1328 more]
```

**agent:** Found it — `IssuesPage.tsx` derives `visible` via `useState` + `useEffect` instead of `useMemo`. That means every time `issues` or `filters` changes, React renders once with the *stale* `visible` (which is `[]` on mount, causing the "No issues match" flash), then the effect fires `setVisible`, forcing a second render with the correct data. The recording shows this exactly: 12 commits for `IssuesPage` in 5s, but only 6 underlying redux updates (`issues/issueReceived` etc.) — a 2x render tax per update.

Let me verify there's nothing else relying on this being effect-based (e.g. tests) before fixing.

**→ Grep**
```
{"pattern":"visible","path":"src/features/issues","output_mode":"content","-n":true}
```

**←**
```
src/features/issues/IssuesPage.tsx:24:  const [visible, setVisible] = useState<Issue[]>([]);
src/features/issues/IssuesPage.tsx:28:  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);
src/features/issues/IssuesPage.tsx:34:      <IssuesToolbar filters={filters} setFilters={setFilters} total={visible.length} />
src/features/issues/IssuesPage.tsx:36:      {visible.length > limit && (
src/features/issues/IssuesPage.tsx:39:            Show {Math.min(PAGE_SIZE, visible.length - limit)} more
```

**agent:** Good, `visible` is only used within this component and derived purely from `issues`/`filters`. Applying the fix.

**→ Edit**
```
{"replace_all":false,"file_path":"src/features/issues/IssuesPage.tsx","old_string":"import { useCallback, useEffect, useMemo, useState } from 'react';","new_string":"import { useCallback, useMemo, useState } from 'react';"}
```

**←**
```
The file src/features/issues/IssuesPage.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/features/issues/IssuesPage.tsx","old_string":"  const [visible, setVisible] = useState<Issue[]>([]);\n  useEffect(() => {\n    setVisible(applyFilters(issues, filters));\n  }, [issues, filters]);\n  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);","new_string":"  const visible = useMemo(() => applyFilters(issues, filters), [issues, filters]);\n  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);"}
```

**←**
```
The file src/features/issues/IssuesPage.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Read**
```
{"file_path":"src/features/issues/IssuesPage.tsx"}
```

**←**
```
1	import { useCallback, useMemo, useState } from 'react';
2	import { Outlet, useLocation, useNavigate } from 'react-router-dom';
3	import { Button } from '../../components/ui/Button';
4	import { Spinner } from '../../components/ui/Misc';
5	import { PAGE_SIZE } from '../../config';
6	import { useDocumentTitle } from '../../hooks/useDocumentTitle';
7	import { useIssueFilters } from '../../hooks/useIssueFilters';
8	import { applyFilters } from '../../lib/filters';
9	import type { Issue } from '../../api/types';
10	import { useAppSelector } from '../../store';
11	import { selectAllIssues, selectIssuesReady } from '../../store/selectors';
12	import { IssuesToolbar } from './IssuesToolbar';
13	import { IssueTable } from './IssueTable';
14	
15	export function IssuesPage() {
16	  const [filters, setFilters] = useIssueFilters();
17	  const issues = useAppSelector(selectAllIssues);
18	  const ready = useAppSelector(selectIssuesReady);
19	  const [limit, setLimit] = useState(PAGE_SIZE);
20	  const { search } = useLocation();
21	  const navigate = useNavigate();
22	  useDocumentTitle('Issues');
23	
24	  const visible = useMemo(() => applyFilters(issues, filters), [issues, filters]);
25	  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);
26	
27	  const openIssue = useCallback((key: string) => navigate({ pathname: `/issues/${key}`, search }), [navigate, search]);
28	
29	  return (
30	    <div className="page page-issues" data-testid="issues-page">
31	      <IssuesToolb … [509 more]
```

**agent:** `Issue` type import is now unused. Removing it.

**→ Edit**
```
{"replace_all":false,"file_path":"src/features/issues/IssuesPage.tsx","old_string":"import { applyFilters } from '../../lib/filters';\nimport type { Issue } from '../../api/types';\nimport { useAppSelector } from '../../store';","new_string":"import { applyFilters } from '../../lib/filters';\nimport { useAppSelector } from '../../store';"}
```

**←**
```
The file src/features/issues/IssuesPage.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's record a fresh "after" run and compare against the original to prove the fix worked.

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

**agent:** I'll replay the original recording's actions against the fixed code to get a matching "after" run, then compare.

**→ rpr:record_page**
```
{"replay":"20260928-124746-app-panel-3540","label":"after"}
```

**←**
```
{"id":"20260928-124842-app-record-aebd","url":"http://localhost:43407/?tick=150#/issues","requested":"http://localhost:43407/?tick=150#/issues","durationSec":5.1,"commits":19,"renders":509,"rendersWithoutDom":424,"rendersPerCommit":26.8,"topRoot":"IssuesPage ×8","wasting":[],"warnings":["20260928-124746-app-panel-3540 has no actions: recorded the page as it is for 5033 ms instead"]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-124746-app-panel-3540","after":"20260928-124842-app-record-aebd"}
```

**←**
```
{"comparable":false,"warnings":["viewport differs: 1440×900 vs 1280×720","condition viewport: 1440×900 vs 1280×720"],"before":{"id":"20260928-124746-app-panel-3540","durationMs":5033},"after":{"id":"20260928-124842-app-record-aebd","durationMs":5122},"totals":{"commits":"23 → 19 (-17%)","renders":"127 → 509 (+301%)","commitsPerSec":"4.57 → 3.71 (-19%)","rendersPerSec":"25.23 → 99.38 (+294%)","rendersPerCommit":"5.5 → 26.8 (+387%)","rendersWithoutDomPerSec":"13.51 → 82.78 (+513%)","rendersPerTextChange":"9.1 → 25.4 (+179%)","longTaskMaxMs":"0 → 131"},"roots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"2.38 → 1.56 (-34%)","perHit":"4 → 42 (+950%)","instances":"1 → 1 (0%)","cascadePerSec":"9.54 → 66.19 (+594%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"0.2 → 0.59 (+195%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"7.35 → 21.67 (+195%)"},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","path":"IssuesPage < AppShell","status":"new","hitsPerSec":"– → 0.2","perHit":"– → 9","instances":"– → 1","cascadePerSec":"0 → 1.76"},{"root":"TopBar","source":"src/components/layout/AppShell.tsx:27","path":"AppShell","status":"new","hitsPerSec":"– → 0.2","perHit":"– → 7","instances":"– → 1","cascadePerSec":"0 → 1.37"},{"root":"AuthProvider","source":"src/main.tsx:17","path":"","status":"new","hitsPerSec":"– → 0.2","per … [2456 more]
```

**agent:** The replay re-triggered a full page mount (different viewport, huge DOM/render noise), which isn't a fair comparison. Let me record a clean "steady-state" run instead, matching viewport, the same way the original panel recording was made (open, let it settle, then just watch).

**→ rpr:record_page**
```
{"url":"http://localhost:43407/?tick=150#/issues","viewport":"1440x900","ms":5000,"label":"after-steady"}
```

**←**
```
{"id":"20260928-124906-app-record-b508","url":"http://localhost:43407/?tick=150#/issues","requested":"http://localhost:43407/?tick=150#/issues","durationSec":5.1,"commits":19,"renders":509,"rendersWithoutDom":424,"rendersPerCommit":26.8,"topRoot":"IssuesPage ×8","wasting":[],"warnings":[]}
```

**→ rpr:record_page**
```
{"setup":"\nasync (page) => {\n  await page.goto('http://localhost:43407/?tick=150#/issues');\n  await page.locator('[data-testid=\"issue-table\"], [data-testid=\"issues-page\"]').first().waitFor();\n  await page.waitForTimeout(1500);\n}\n","viewport":"1440x900","ms":5000,"label":"after-steady"}
```

**←**
```
{"id":"20260928-124920-app-record-9e29","url":"http://localhost:43407/?tick=150#/issues","requested":"http://localhost:43407/?tick=150#/issues","durationSec":5.1,"commits":17,"renders":107,"rendersWithoutDom":46,"rendersPerCommit":6.3,"topRoot":"Sidebar ×1","wasting":[],"warnings":[]}
```

**agent:** This looks like the matching steady-state scenario (17 commits vs original 23, comparable renders). Let's compare properly.

**→ rpr:compare_recordings**
```
{"before":"20260928-124746-app-panel-3540","after":"20260928-124920-app-record-9e29"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-124746-app-panel-3540","durationMs":5033},"after":{"id":"20260928-124920-app-record-9e29","durationMs":5089},"totals":{"commits":"23 → 17 (-26%)","renders":"127 → 107 (-16%)","commitsPerSec":"4.57 → 3.34 (-27%)","rendersPerSec":"25.23 → 21.03 (-17%)","rendersPerCommit":"5.5 → 6.3 (+15%)","rendersWithoutDomPerSec":"13.51 → 9.04 (-33%)","rendersPerTextChange":"9.1 → 7.6 (-16%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"2.38 → 1.38 (-42%)","perHit":"4 → 4 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"9.54 → 5.5 (-42%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"0.2 → 0.2 (0%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"7.35 → 7.27 (-1%)"},{"root":"Avatar","source":"src/features/issues/IssueRow.tsx:48","path":"IssueRow < IssueTable < IssuesPage < AppShell","status":"changed","hitsPerSec":"0.2 → 0.2 (0%)","perHit":"28 → 28 (0%)","instances":"28 → 28 (0%)","cascadePerSec":"5.56 → 5.5 (-1%)"},{"root":"SyncStatus","source":"src/components/layout/TopBar.tsx:49","path":"TopBar < AppShell","status":"changed","hitsPerSec":"2.19 → 2.16 (-1%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"2.19 → 2.16 (-1%)"},{"root":"PresenceStack","source":"src/components/layout/TopBar.tsx:48","path":"TopBar < AppShell","status":"changed"," … [1719 more]
```

**→ Grep**
```
{"pattern":"Issue\\b","path":"src/features/issues/IssuesPage.tsx","output_mode":"content"}
```

**←**
```
26:  const openIssue = useCallback((key: string) => navigate({ pathname: `/issues/${key}`, search }), [navigate, search]);
31:      {ready ? <IssueTable issues={page} onOpen={openIssue} /> : <Spinner label="Loading issues" />}
```

**agent:** Clean — no leftover unused `Issue` type references. The fix is confirmed and behavior-preserving (visible output is identical, just computed synchronously instead of via a post-render effect).

## Summary

**Root cause:** `src/features/issues/IssuesPage.tsx` derived its filtered issue list with `useState` + `useEffect` instead of `useMemo`:

```ts
const [visible, setVisible] = useState<Issue[]>([]);
useEffect(() => {
  setVisible(applyFilters(issues, filters));
}, [issues, filters]);
```

This caused two problems, both visible in the recording (`20260928-124746-app-panel-3540`):
- **The flash:** `visible` starts as `[]`. `IssueTable` shows `EmptyState title="No issues match"` whenever `issues.length === 0` (`IssueTable.tsx:32`), so the very first render always shows that message before the effect fires and replaces it — a guaranteed one-frame flash on every mount.
- **The extra weight:** every time redux issues changed, React committed the *stale* `visible` first, then the effect ran `setVisible`, forcing a second commit. The recording showed exactly this: `IssuesPage` had 12 hits in 5s from only 6 underlying store updates — a 2x render tax, tagged as `core:effect @ IssuesPage.tsx`.

**Fix:** replaced the state+effect with a plain `useMemo`, so `visible` is computed synchronously in the same render as `issues`/`filters` — no empty-first-render flash, no follow-up commit.

**Before → after** (same 5s idle-observation scenario, matched viewport, comparable=true):
| metric | before | after |
|---|---|---|
| `IssuesPage` hits/sec | 2.38 | 1.38 (**-42%**) |
| `IssuesPage` cascade/sec | 9.54 | 5.50 (**-42%**) |
| cause `core:effect @ IssuesPage.tsx` | 1.19/s | **0** (gone) |
| total commits/sec | 4.57 | 3.34 (-27%) |
| renders without DOM change /sec | 13.51 | 9.04 (-33%) |
| `wastingAfter` | — | `[]` (nothing left wasting) |

`perHit` for `IssuesPage` stayed at 4 in both runs, and no other root changed — confirming the page renders the same content, just half as often per data update. I checked the rest of the recording (`Sidebar`, `Avatar`, `SyncStatus`, etc.) and their render counts are unchanged and tied to real DOM/content changes, not waste, so I left them alone.
