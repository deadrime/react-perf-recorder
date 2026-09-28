# orbit-row-callback-rec, with the plugin, run 1

not verified; checks 4 of 4; $0.55, 227 s, 5 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: the issue list stutters every time a teammate edits an issue.
To reproduce: open the issue list, wait for the issues to load, then leave it alone for a few seconds while teammates work.
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> Confirmed — `openIssue` is already `useCallback`-wrapped, so it's stable; the fix just stops `IssueTable` from re-wrapping it in a fresh closure per row before handing it to the memoized `IssueRow`.
> 
> ## Findings
> 
> Yes — the issue list was re-rendering for nothing on every teammate edit.
> 
> **Root cause:** `IssueTable.tsx` was passing `onOpen={() => onOpen(issue.key)}` — a brand-new function every render — into `IssueRow`, which is wrapped in `React.memo`. That fresh function reference broke the memo's shallow prop comparison, so **all 59 visible rows re-rendered on every simulated teammate edit**, even though Redux's entity adapter kept the other 58 issues' data referentially identical. The wasted `IssueRow` renders cascaded into unmemoized children (`PriorityIcon`, `StatusIcon`, `TimeAgo`), accounting for 94% of all renders in the original recording.
> 
> **Fix (2 files, no behavior change):**
> - `IssueRow.tsx` — `onOpen` now takes the issue `key` as an argument; the row builds `() => onOpen(issue.key)` internally instead of receiving a per-row wrapper from the parent.
> - `IssueTable.tsx` — passes the already-stable `onOpen` straight through instead of wrapping it per row.
> 
> This mirrors the pattern already used in the board view, so it's consistent with the codebase's existing convention. Click/navigation behavior is unchanged.
> 
> **Before → after (same 5s idle window, same 18 simulated edits both times):**
> - Total renders: 1759 → 107 (**-94%**)
> - Renders with no DOM change: 332.7/s → 9.0/s (**-97%**)
> - `IssuesPage` cascade size: 240 renders/edit → 4 renders/edit (**-98%**)
> - Comparison tool confirms: no cascade root still wastes renders after the fix, and unrelated roots (`Sidebar`, `Avatar`, etc.) were untouched by the change.
> 
> Original recording (`20260928-143622-app-panel-8693`) reproduced deterministically to validate the "before" numbers; fresh recordings were taken before/after the fix for the comparison.

## What it changed

```
diff -ruN a/src/features/issues/IssueRow.tsx b/src/features/issues/IssueRow.tsx
--- a/src/features/issues/IssueRow.tsx
+++ b/src/features/issues/IssueRow.tsx
@@ -13,7 +13,7 @@
   selected: boolean;
   active: boolean;
   onToggle(id: string): void;
-  onOpen(): void;
+  onOpen(key: string): void;
 }
 
 export const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {
@@ -25,7 +25,7 @@
       role="row"
       data-testid="issue-row"
       data-key={issue.key}
-      onClick={onOpen}
+      onClick={() => onOpen(issue.key)}
     >
       <span className="cell-check" onClick={(e) => e.stopPropagation()}>
         <input type="checkbox" checked={selected} onChange={() => onToggle(issue.id)} aria-label={`Select ${issue.key}`} />
diff -ruN a/src/features/issues/IssueTable.tsx b/src/features/issues/IssueTable.tsx
--- a/src/features/issues/IssueTable.tsx
+++ b/src/features/issues/IssueTable.tsx
@@ -40,7 +40,7 @@
           selected={selected.has(issue.id)}
           active={i === active}
           onToggle={toggle}
-          onOpen={() => onOpen(issue.key)}
+          onOpen={onOpen}
         />
       ))}
       {selected.size > 0 && <BulkBar ids={selected} onClear={() => setSelected(new Set())} />}
```

## The steps

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:37329/?tick=150#/issues
2	
```

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-143622-app-panel-8693
2	
```

**agent:** I'll delegate this to the perf-recorder agent, which is purpose-built to analyze the recording, identify unnecessary re-renders, fix them in `./src`, and produce before/after numbers.

**→ Agent**
```
{"description":"Diagnose and fix issue-list stutter","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app's source is in ./src (relative to .), dev server running at http://localhost:37329/?tick=150#/issues (see ./dev-url.txt).\n\nUser complaint: the issue list stutters every time a teammate edits an issue. Repro: open the issue list, wait for issues to load, then leave it alone for a few seconds while teammates work (presumably simulated background updates via the `tick` param or similar).\n\nThe user already recorded this scenario using the … [1141 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a0508ec466f20a817 (internal ID - do not mention to user. Use SendMessage with to: 'a0508ec466f20a817', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-uKF3s7/tmp/claude-0/-tmp-claude-eval-uKF3s7-home-cwd/1f50827f-c030-4578-97e1-7c2aea8a0491/tasks/a0508ec466f20a817.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording (`20260928-143622-app-panel-8693`), find any wasteful re-renders, fix them in `./src` without altering page output, and produce before/after numbers. It's running in the background — I'll report back once it completes.

> **→ rpr:get_recording**
> ```
> {"id":"20260928-143622-app-panel-8693"}
> ```

> **←**
> ```
> {"id":"20260928-143622-app-panel-8693","status":"done","dir":"/tmp/tmp.1F5kXmNeJQ/20260928-143622-app-panel-8693","summary":{"id":"20260928-143622-app-panel-8693","status":"done","createdAt":"2026-09-28T14:36:27.194Z","source":"panel","url":"http://localhost:37329/?tick=150#/issues","viewport":"1440×900","durationSec":5,"scope":null,"totals":{"commits":18,"commitsPerSec":3.58,"commitsInScope":18,"renders":1759,"rendersPerScopeCommit":97.7,"rendersFromOutside":0,"rendersWithoutDom":1691,"domTextChanges":14,"rendersPerTextChange":125.6},"topRoots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","hits":7,"hitsPerSec":1.39,"instances":1,"perHit":240,"noDomChange":0,"mounts":56,"renderMsPerHit":10.8,"reasons":["7× external store #13 [store] selectAllIssues · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssuesPage.tsx:16 const issues = useAppSelector(selectAllIssues);"],"causes":["7× core:message Worker","5× redux:issues/issueReceived","2× redux:issues/commentCounted"],"lanes":"Sync:7"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","hits":1,"hitsPerSec":0.2,"instances":1,"perHit":37,"noDomChange":0,"renderMsPerHit":1.8,"reasons":["1× external store #21 [store] function memoized() { let cacheNode = fnNode; const { length } = arguments; for (let i = 0, l = leng · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/layout … [4916 more]
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-143622-app-panel-8693","section":"roots"}
> ```

> **←**
> ```
> {"id":"20260928-143622-app-panel-8693","status":"done","dir":"/tmp/tmp.1F5kXmNeJQ/20260928-143622-app-panel-8693","roots":{"total":6,"offset":0,"items":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","hits":7,"hitsPerSec":1.39,"instances":1,"perHit":240,"noDomChange":0,"mounts":56,"renderMsPerHit":10.8,"reasons":["7× external store #13 [store] selectAllIssues · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssuesPage.tsx:16 const issues = useAppSelector(selectAllIssues);"],"causes":["7× core:message Worker","5× redux:issues/issueReceived","2× redux:issues/commentCounted"],"lanes":"Sync:7","hooks":{"13":{"type":"useSyncExternalStore","path":["useSelector2","useSyncExternalStoreWithSelector","SyncExternalStore"],"library":"react-redux","libraryAt":0,"site":"src/features/issues/IssuesPage.tsx:16","code":"const issues = useAppSelector(selectAllIssues);"}}},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","hits":1,"hitsPerSec":0.2,"instances":1,"perHit":37,"noDomChange":0,"renderMsPerHit":1.8,"reasons":["1× external store #21 [store] function memoized() { let cacheNode = fnNode; const { length } = arguments; for (let i = 0, l = leng · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/components/layout/Sidebar.tsx:55 const unread = useAppSelector(selectUnreadCount);"],"causes":["1× redux:notifications/notificationReceived","1× core … [4236 more]
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-143622-app-panel-8693","section":"components","top":30}
> ```

> **←**
> ```
> {"id":"20260928-143622-app-panel-8693","status":"done","dir":"/tmp/tmp.1F5kXmNeJQ/20260928-143622-app-panel-8693","components":{"total":22,"offset":0,"items":[{"name":"IssueRow","renders":413,"mounts":7,"withoutDom":406,"byParent":413,"memo":true,"reasons":[{"i":2,"n":413,"reason":"parent: props new ref, same content: onOpen"}],"chains":[{"n":413,"way":"core:message Worker › IssuesPage · store store selectAllIssues › IssueTable · prop issues › IssueRow · new ref, same content onOpen"}]},{"name":"PriorityIcon","renders":413,"mounts":7,"withoutDom":413,"byParent":413,"reasons":[{"i":3,"n":413,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":413,"way":"core:message Worker › IssuesPage · store store selectAllIssues › IssueTable · prop issues › IssueRow · new ref, same content onOpen › PriorityIcon · props equal"}]},{"name":"StatusIcon","renders":413,"mounts":7,"withoutDom":413,"byParent":413,"reasons":[{"i":3,"n":413,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":413,"way":"core:message Worker › IssuesPage · store store selectAllIssues › IssueTable · prop issues › IssueRow · new ref, same content onOpen › StatusIcon · props equal"}]},{"name":"TimeAgo","renders":413,"mounts":7,"withoutDom":413,"byParent":413,"reasons":[{"i":3,"n":413,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":413,"way":"core:message Worker › IssuesPage · store store selectAllIssues › IssueTable · prop issues › IssueRow · new ref, same content onOpen › T … [4327 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/IssueRow.tsx"}
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
> 16	  onOpen(): void;
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
> 28	      onClick={onOpen}
> 29	    >
> 30	      <span className="cell-check" onClick={(e) => e.stopPropagation()}>
> 31	        <input type="checkbox" checked={selected} onChange={() => onToggle(issue.id)} aria-label={`Select ${issue.key}`} />
> 32	      </span>
> 33	      <PriorityIcon priority={issue.priority} />
> 34	      <span className="cell-key muted">{issue.key}</span>
> 35	      <StatusIcon status={issue.status} />
> 36	      <span … [1036 more]
> ```

> **→ Grep**
> ```
> {"pattern":"IssueTable","path":"src","output_mode":"files_with_matches"}
> ```

> **←**
> ```
> Found 2 files
> src/features/issues/IssueTable.tsx
> src/features/issues/IssuesPage.tsx
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/IssueTable.tsx"}
> ```

> **←**
> ```
> 1	import { useCallback, useState } from 'react';
> 2	import type { Issue } from '../../api/types';
> 3	import { EmptyState } from '../../components/ui/Misc';
> 4	import { useHotkey } from '../../hooks/useHotkey';
> 5	import { BulkBar } from './BulkBar';
> 6	import { IssueRow } from './IssueRow';
> 7	
> 8	interface Props {
> 9	  issues: Issue[];
> 10	  onOpen(key: string): void;
> 11	}
> 12	
> 13	export function IssueTable({ issues, onOpen }: Props) {
> 14	  const [selected, setSelected] = useState<Set<string>>(() => new Set());
> 15	  const [active, setActive] = useState(-1);
> 16	
> 17	  const toggle = useCallback(
> 18	    (id: string) =>
> 19	      setSelected((current) => {
> 20	        const next = new Set(current);
> 21	        if (!next.delete(id)) next.add(id);
> 22	        return next;
> 23	      }),
> 24	    []
> 25	  );
> 26	
> 27	  useHotkey('j', () => setActive((i) => Math.min(i + 1, issues.length - 1)));
> 28	  useHotkey('k', () => setActive((i) => Math.max(i - 1, 0)));
> 29	  useHotkey('enter', () => issues[active] && onOpen(issues[active].key), active >= 0);
> 30	  useHotkey('x', () => issues[active] && toggle(issues[active].id), active >= 0);
> 31	
> 32	  if (!issues.length) return <EmptyState title="No issues match">Try removing a filter or searching for something else.</EmptyState>;
> 33	
> 34	  return (
> 35	    <div className="table" role="table" data-testid="issue-table">
> 36	      {issues.map((issue, i) => (
> 37	        <IssueRow
> 38	          key={issue.id}
> 39	          issue={issue}
> 40	          selected={selected.has(is … [276 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/IssuesPage.tsx"}
> ```

> **←**
> ```
> 1	import { useCallback, useMemo, useState } from 'react';
> 2	import { Outlet, useLocation, useNavigate } from 'react-router-dom';
> 3	import { Button } from '../../components/ui/Button';
> 4	import { Spinner } from '../../components/ui/Misc';
> 5	import { PAGE_SIZE } from '../../config';
> 6	import { useDocumentTitle } from '../../hooks/useDocumentTitle';
> 7	import { useIssueFilters } from '../../hooks/useIssueFilters';
> 8	import { applyFilters } from '../../lib/filters';
> 9	import { useAppSelector } from '../../store';
> 10	import { selectAllIssues, selectIssuesReady } from '../../store/selectors';
> 11	import { IssuesToolbar } from './IssuesToolbar';
> 12	import { IssueTable } from './IssueTable';
> 13	
> 14	export function IssuesPage() {
> 15	  const [filters, setFilters] = useIssueFilters();
> 16	  const issues = useAppSelector(selectAllIssues);
> 17	  const ready = useAppSelector(selectIssuesReady);
> 18	  const [limit, setLimit] = useState(PAGE_SIZE);
> 19	  const { search } = useLocation();
> 20	  const navigate = useNavigate();
> 21	  useDocumentTitle('Issues');
> 22	
> 23	  const visible = useMemo(() => applyFilters(issues, filters), [issues, filters]);
> 24	  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);
> 25	
> 26	  const openIssue = useCallback((key: string) => navigate({ pathname: `/issues/${key}`, search }), [navigate, search]);
> 27	
> 28	  return (
> 29	    <div className="page page-issues" data-testid="issues-page">
> 30	      <IssuesToolbar filters={filters} setFilters={setFilters} tota … [460 more]
> ```

> **→ Grep**
> ```
> {"pattern":"selectAllIssues|issueReceived|commentCounted","path":"src","output_mode":"files_with_matches"}
> ```

> **←**
> ```
> Found 10 files
> src/queries/comments.ts
> src/store/selectors.ts
> src/features/dashboard/StatCards.tsx
> src/features/dashboard/ThroughputChart.tsx
> src/features/issues/IssuesPage.tsx
> src/realtime/socket.ts
> src/store/issues.ts
> src/features/issues/CommentComposer.tsx
> src/features/projects/ProjectsPage.tsx
> src/components/layout/CommandPalette.tsx
> ```

> **→ Read**
> ```
> {"file_path":"src/store/issues.ts"}
> ```

> **←**
> ```
> 1	import { createAsyncThunk, createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
> 2	import { api } from '../api/client';
> 3	import type { Issue, IssuePatch } from '../api/types';
> 4	
> 5	const adapter = createEntityAdapter<Issue>({ sortComparer: (a, b) => b.updatedAt - a.updatedAt });
> 6	
> 7	export const fetchIssues = createAsyncThunk('issues/fetch', () => api.issues());
> 8	
> 9	/** Optimistic: the patch lands at once and is rolled back if the server says no. */
> 10	export const updateIssue = createAsyncThunk('issues/update', ({ id, patch }: { id: string; patch: IssuePatch }) => api.updateIssue(id, patch));
> 11	
> 12	interface State {
> 13	  status: 'idle' | 'loading' | 'ready' | 'failed';
> 14	  error: string | null;
> 15	  /** Previous values of fields changed optimistically, by issue id. */
> 16	  pending: Record<string, Partial<Issue>>;
> 17	}
> 18	
> 19	const slice = createSlice({
> 20	  name: 'issues',
> 21	  initialState: adapter.getInitialState<State>({ status: 'idle', error: null, pending: {} }),
> 22	  reducers: {
> 23	    /** Someone else changed an issue: the realtime socket says so. */
> 24	    issueReceived(state, action: PayloadAction<Issue>) {
> 25	      if (state.pending[action.payload.id]) return;
> 26	      adapter.upsertOne(state, action.payload);
> 27	    },
> 28	    commentCounted(state, action: PayloadAction<{ id: string; commentCount: number; updatedAt: number }>) {
> 29	      const { id, ...changes } = action.payload;
> 30	      adapter.updateOne(state, { id, changes });
> 3 … [1568 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/store/selectors.ts"}
> ```

> **←**
> ```
> 1	import { createSelector } from '@reduxjs/toolkit';
> 2	import { memoize } from 'proxy-memoize';
> 3	import type { Issue, IssueStatus } from '../api/types';
> 4	import type { RootState } from './index';
> 5	import { issueSelectors } from './issues';
> 6	import { notificationSelectors } from './notifications';
> 7	
> 8	export const selectIssuesState = (state: RootState) => state.issues;
> 9	export const selectAllIssues = (state: RootState) => issueSelectors.selectAll(state.issues);
> 10	export const selectIssueEntities = (state: RootState) => state.issues.entities;
> 11	export const selectIssueById = (state: RootState, id: string): Issue | undefined => state.issues.entities[id];
> 12	export const selectIssuesReady = (state: RootState) => state.issues.status === 'ready';
> 13	
> 14	const selectIdByKey = createSelector([selectAllIssues], (issues) => new Map(issues.map((i) => [i.key, i.id])));
> 15	
> 16	export const selectIssueByKey = (state: RootState, key: string | null | undefined) => {
> 17	  if (!key) return undefined;
> 18	  const id = selectIdByKey(state).get(key);
> 19	  return id ? state.issues.entities[id] : undefined;
> 20	};
> 21	
> 22	export const selectProjectIssues = createSelector([selectAllIssues, (_: RootState, projectId: string) => projectId], (issues, projectId) =>
> 23	  issues.filter((i) => i.projectId === projectId)
> 24	);
> 25	
> 26	export const selectColumnIssues = createSelector(
> 27	  [selectProjectIssues, (_: RootState, _projectId: string, status: IssueStatus) => status],
> 28	  (issues, status) => is … [1913 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ui/TimeAgo.tsx"}
> ```

> **←**
> ```
> 1	import { useNow } from '../../hooks/useNow';
> 2	import { formatDateTime, timeAgo } from '../../lib/time';
> 3	
> 4	export function TimeAgo({ at, prefix = '' }: { at: number; prefix?: string }) {
> 5	  const now = useNow(30_000);
> 6	  return (
> 7	    <time dateTime={new Date(at).toISOString()} title={formatDateTime(at)}>
> 8	      {prefix}
> 9	      {timeAgo(at, now)}
> 10	    </time>
> 11	  );
> 12	}
> 13	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ui/Badges.tsx"}
> ```

> **←**
> ```
> 1	import { memo } from 'react';
> 2	import type { IssueStatus, Priority } from '../../api/types';
> 3	import { PRIORITY_LABEL, STATUS_LABEL } from '../../lib/meta';
> 4	import { useLabelsById } from '../../queries/workspace';
> 5	
> 6	const STATUS_COLOR: Record<IssueStatus, string> = {
> 7	  backlog: '#6e6e7a',
> 8	  todo: '#b4b4be',
> 9	  in_progress: '#f5a524',
> 10	  in_review: '#0091ff',
> 11	  done: '#30a46c',
> 12	  canceled: '#6e6e7a',
> 13	};
> 14	
> 15	export function StatusIcon({ status, size = 14 }: { status: IssueStatus; size?: number }) {
> 16	  const color = STATUS_COLOR[status];
> 17	  const fill = { backlog: 0, todo: 0, in_progress: 0.5, in_review: 0.75, done: 1, canceled: 1 }[status];
> 18	  const r = 5;
> 19	  const c = 2 * Math.PI * r;
> 20	  return (
> 21	    <svg width={size} height={size} viewBox="0 0 14 14" aria-label={STATUS_LABEL[status]}>
> 22	      <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={status === 'backlog' ? '2 2' : undefined} />
> 23	      {fill > 0 && (
> 24	        <circle
> 25	          cx="7"
> 26	          cy="7"
> 27	          r={r / 2}
> 28	          fill="none"
> 29	          stroke={color}
> 30	          strokeWidth={r}
> 31	          strokeDasharray={`${(c / 2) * fill} ${c}`}
> 32	          transform="rotate(-90 7 7)"
> 33	        />
> 34	      )}
> 35	    </svg>
> 36	  );
> 37	}
> 38	
> 39	export function PriorityIcon({ priority }: { priority: Priority }) {
> 40	  if (priority === 1)
> 41	    return (
> 42	      <span className="prio prio-urgent" title={PRIORITY_LABE … [1037 more]
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/IssueRow.tsx","old_string":"  onToggle(id: string): void;\n  onOpen(): void;\n}\n\nexport const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {\n  const showEstimates = useAppStore((s) => s.showEstimates);\n  const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;\n  return (\n    <div\n      className={cx('row-issue', selected && 'row-selected', active && 'row-active')}\n      role=\"row\"\n      data-testid=\"issue-row\"\n      data-k … [621 more]
> ```

> **←**
> ```
> The file src/features/issues/IssueRow.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/IssueTable.tsx","old_string":"          onToggle={toggle}\n          onOpen={() => onOpen(issue.key)}","new_string":"          onToggle={toggle}\n          onOpen={onOpen}"}
> ```

> **←**
> ```
> The file src/features/issues/IssueTable.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now let's verify no other callers of `IssueRow`'s `onOpen` exist with the old zero-arg signature.

> **→ Grep**
> ```
> {"pattern":"IssueRow|onOpen","path":"src","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/features/issues/IssuesPage.tsx:31:      {ready ? <IssueTable issues={page} onOpen={openIssue} /> : <Spinner label="Loading issues" />}
> src/components/layout/NotificationBell.tsx:21:export function NotificationLine({ n, onOpen }: { n: Notification; onOpen?(): void }) {
> src/components/layout/NotificationBell.tsx:31:        onOpen?.();
> src/components/layout/NotificationBell.tsx:73:        <NotificationLine key={n.id} n={n} onOpen={onClose} />
> src/features/issues/IssueRow.tsx:16:  onOpen(key: string): void;
> src/features/issues/IssueRow.tsx:19:export const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {
> src/features/issues/IssueRow.tsx:28:      onClick={() => onOpen(issue.key)}
> src/features/issues/IssueTable.tsx:6:import { IssueRow } from './IssueRow';
> src/features/issues/IssueTable.tsx:10:  onOpen(key: string): void;
> src/features/issues/IssueTable.tsx:13:export function IssueTable({ issues, onOpen }: Props) {
> src/features/issues/IssueTable.tsx:29:  useHotkey('enter', () => issues[active] && onOpen(issues[active].key), active >= 0);
> src/features/issues/IssueTable.tsx:37:        <IssueRow
> src/features/issues/IssueTable.tsx:43:          onOpen={onOpen}
> src/features/board/BoardColumn.tsx:16:  onOpen(key: string): void;
> src/features/board/BoardColumn.tsx:21:export const BoardColumn = memo(function BoardColumn({ projectId, status, onOpen }: Props) {
> src/features/board/BoardColumn.tsx:55:          <IssueCard key={issue.id} issue={issue} onOp … [402 more]
> ```

> **agent:** Good — this matches the existing pattern already used in `IssueCard`/`BoardColumn`, confirming the fix aligns with the codebase's own convention. Now let's measure the fix by replaying the same recording.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-143622-app-panel-8693","label":"after-onOpen-fix"}
> ```

> **←**
> ```
> {"id":"20260928-143819-app-record-1f5b","url":"http://localhost:37329/?tick=150#/issues","requested":"http://localhost:37329/?tick=150#/issues","durationSec":5.1,"commits":23,"renders":603,"rendersWithoutDom":502,"rendersPerCommit":26.2,"topRoot":"IssuesPage ×8","wasting":[{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","hits":3,"instances":1,"noDomChange":3},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","hits":5,"instances":1,"noDomChange":2},{"root":"AuthProvider","source":"src/main.tsx:17","hits":2,"instances":1,"noDomChange":0,"ownDomUnchanged":2}],"warnings":["20260928-143622-app-panel-8693 has no actions: recorded the page as it is for 5027 ms instead"]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-143622-app-panel-8693","after":"latest"}
> ```

> **←**
> ```
> {"comparable":false,"warnings":["\"latest\" is 20260928-143819-app-record-1f5b on localhost:37329; localhost:46787, localhost:37015, localhost:34805 were recorded in the same ten minutes — someone else may record into this folder: pass the id record_page returned","viewport differs: 1440×900 vs 1280×720","condition viewport: 1440×900 vs 1280×720","Sidebar (src/components/layout/AppShell.tsx:25) still renders for nothing, 0 of 1 hits before and 2 of 5 after: the change did not reach its cause"],"before":{"id":"20260928-143622-app-panel-8693","durationMs":5027},"after":{"id":"20260928-143819-app-record-1f5b","durationMs":5148},"totals":{"commits":"18 → 23 (+28%)","renders":"1759 → 603 (-66%)","commitsPerSec":"3.58 → 4.47 (+25%)","rendersPerSec":"349.91 → 117.13 (-67%)","rendersPerCommit":"97.7 → 26.2 (-73%)","rendersWithoutDomPerSec":"336.38 → 97.51 (-71%)","rendersPerTextChange":"125.6 → 30.1 (-76%)","longTaskMaxMs":"0 → 116"},"roots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.39 → 1.55 (+12%)","perHit":"240 → 42 (-82%)","instances":"1 → 1 (0%)","cascadePerSec":"334.2 → 65.85 (-80%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"0.2 → 0.97 (+385%)","perHit":"37 → 34 (-8%)","instances":"1 → 1 (0%)","cascadePerSec":"7.36 → 33.02 (+349%)"},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","path":"IssuesPage < AppShell","statu … [3949 more]
> ```

> **→ Read**
> ```
> {"file_path":"test/eval-plugin/skills/react-perf-recorder/references/measuring-a-fix.md"}
> ```

> **←**
> ````
> 1	# Measuring a fix
> 2	
> 3	Two recordings of one scenario — the code as it was, and the change — then `compare_recordings`. Do it when the cause
> 4	is a guess or numbers were asked for; a recording that names the root, reason and `file:line` is an answer already.
> 5	
> 6	## Route
> 7	
> 8	1. The recording with the problem — the person's, or `record_page`. Keep its id.
> 9	2. The change, in a git worktree when there is git (below); otherwise in place, and put back afterwards.
> 10	3. The same scenario on the change — `compare_recordings`' description says how to record it.
> 11	4. `compare_recordings` with `before: <id>`, `after: <new id>`.
> 12	5. A change that is not kept leaves nothing behind: `git worktree remove`, or the file as it was.
> 13	
> 14	## Worktree
> 15	
> 16	The working tree may hold someone else's changes; do not edit it for a measurement.
> 17	
> 18	```sh
> 19	git worktree add --detach ../<app>-fix && cd ../<app>-fix && npm ci
> 20	REACT_PERF_RECORDER_DIR=<abs path of the first checkout>/.agent-artifacts/perf-recorder npm run dev -- --port <other port>
> 21	```
> 22	
> 23	- `--detach`: no branch is made, and none is switched to.
> 24	- The worktree is the last commit, without uncommitted changes. When `git status` shows changes to files the page
> 25	  uses, record "before" in the worktree as well, before editing, so the sides differ by the fix alone.
> 26	- The variable puts both servers' sessions in the folder the MCP server reads; an `outDir` in the project's config
> 27	  overrides it — then set the s … [1376 more]
> ````

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:37329/?tick=150#/issues","viewport":"1440x900","ms":5000,"label":"after-fix-idle","setup":"async (page) => { await page.goto('http://localhost:37329/?tick=150#/issues'); await page.waitForSelector('[data-testid=\"issue-table\"]'); await page.waitForTimeout(300); }"}
> ```

> **←**
> ```
> {"id":"20260928-143856-app-record-fee7","url":"http://localhost:37329/?tick=150#/issues","requested":"http://localhost:37329/?tick=150#/issues","durationSec":5.1,"commits":18,"renders":107,"rendersWithoutDom":46,"rendersPerCommit":5.9,"topRoot":"IssuesPage ×7","wasting":[],"warnings":[]}
> ```

> **agent:** Now let's revert the fix and record the same scenario on the original (buggy) code.

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/IssueTable.tsx","old_string":"          onToggle={toggle}\n          onOpen={onOpen}","new_string":"          onToggle={toggle}\n          onOpen={() => onOpen(issue.key)}"}
> ```

> **←**
> ```
> The file src/features/issues/IssueTable.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/IssueRow.tsx","old_string":"  onToggle(id: string): void;\n  onOpen(key: string): void;\n}\n\nexport const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {\n  const showEstimates = useAppStore((s) => s.showEstimates);\n  const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;\n  return (\n    <div\n      className={cx('row-issue', selected && 'row-selected', active && 'row-active')}\n      role=\"row\"\n      data-testid=\"issue-row\"\n  … [621 more]
> ```

> **←**
> ```
> The file src/features/issues/IssueRow.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:37329/?tick=150#/issues","viewport":"1440x900","ms":5000,"label":"before-buggy-idle","setup":"async (page) => { await page.goto('http://localhost:37329/?tick=150#/issues'); await page.waitForSelector('[data-testid=\"issue-table\"]'); await page.waitForTimeout(300); }"}
> ```

> **←**
> ```
> {"id":"20260928-143911-app-record-2ed8","url":"http://localhost:37329/?tick=150#/issues","requested":"http://localhost:37329/?tick=150#/issues","durationSec":5.1,"commits":18,"renders":1759,"rendersWithoutDom":1691,"rendersPerCommit":97.7,"topRoot":"IssuesPage ×7","wasting":[],"warnings":[]}
> ```

> **agent:** This matches the original recording almost exactly (18 commits, 1759 renders — identical to the panel recording), confirming reproducibility. Now restore the fix and run the comparison.

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/IssueTable.tsx","old_string":"          onToggle={toggle}\n          onOpen={() => onOpen(issue.key)}","new_string":"          onToggle={toggle}\n          onOpen={onOpen}"}
> ```

> **←**
> ```
> The file src/features/issues/IssueTable.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/IssueRow.tsx","old_string":"  onToggle(id: string): void;\n  onOpen(): void;\n}\n\nexport const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {\n  const showEstimates = useAppStore((s) => s.showEstimates);\n  const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;\n  return (\n    <div\n      className={cx('row-issue', selected && 'row-selected', active && 'row-active')}\n      role=\"row\"\n      data-testid=\"issue-row\"\n      data-k … [621 more]
> ```

> **←**
> ```
> The file src/features/issues/IssueRow.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-143911-app-record-2ed8","after":"20260928-143856-app-record-fee7"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-143911-app-record-2ed8","durationMs":5082},"after":{"id":"20260928-143856-app-record-fee7","durationMs":5090},"totals":{"commits":"18 → 18 (0%)","renders":"1759 → 107 (-94%)","commitsPerSec":"3.54 → 3.54 (0%)","rendersPerSec":"346.12 → 21.02 (-94%)","rendersPerCommit":"97.7 → 5.9 (-94%)","rendersWithoutDomPerSec":"332.74 → 9.04 (-97%)","rendersPerTextChange":"125.6 → 7.6 (-94%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.38 → 1.38 (0%)","perHit":"240 → 4 (-98%)","instances":"1 → 1 (0%)","cascadePerSec":"330.58 → 5.5 (-98%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"0.2 → 0.2 (0%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"7.28 → 7.27 (0%)"},{"root":"Avatar","source":"src/features/issues/IssueRow.tsx:48","path":"IssueRow < IssueTable < IssuesPage < AppShell","status":"changed","hitsPerSec":"0.2 → 0.2 (0%)","perHit":"28 → 28 (0%)","instances":"28 → 28 (0%)","cascadePerSec":"5.51 → 5.5 (0%)"},{"root":"SyncStatus","source":"src/components/layout/TopBar.tsx:49","path":"TopBar < AppShell","status":"changed","hitsPerSec":"2.16 → 2.16 (0%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"2.16 → 2.16 (0%)"},{"root":"PresenceStack","source":"src/components/layout/TopBar.tsx:48","path":"TopBar < AppShell","status":"changed … [1636 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/IssueRow.tsx","offset":1,"limit":30}
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
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/IssueTable.tsx","offset":34,"limit":12}
> ```

> **←**
> ```
> 34	  return (
> 35	    <div className="table" role="table" data-testid="issue-table">
> 36	      {issues.map((issue, i) => (
> 37	        <IssueRow
> 38	          key={issue.id}
> 39	          issue={issue}
> 40	          selected={selected.has(issue.id)}
> 41	          active={i === active}
> 42	          onToggle={toggle}
> 43	          onOpen={onOpen}
> 44	        />
> 45	      ))}
> ```

> **agent:** Fix confirmed in place. Final state is correct.
> 
> ## Summary
> 
> **Cause found:** `IssuesPage` re-renders on every simulated teammate edit (`redux:issues/issueReceived` / `commentCounted`, fired via the `core:message Worker` at `?tick=150`) — that part is legitimate, the list does hold updated data. The waste was downstream: `src/features/issues/IssueTable.tsx:43` (before) passed `onOpen={() => onOpen(issue.key)}` — a brand-new function on every `IssueTable` render — into `IssueRow`, which is `React.memo`-wrapped (`src/features/issues/IssueRow.tsx:19`). That fresh reference broke the memo's shallow prop comparison, so **all 59 visible rows re-rendered on every store tick, even though only one issue's data actually changed** (Redux Toolkit's entity adapter keeps unaffected `Issue` objects referentially stable via Immer). Each wasted `IssueRow` render then cascaded into its non-memoized children `PriorityIcon`, `StatusIcon`, `TimeAgo` (`src/components/ui/Badges.tsx`, `src/components/ui/TimeAgo.tsx`) — recorder's own component reasons literally said `"parent: same props, memo would skip it"` for those three. Together `IssueRow` + those three children accounted for 1,652 of the 1,759 renders (94%) in the original recording, with zero DOM change in the vast majority (`withoutDom`: 406/413, 413/413, 413/413, 413/413).
> 
> **Fix (2 files, no behavior change):**
> - `src/features/issues/IssueRow.tsx:16,28` — `onOpen` prop changed from `(): void` to `(key: string): void`; the row's own `onClick` now builds `() => onOpen(issue.key)` internally (inside the component, so it no longer affects the parent→child prop-equality check).
> - `src/features/issues/IssueTable.tsx:43` — passes the already-stable `onOpen` prop straight through instead of wrapping it in a new arrow function per row.
> - This exactly mirrors the pattern already used for the board view (`src/features/board/IssueCard.tsx:36`, `src/features/board/BoardColumn.tsx`), so it's consistent with the codebase's existing convention, not a new idiom. What's clicked, navigated to, and shown is unchanged — only when `IssueRow`'s memo bails out changed.
> 
> **Proof (before/after, same 5s idle window on `http://localhost:37329/?tick=150#/issues`, 1440×900, no throttle, issue list loaded then left alone — matching the person's repro):**
> - Commits: 18 → 18 (0%) — same number of simulated teammate edits landed both times, confirming a fair comparison.
> - Total renders: 1759 → 107 (**-94%**)
> - Renders without DOM change/sec: 332.7 → 9.0 (**-97%**)
> - `IssuesPage` cascade: 240 renders/hit → 4 renders/hit (**-98%**); cascade rate 330.6/s → 5.5/s (**-98%**)
> - `rendersPerCommit`: 97.7 → 5.9 (**-94%**)
> - `compare_recordings` reports `comparable: true`, no warnings, and `wastingAfter: []` — no cascade root still renders for nothing after the fix.
> - All other roots (`Sidebar`, `Avatar`, `SyncStatus`, `PresenceStack`, `NotificationBell`) are unchanged (0%) before/after — confirming the fix touched only the wasteful path and didn't affect unrelated, legitimate re-renders.
> 
> Session ids: before = `20260928-143911-app-record-2ed8`, after = `20260928-143856-app-record-fee7`, original person's recording = `20260928-143622-app-panel-8693` (reproduced identically: 18 commits / 1759 renders when replayed on the unfixed code, confirming the scenario is deterministic under `tick=150`).
> 
> **What still renders (and why it's fine, not fixed):** `Sidebar` (37 renders/hit from `selectUnreadCount`) and the 28 `Avatar` instances (external `usePresenceStore`/`useMember` subscriptions) are unaffected by this fix and were already correctly gated by their own selectors/memoization — the recorder confirms their `hits` didn't move and `wastingAfter` doesn't list them as wasting.
> 
> **Not checked:**
> - Whether `PriorityIcon`/`StatusIcon`/`TimeAgo` would benefit from their own `React.memo` for the one row that legitimately does update per edit — not measured, since after the `onOpen` fix only 1 of 59 rows re-renders per edit (necessary), so this would be a marginal, unproven optimization on top of an already-fixed path.
> - Behavior/visual regression testing beyond code review (e.g., running the app's test suite, if any) — I verified by reading that the click behavior and props passed are unchanged, and the working tree currently has the fix applied (final state), not the reverted version used to produce the "before" numbers.

**→ Read**
```
{"file_path":"src/features/issues/IssueRow.tsx"}
```

**→ Read**
```
{"file_path":"src/features/issues/IssueTable.tsx"}
```

**←**
```
1	import { memo } from 'react';
2	import type { Issue } from '../../api/types';
3	import { Avatar } from '../../components/ui/Avatar';
4	import { LabelChips, PriorityIcon, StatusIcon } from '../../components/ui/Badges';
5	import { Icon } from '../../components/ui/Icon';
6	import { TimeAgo } from '../../components/ui/TimeAgo';
7	import { cx } from '../../lib/cx';
8	import { dueLabel } from '../../lib/time';
9	import { useAppStore } from '../../store/app';
10	
11	interface Props {
12	  issue: Issue;
13	  selected: boolean;
14	  active: boolean;
15	  onToggle(id: string): void;
16	  onOpen(key: string): void;
17	}
18	
19	export const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {
20	  const showEstimates = useAppStore((s) => s.showEstimates);
21	  const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;
22	  return (
23	    <div
24	      className={cx('row-issue', selected && 'row-selected', active && 'row-active')}
25	      role="row"
26	      data-testid="issue-row"
27	      data-key={issue.key}
28	      onClick={() => onOpen(issue.key)}
29	    >
30	      <span className="cell-check" onClick={(e) => e.stopPropagation()}>
31	        <input type="checkbox" checked={selected} onChange={() => onToggle(issue.id)} aria-label={`Select ${issue.key}`} />
32	      </span>
33	      <PriorityIcon priority={issue.priority} />
34	      <span className="cell-key muted">{issue.key}</span>
35	      <StatusIcon status={iss … [1064 more]
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
37	        <IssueRow
38	          key={issue.id}
39	          issue={issue}
40	          selected={selected.has(is … [259 more]
```

**→ Grep**
```
{"pattern":"onOpen","path":"src/features/issues","output_mode":"content","-n":true}
```

**←**
```
src/features/issues/IssuesPage.tsx:31:      {ready ? <IssueTable issues={page} onOpen={openIssue} /> : <Spinner label="Loading issues" />}
src/features/issues/IssueTable.tsx:10:  onOpen(key: string): void;
src/features/issues/IssueTable.tsx:13:export function IssueTable({ issues, onOpen }: Props) {
src/features/issues/IssueTable.tsx:29:  useHotkey('enter', () => issues[active] && onOpen(issues[active].key), active >= 0);
src/features/issues/IssueTable.tsx:43:          onOpen={onOpen}
src/features/issues/IssueRow.tsx:16:  onOpen(key: string): void;
src/features/issues/IssueRow.tsx:19:export const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {
src/features/issues/IssueRow.tsx:28:      onClick={() => onOpen(issue.key)}
```

**agent:** `openIssue` (`IssuesPage.tsx:31`) — let me confirm it's stable across renders.

**→ Grep**
```
{"pattern":"openIssue","path":"src/features/issues/IssuesPage.tsx","output_mode":"content","-n":true}
```

**←**
```
26:  const openIssue = useCallback((key: string) => navigate({ pathname: `/issues/${key}`, search }), [navigate, search]);
31:      {ready ? <IssueTable issues={page} onOpen={openIssue} /> : <Spinner label="Loading issues" />}
```

**agent:** Confirmed — `openIssue` is already `useCallback`-wrapped, so it's stable; the fix just stops `IssueTable` from re-wrapping it in a fresh closure per row before handing it to the memoized `IssueRow`.

## Findings

Yes — the issue list was re-rendering for nothing on every teammate edit.

**Root cause:** `IssueTable.tsx` was passing `onOpen={() => onOpen(issue.key)}` — a brand-new function every render — into `IssueRow`, which is wrapped in `React.memo`. That fresh function reference broke the memo's shallow prop comparison, so **all 59 visible rows re-rendered on every simulated teammate edit**, even though Redux's entity adapter kept the other 58 issues' data referentially identical. The wasted `IssueRow` renders cascaded into unmemoized children (`PriorityIcon`, `StatusIcon`, `TimeAgo`), accounting for 94% of all renders in the original recording.

**Fix (2 files, no behavior change):**
- `IssueRow.tsx` — `onOpen` now takes the issue `key` as an argument; the row builds `() => onOpen(issue.key)` internally instead of receiving a per-row wrapper from the parent.
- `IssueTable.tsx` — passes the already-stable `onOpen` straight through instead of wrapping it per row.

This mirrors the pattern already used in the board view, so it's consistent with the codebase's existing convention. Click/navigation behavior is unchanged.

**Before → after (same 5s idle window, same 18 simulated edits both times):**
- Total renders: 1759 → 107 (**-94%**)
- Renders with no DOM change: 332.7/s → 9.0/s (**-97%**)
- `IssuesPage` cascade size: 240 renders/edit → 4 renders/edit (**-98%**)
- Comparison tool confirms: no cascade root still wastes renders after the fix, and unrelated roots (`Sidebar`, `Avatar`, etc.) were untouched by the change.

Original recording (`20260928-143622-app-panel-8693`) reproduced deterministically to validate the "before" numbers; fresh recordings were taken before/after the fix for the comparison.
