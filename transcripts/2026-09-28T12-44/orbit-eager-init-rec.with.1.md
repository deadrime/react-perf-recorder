# orbit-eager-init-rec, with the plugin, run 1

fixed (waste 0.25); checks 4 of 4; $0.56, 288 s, 2 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: writing a comment on a busy issue is choppy, while the rest of the page keeps up.
To reproduce: open issue WEB-2, click the comment box and type "Looks good to me, merging after lunch".
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> Fix confirmed in place. Here's the summary.
> 
> **Root cause:** `CommentComposer` (`src/features/issues/CommentComposer.tsx`) subscribed to `selectAllIssues` via `useAppSelector` just to seed a one-time `@mention`/`#reference` search index. That selector returns a fresh array on *every* Redux dispatch, and WEB-2 is busy with constant background traffic (issue updates, comment counts, notifications, presence pings). Each of those unrelated dispatches re-rendered the entire comment form mid-keystroke — 92-94% of its renders changed nothing on screen.
> 
> **Fix:** read the issue list once from the store snapshot at mount instead of subscribing live:
> ```js
> const [references] = useState(() => buildReferenceIndex(selectAllIssues(store.getState())));
> ```
> Same data, same timing, zero visual/behavioral change — it just stops resubscribing the form to unrelated store updates.
> 
> **Before → after** (same recorded repro, replayed both ways):
> - `CommentComposer` re-renders: 2.99/sec → 0.56/sec (**-81%**)
> - Cascade renders/sec: 6.87 → 1.69 (**-75%**)
> - No longer appears in the "wasted render" list at all (was 16 of 17 hits wasted)
> - Longest main-thread task while typing: 235ms → 189ms (-20%)
> 
> Whole-page totals barely moved, as expected — the fix is scoped to this one component; the busy-issue background traffic itself is unrelated overhead.
> 
> **Left alone (separate, pre-existing waste, unaffected by this fix):** `CharCount` re-renders on every keystroke but is ~free; and `IssuesPage`/`IssuesToolbar`/`Sidebar`/etc. re-render off the same unmemoized `selectAllIssues` pattern used app-wide — that's a page-wide issue, not specific to comment typing, so it was left out of scope.

## What it changed

```
diff -ruN a/src/features/issues/CommentComposer.tsx b/src/features/issues/CommentComposer.tsx
--- a/src/features/issues/CommentComposer.tsx
+++ b/src/features/issues/CommentComposer.tsx
@@ -5,7 +5,7 @@
 import { buildReferenceIndex, searchReferences, type ReferenceIndex } from '../../lib/search';
 import { useAddComment } from '../../queries/comments';
 import { useMembers } from '../../queries/members';
-import { useAppSelector } from '../../store';
+import { store } from '../../store';
 import { selectAllIssues } from '../../store/selectors';
 
 const MAX = 2000;
@@ -63,8 +63,11 @@
   const { register, handleSubmit, reset, setValue, getValues, control, formState } = useForm<Values>({ defaultValues: { body: '' } });
   const addComment = useAddComment(issueId);
   const toast = useToast();
-  const issues = useAppSelector(selectAllIssues);
-  const [references] = useState(buildReferenceIndex(issues));
+  // The reference index only ever needs the issue list as it was when the composer mounted —
+  // it is built once, not kept in sync. Reading it from the store snapshot (instead of
+  // subscribing with useAppSelector) avoids re-rendering this whole form on every unrelated
+  // issue update while the user is typing.
+  const [references] = useState(() => buildReferenceIndex(selectAllIssues(store.getState())));
   const [mention, setMention] = useState<string | null>(null);
   const [reference, setReference] = useState<string | null>(null);
   const field = register('body', { required: true, maxLength: MAX, validate: (v) => v.trim().length > 0 });
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-124614-app-panel-b8df
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:38903/?tick=150#/issues/WEB-2
2	
```

**agent:** I'll delegate this to the specialized perf-recorder agent, which has the right tools to read the recording, pinpoint the re-render cause, fix it, and verify with numbers.

**→ Agent**
```
{"description":"Diagnose and fix choppy comment typing","subagent_type":"react-perf-recorder:perf-recorder","run_in_background":false,"prompt":"A React app lives in this folder, source in ./src. Its dev server is already running at the URL in ./dev-url.txt (currently http://localhost:38903/?tick=150#/issues/WEB-2).\n\nComplaint: typing in the comment box on a busy issue (WEB-2) feels choppy/janky, while the rest of the page stays responsive.\n\nRepro steps: open issue WEB-2, click the comment box, and type \"Looks good to me, merging after lunch\".\n\nThere is an existing recording of this rep … [1636 more]
```

> **input:** A React app lives in this folder, source in ./src. Its dev server is already running at the URL in ./dev-url.txt (currently http://localhost:38903/?tick=150#/issues/WEB-2).
> 
> Complaint: typing in the c … [1874 more]

> **→ Read**
> ```
> {"file_path":"recording.txt"}
> ```

> **←**
> ```
> 1	20260928-124614-app-panel-b8df
> 2	
> ```

> **→ Read**
> ```
> {"file_path":"dev-url.txt"}
> ```

> **←**
> ```
> 1	http://localhost:38903/?tick=150#/issues/WEB-2
> 2	
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-124614-app-panel-b8df"}
> ```

> **←**
> ```
> {"id":"20260928-124614-app-panel-b8df","status":"done","dir":"/tmp/tmp.rFcKpXmjoT/20260928-124614-app-panel-b8df","summary":{"id":"20260928-124614-app-panel-b8df","status":"done","createdAt":"2026-09-28T12:46:19.110Z","source":"panel","url":"http://localhost:38903/?tick=150#/issues/WEB-2","viewport":"1440×900","durationSec":4.5,"scope":null,"totals":{"commits":54,"commitsPerSec":12.02,"commitsInScope":54,"renders":249,"rendersPerScopeCommit":4.6,"rendersFromOutside":0,"rendersWithoutDom":180,"domTextChanges":14,"rendersPerTextChange":17.8},"topRoots":[{"root":"IssueDrawer","source":"src/routes.tsx:18","path":"IssuesPage < AppShell","hits":3,"hitsPerSec":0.67,"instances":1,"perHit":26,"noDomChange":0,"mounts":6,"renderMsPerHit":2.13,"reasons":["2× external store #23 [usePresenceStore] useShallow((s)=>Object.keys(s.viewing).filter((id)=>s.viewing[id] === issueKey)) · useViewers › [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssueDrawer.tsx:25 const viewers = useViewers(key);","1× external store #4 [store] (s)=>selectIssueByKey(s, key) · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssueDrawer.tsx:22 const issue = useAppSelector((s) => selectIssueByKey(s, key));"],"causes":["3× core:message Worker","2× zustand:presence/viewing","1× redux:issues/commentCounted"],"lanes":"Sync:3"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"Ap … [7748 more]
> ```

> **→ Grep**
> ```
> {"pattern":"useViewers|usePresenceStore","path":"src","output_mode":"files_with_matches"}
> ```

> **←**
> ```
> Found 6 files
> src/store/presence.ts
> src/components/layout/PresenceStack.tsx
> src/components/ui/Avatar.tsx
> src/features/board/IssueCard.tsx
> src/features/issues/IssueDrawer.tsx
> src/realtime/socket.ts
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/IssueDrawer.tsx"}
> ```

> **←**
> ```
> 1	import { useCallback } from 'react';
> 2	import { useLocation, useNavigate, useParams } from 'react-router-dom';
> 3	import { AvatarStack } from '../../components/ui/Avatar';
> 4	import { IconButton } from '../../components/ui/Button';
> 5	import { EmptyState } from '../../components/ui/Misc';
> 6	import { withPermission } from '../../components/withPermission';
> 7	import { useHotkey } from '../../hooks/useHotkey';
> 8	import { useDocumentTitle } from '../../hooks/useDocumentTitle';
> 9	import { useProject } from '../../queries/workspace';
> 10	import { useAppSelector } from '../../store';
> 11	import { useViewers } from '../../store/presence';
> 12	import { selectIssueByKey, selectIssuesReady } from '../../store/selectors';
> 13	import { CommentComposer, ReadOnlyComposer } from './CommentComposer';
> 14	import { IssueComments } from './IssueComments';
> 15	import { IssueDescription } from './IssueDescription';
> 16	import { IssueProperties } from './IssueProperties';
> 17	
> 18	const GuardedComposer = withPermission(CommentComposer, 'issue:comment', ReadOnlyComposer);
> 19	
> 20	export function IssueDrawer() {
> 21	  const { key = '' } = useParams();
> 22	  const issue = useAppSelector((s) => selectIssueByKey(s, key));
> 23	  const ready = useAppSelector(selectIssuesReady);
> 24	  const project = useProject(issue?.projectId);
> 25	  const viewers = useViewers(key);
> 26	  const navigate = useNavigate();
> 27	  const { pathname, search } = useLocation();
> 28	  useDocumentTitle(issue ? `${issue.key} ${issue.title}` : key);
> 29 … [1440 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/CommentComposer.tsx"}
> ```

> **←**
> ```
> 1	import { memo, useRef, useState } from 'react';
> 2	import { useForm, useWatch, type Control } from 'react-hook-form';
> 3	import { Button } from '../../components/ui/Button';
> 4	import { useToast } from '../../context/ToastContext';
> 5	import { buildReferenceIndex, searchReferences, type ReferenceIndex } from '../../lib/search';
> 6	import { useAddComment } from '../../queries/comments';
> 7	import { useMembers } from '../../queries/members';
> 8	import { useAppSelector } from '../../store';
> 9	import { selectAllIssues } from '../../store/selectors';
> 10	
> 11	const MAX = 2000;
> 12	
> 13	interface Values {
> 14	  body: string;
> 15	}
> 16	
> 17	interface Props {
> 18	  issueId: string;
> 19	  issueKey: string;
> 20	}
> 21	
> 22	function CharCount({ control }: { control: Control<Values> }) {
> 23	  const body = useWatch({ control, name: 'body' });
> 24	  if (body.length < MAX * 0.8) return null;
> 25	  return <span className={body.length > MAX ? 'danger small' : 'muted small'}>{MAX - body.length}</span>;
> 26	}
> 27	
> 28	/** `@ann` at the caret: the members whose handle starts with it. */
> 29	function MentionMenu({ query, onPick }: { query: string; onPick(handle: string): void }) {
> 30	  const { data: members = [] } = useMembers();
> 31	  const matches = members.filter((m) => m.handle.startsWith(query.toLowerCase())).slice(0, 5);
> 32	  if (!matches.length) return null;
> 33	  return (
> 34	    <ul className="menu mention-menu">
> 35	      {matches.map((m) => (
> 36	        <li key={m.id} className="menu-item" onMouseDown={(e) => (e.p … [4330 more]
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

> **→ Grep**
> ```
> {"pattern":"buildReferenceIndex","path":"src/lib/search.ts","output_mode":"content","-n":true}
> ```

> **←**
> ```
> 40:export function buildReferenceIndex(issues: Array<{ key: string; title: string; description: string }>): ReferenceIndex {
> ```

> **→ Read**
> ```
> {"file_path":"src/store/index.ts"}
> ```

> **←**
> ```
> 1	import { configureStore } from '@reduxjs/toolkit';
> 2	import { useDispatch, useSelector } from 'react-redux';
> 3	import { activityReducer } from './activity';
> 4	import { issuesReducer } from './issues';
> 5	import { notificationsReducer } from './notifications';
> 6	
> 7	export const store = configureStore({
> 8	  reducer: {
> 9	    issues: issuesReducer,
> 10	    notifications: notificationsReducer,
> 11	    activity: activityReducer,
> 12	  },
> 13	});
> 14	
> 15	export type RootState = ReturnType<typeof store.getState>;
> 16	export type AppDispatch = typeof store.dispatch;
> 17	
> 18	export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
> 19	export const useAppSelector = useSelector.withTypes<RootState>();
> 20	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/withPermission.tsx"}
> ```

> **←**
> ```
> 1	import type { ComponentType } from 'react';
> 2	import { useAuth, type Permission } from '../context/AuthContext';
> 3	
> 4	/** Renders the component only for people allowed to do `permission`, and `fallback` for the others. */
> 5	export function withPermission<P extends object>(Component: ComponentType<P>, permission: Permission, Fallback: ComponentType<P> | null = null) {
> 6	  function Guarded(props: P) {
> 7	    const { can } = useAuth();
> 8	    if (can(permission)) return <Component {...props} />;
> 9	    return Fallback ? <Fallback {...props} /> : null;
> 10	  }
> 11	  Guarded.displayName = `withPermission(${Component.displayName ?? Component.name})`;
> 12	  return Guarded;
> 13	}
> 14	
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"import { useAddComment } from '../../queries/comments';\nimport { useMembers } from '../../queries/members';\nimport { useAppSelector } from '../../store';\nimport { selectAllIssues } from '../../store/selectors';","new_string":"import { useAddComment } from '../../queries/comments';\nimport { useMembers } from '../../queries/members';\nimport { store } from '../../store';\nimport { selectAllIssues } from '../../store/selectors';"}
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"  const toast = useToast();\n  const issues = useAppSelector(selectAllIssues);\n  const [references] = useState(buildReferenceIndex(issues));","new_string":"  const toast = useToast();\n  // The reference index only ever needs the issue list as it was when the composer mounted —\n  // it is built once, not kept in sync. Reading it from the store snapshot (instead of\n  // subscribing with useAppSelector) avoids re-rendering this whole form on every unrelated\n  // issue upd … [127 more]
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-124614-app-panel-b8df","label":"after"}
> ```

> **←**
> ```
> {"id":"20260928-124817-app-record-849c","url":"http://localhost:38903/?tick=150&rpr=rec#/issues/WEB-2","requested":"http://localhost:38903/?tick=150#/issues/WEB-2","durationSec":5.3,"commits":66,"renders":828,"rendersWithoutDom":707,"rendersPerCommit":12.5,"topRoot":"IssuesPage ×7","wasting":[{"root":"CharCount","source":"src/features/issues/CommentComposer.tsx:132","hits":36,"instances":1,"noDomChange":36},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","hits":5,"instances":1,"noDomChange":5},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","hits":6,"instances":1,"noDomChange":3},{"root":"AuthProvider","source":"src/main.tsx:17","hits":3,"instances":1,"noDomChange":0,"ownDomUnchanged":3},{"root":"IssueDrawer","source":"src/routes.tsx:18","hits":6,"instances":1,"noDomChange":2}],"warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-124614-app-panel-b8df","after":"20260928-124817-app-record-849c","match":"name"}
> ```

> **←**
> ```
> {"comparable":false,"warnings":["viewport differs: 1440×900 vs 1280×720","condition viewport: 1440×900 vs 1280×720","Sidebar (src/components/layout/AppShell.tsx:25) still renders for nothing, 0 of 1 hits before and 3 of 6 after: the change did not reach its cause","IssueDrawer (src/routes.tsx:18) still renders for nothing, 0 of 3 hits before and 2 of 6 after: the change did not reach its cause"],"before":{"id":"20260928-124614-app-panel-b8df","durationMs":4492},"after":{"id":"20260928-124817-app-record-849c","durationMs":5267},"totals":{"commits":"54 → 66 (+22%)","renders":"249 → 828 (+233%)","commitsPerSec":"12.02 → 12.53 (+4%)","rendersPerSec":"55.43 → 157.21 (+184%)","rendersPerCommit":"4.6 → 12.5 (+172%)","rendersWithoutDomPerSec":"40.07 → 134.23 (+235%)","rendersPerTextChange":"17.8 → 39.4 (+121%)","longTaskMaxMs":"51 → 191 (+275%)"},"roots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.34 → 1.33 (-1%)","perHit":"5 → 49 (+880%)","instances":"1 → 1 (0%)","cascadePerSec":"6.68 → 64.93 (+872%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"0.22 → 1.14 (+418%)","perHit":"37 → 35 (-5%)","instances":"1 → 1 (0%)","cascadePerSec":"8.24 → 39.3 (+377%)"},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","path":"IssuesPage < AppShell","status":"new","hitsPerSec":"– → 0.95","perHit":"– → 9","instances":"– → 1","cascadePerSec":"0 →  … [5525 more]
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-124614-app-panel-b8df","label":"after-matched","viewport":"1440x900"}
> ```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a7d13f31a8df84db5 (internal ID - do not mention to user. Use SendMessage with to: 'a7d13f31a8df84db5', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-V3AVsC/tmp/claude-0/-tmp-claude-eval-V3AVsC-home-cwd/73a23222-1a79-430e-831e-08f30dcff1b2/tasks/a7d13f31a8df84db5.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to diagnose issue WEB-2's comment box using the existing recording, apply a fix in `./src` if warranted, and verify with before/after numbers. I'll report back once it completes.

> **←**
> ```
> {"id":"20260928-124838-app-record-35c6","url":"http://localhost:38903/?tick=150&rpr=rec#/issues/WEB-2","requested":"http://localhost:38903/?tick=150#/issues/WEB-2","durationSec":5.3,"commits":66,"renders":828,"rendersWithoutDom":707,"rendersPerCommit":12.5,"topRoot":"IssuesPage ×7","wasting":[{"root":"CharCount","source":"src/features/issues/CommentComposer.tsx:132","hits":36,"instances":1,"noDomChange":36},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","hits":5,"instances":1,"noDomChange":5},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","hits":6,"instances":1,"noDomChange":3},{"root":"AuthProvider","source":"src/main.tsx:17","hits":3,"instances":1,"noDomChange":0,"ownDomUnchanged":3},{"root":"IssueDrawer","source":"src/routes.tsx:18","hits":6,"instances":1,"noDomChange":2}],"warnings":[]}
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
> 27	  overrides it — then set the s … [1124 more]
> ````

> **→ Grep**
> ```
> {"pattern":".","path":"node_modules","head_limit":1}
> ```

> **✗ error**
> ```
> Permission to use Grep has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
> ```

> **agent:** I don't have a shell tool available for the worktree approach, so I'll get a fair apples-to-apples comparison by temporarily reverting the fix, recording a replay baseline, then reapplying the fix and recording again — both via the same replay mechanism (avoids the panel-vs-replay mount-inclusion discrepancy seen above).

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"import { useAddComment } from '../../queries/comments';\nimport { useMembers } from '../../queries/members';\nimport { store } from '../../store';\nimport { selectAllIssues } from '../../store/selectors';","new_string":"import { useAddComment } from '../../queries/comments';\nimport { useMembers } from '../../queries/members';\nimport { useAppSelector } from '../../store';\nimport { selectAllIssues } from '../../store/selectors';"}
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"  const toast = useToast();\n  // The reference index only ever needs the issue list as it was when the composer mounted —\n  // it is built once, not kept in sync. Reading it from the store snapshot (instead of\n  // subscribing with useAppSelector) avoids re-rendering this whole form on every unrelated\n  // issue update while the user is typing.\n  const [references] = useState(() => buildReferenceIndex(selectAllIssues(store.getState())));","new_string":"  const toast =  … [127 more]
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now record the baseline replay (unfixed code, same replay-from-load mechanism as the "after" run for a fair comparison).

> **→ rpr:record_page**
> ```
> {"replay":"20260928-124614-app-panel-b8df","label":"before-replay","viewport":"1440x900"}
> ```

> **←**
> ```
> {"id":"20260928-124928-app-record-7e54","url":"http://localhost:38903/?tick=150&rpr=rec#/issues/WEB-2","requested":"http://localhost:38903/?tick=150#/issues/WEB-2","durationSec":5.7,"commits":69,"renders":896,"rendersWithoutDom":763,"rendersPerCommit":13,"topRoot":"IssuesPage ×9","wasting":[{"root":"CharCount","source":"src/features/issues/CommentComposer.tsx:129","hits":36,"instances":1,"noDomChange":36},{"root":"CommentComposer","source":"src/components/withPermission.tsx:8","hits":17,"instances":1,"noDomChange":16},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","hits":5,"instances":1,"noDomChange":5},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","hits":6,"instances":1,"noDomChange":3},{"root":"AuthProvider","source":"src/main.tsx:17","hits":3,"instances":1,"noDomChange":0,"ownDomUnchanged":3}],"warnings":[]}
> ```

> **agent:** This confirms the baseline: `CommentComposer` (unfixed) has 17 hits with 16 producing no DOM change. Now reapply the fix and record "after" under identical replay conditions.

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"import { useAddComment } from '../../queries/comments';\nimport { useMembers } from '../../queries/members';\nimport { useAppSelector } from '../../store';\nimport { selectAllIssues } from '../../store/selectors';","new_string":"import { useAddComment } from '../../queries/comments';\nimport { useMembers } from '../../queries/members';\nimport { store } from '../../store';\nimport { selectAllIssues } from '../../store/selectors';"}
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"  const toast = useToast();\n  const issues = useAppSelector(selectAllIssues);\n  const [references] = useState(buildReferenceIndex(issues));","new_string":"  const toast = useToast();\n  // The reference index only ever needs the issue list as it was when the composer mounted —\n  // it is built once, not kept in sync. Reading it from the store snapshot (instead of\n  // subscribing with useAppSelector) avoids re-rendering this whole form on every unrelated\n  // issue upd … [127 more]
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-124614-app-panel-b8df","label":"after-replay","viewport":"1440x900"}
> ```

> **←**
> ```
> {"id":"20260928-124944-app-record-0588","url":"http://localhost:38903/?tick=150&rpr=rec#/issues/WEB-2","requested":"http://localhost:38903/?tick=150#/issues/WEB-2","durationSec":5.3,"commits":68,"renders":860,"rendersWithoutDom":730,"rendersPerCommit":12.6,"topRoot":"IssuesPage ×8","wasting":[{"root":"CharCount","source":"src/features/issues/CommentComposer.tsx:132","hits":36,"instances":1,"noDomChange":36},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","hits":5,"instances":1,"noDomChange":5},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","hits":6,"instances":1,"noDomChange":3},{"root":"AuthProvider","source":"src/main.tsx:17","hits":3,"instances":1,"noDomChange":0,"ownDomUnchanged":3},{"root":"IssueDrawer","source":"src/routes.tsx:18","hits":7,"instances":1,"noDomChange":2}],"warnings":[]}
> ```

> **agent:** CommentComposer no longer appears in the "wasting" list at all (it dropped out of the top wasteful roots entirely). Let's compare the two replay-based recordings directly for precise numbers.

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-124928-app-record-7e54","after":"20260928-124944-app-record-0588","match":"name"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":["IssuesToolbar (src/features/issues/IssuesPage.tsx:30) still renders for nothing, 5 of 5 hits before and 5 of 5 after: the change did not reach its cause","Sidebar (src/components/layout/AppShell.tsx:25) still renders for nothing, 3 of 6 hits before and 3 of 6 after: the change did not reach its cause","AuthProvider (src/main.tsx:17) still renders for nothing, 3 of 3 hits before and 3 of 3 after: the change did not reach its cause","IssueDrawer (src/routes.tsx:18) still renders for nothing, 2 of 7 hits before and 2 of 7 after: the change did not reach its cause"],"before":{"id":"20260928-124928-app-record-7e54","durationMs":5680},"after":{"id":"20260928-124944-app-record-0588","durationMs":5313},"totals":{"commits":"69 → 68 (-1%)","renders":"896 → 860 (-4%)","commitsPerSec":"12.15 → 12.8 (+5%)","rendersPerSec":"157.75 → 161.87 (+3%)","rendersPerCommit":"13 → 12.6 (-3%)","rendersWithoutDomPerSec":"134.33 → 137.4 (+2%)","rendersPerTextChange":"39 → 39.1 (0%)","longTaskMaxMs":"235 → 189 (-20%)"},"roots":[{"root":"CommentComposer","source":"src/components/withPermission.tsx:8","path":"withPermission(CommentComposer) < IssueDrawer < IssuesPage < AppShell","status":"changed","hitsPerSec":"2.99 → 0.56 (-81%)","perHit":"2 → 3 (+50%)","instances":"1 → 1 (0%)","cascadePerSec":"6.87 → 1.69 (-75%)"},{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.58 → 1.51 (-4%)","perHit":"39 → 43 (+10%)","instances":"1 … [6223 more]
> ```

> **agent:** Let me check the source for the remaining wasteful roots (unaffected by this fix) to explain them briefly.

> **→ Grep**
> ```
> {"pattern":"selectUnreadCount|useAppSelector\" -n","path":"src/components/layout/Sidebar.tsx","output_mode":"content","-n":true}
> ```

> **←**
> ```
> 8:import { selectMyOpenCount, selectOpenCountByProject, selectUnreadCount } from '../../store/selectors';
> 55:  const unread = useAppSelector(selectUnreadCount);
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/IssuesPage.tsx","offset":1,"limit":35}
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
> 30	      <IssuesToolbar filters={filters} setFilters={setFilters} tota … [356 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/features/issues/CommentComposer.tsx","offset":1,"limit":70}
> ```

> **←**
> ```
> 1	import { memo, useRef, useState } from 'react';
> 2	import { useForm, useWatch, type Control } from 'react-hook-form';
> 3	import { Button } from '../../components/ui/Button';
> 4	import { useToast } from '../../context/ToastContext';
> 5	import { buildReferenceIndex, searchReferences, type ReferenceIndex } from '../../lib/search';
> 6	import { useAddComment } from '../../queries/comments';
> 7	import { useMembers } from '../../queries/members';
> 8	import { store } from '../../store';
> 9	import { selectAllIssues } from '../../store/selectors';
> 10	
> 11	const MAX = 2000;
> 12	
> 13	interface Values {
> 14	  body: string;
> 15	}
> 16	
> 17	interface Props {
> 18	  issueId: string;
> 19	  issueKey: string;
> 20	}
> 21	
> 22	function CharCount({ control }: { control: Control<Values> }) {
> 23	  const body = useWatch({ control, name: 'body' });
> 24	  if (body.length < MAX * 0.8) return null;
> 25	  return <span className={body.length > MAX ? 'danger small' : 'muted small'}>{MAX - body.length}</span>;
> 26	}
> 27	
> 28	/** `@ann` at the caret: the members whose handle starts with it. */
> 29	function MentionMenu({ query, onPick }: { query: string; onPick(handle: string): void }) {
> 30	  const { data: members = [] } = useMembers();
> 31	  const matches = members.filter((m) => m.handle.startsWith(query.toLowerCase())).slice(0, 5);
> 32	  if (!matches.length) return null;
> 33	  return (
> 34	    <ul className="menu mention-menu">
> 35	      {matches.map((m) => (
> 36	        <li key={m.id} className="menu-item" onMouseDown={(e) => (e.preventDef … [1642 more]
> ```

> **agent:** Fix is in place and confirmed. Final report:
> 
> ## Root cause
> 
> `CommentComposer` (`src/features/issues/CommentComposer.tsx:66-67`, cascade root `withPermission(CommentComposer)`) subscribed live to `selectAllIssues` via `useAppSelector`, but only ever used that value once, to seed a `useState` initializer for the `@mention`/`#reference` search index:
> 
> ```js
> const issues = useAppSelector(selectAllIssues);
> const [references] = useState(buildReferenceIndex(issues));
> ```
> 
> `selectAllIssues` (`src/store/selectors.ts:9`) is `issueSelectors.selectAll(state.issues)` — a plain (non-memoized) entity-adapter selector that returns a **new array reference on every Redux dispatch**, whatever changed. WEB-2 is a "busy" issue with constant background traffic (`issues/issueReceived`, `issues/commentCounted`, `notifications/notificationReceived`, worker messages, presence/viewing, etc.). Every one of those unrelated dispatches made `useAppSelector` see a new array and re-render the whole comment form — competing for the main thread with every keystroke, which is exactly the janky feel reported. `memo()` around `CommentComposer` doesn't help because the re-render is driven by its own internal subscription, not by parent props.
> 
> Recording evidence (root `CommentComposer`, `src/components/withPermission.tsx:8`): in the original panel recording, hits=12, `noDomChange`=11 (92% of its renders changed nothing on screen); in a clean replay baseline, hits=17, `noDomChange`=16 (94%).
> 
> ## Fix
> 
> `src/features/issues/CommentComposer.tsx:8, 66-70` — read the issue list once from the store snapshot instead of subscribing:
> 
> ```js
> import { store } from '../../store';
> ...
> const [references] = useState(() => buildReferenceIndex(selectAllIssues(store.getState())));
> ```
> 
> This produces the identical initial `references` value (same data, same timing — computed at mount) so the mention/reference menus behave exactly as before; it just stops re-subscribing the component to every future store change. No visual/behavioral change.
> 
> ## Before/after (two replays of the same recorded scenario — click comment box, type "Looks good to me, merging after lunch" — same viewport 1440×900, same throttling, via `compare_recordings`, `comparable: true`):
> 
> - `CommentComposer` hits/sec: 2.99 → 0.56 (**-81%**); cascade renders/sec: 6.87 → 1.69 (**-75%**)
> - `CommentComposer` no longer appears in the recording's `wasting`/`wastingAfter` list at all (previously 16 of 17 hits wasted)
> - Longest task during typing: 235ms → 189ms (-20%)
> - Whole-page totals (commits, total renders) barely moved (±5%), as expected — this fix is scoped to one component, and the busy-issue background traffic dominates whole-page totals regardless.
> 
> Session ids: baseline `20260928-124928-app-record-7e54`, after-fix `20260928-124944-app-record-0588`.
> 
> ## What still renders for nothing (unaffected by this fix, confirmed unchanged by `compare_recordings`' warnings)
> 
> - `CharCount` (`src/features/issues/CommentComposer.tsx:132`): 36/36 hits no DOM change. It watches `useWatch({control,name:'body'})` on every keystroke to decide whether to show a remaining-character counter (only above 1600/2000 chars); for the 37-char test comment it always returns `null`. This is inherent to how it decides whether to render at all, and it's ~free (perHit ≈1ms) — not touched.
> - `IssuesToolbar` (`src/features/issues/IssuesPage.tsx:30`), `Sidebar` (`src/components/layout/AppShell.tsx:25`), `AuthProvider` (`src/main.tsx:17`), `IssueDrawer` (`src/routes.tsx:18`): pre-existing waste, present before and after in identical amounts. `IssuesPage` itself also calls `useAppSelector(selectAllIssues)` directly (`IssuesPage.tsx:16`) — the same unmemoized-selector pattern — so it and its children re-render on unrelated dispatches too. This is a separate, page-wide issue (not specific to the comment box) and out of scope for "typing is janky"; fixing it would mean memoizing `selectAllIssues` (e.g. wrapping it or the entity `selectAll` call in `createSelector`) across the app, which I left alone to keep this change scoped and low-risk.
> 
> ## Conditions
> 
> - Page: `http://localhost:38903/?tick=150#/issues/WEB-2`, viewport 1440×900, no CPU throttling.
> - Scenario: click comment box, type the given 37-character sentence; original repro captured via the panel, before/after measured via `record_page` replay of that same recording (deterministic — `tick=150` drives the same simulated background events each run).
> 
> ## Not checked
> 
> - Whether memoizing `selectAllIssues`/`selectNotifications` app-wide would remove the other listed wasteful roots (out of scope for this complaint).
> - Real device/CPU-throttled numbers (recorder ran unthrottled); relative percentages should hold but absolute ms will differ on slower machines.
> - No worktree-based before/after was used (no shell tool available in this session); instead the fix was reverted/reapplied in place and both replays recorded before restoring the fix, which is the current, final state of the file.

**→ Read**
```
{"file_path":"src/features/issues/CommentComposer.tsx","offset":1,"limit":80}
```

**←**
```
1	import { memo, useRef, useState } from 'react';
2	import { useForm, useWatch, type Control } from 'react-hook-form';
3	import { Button } from '../../components/ui/Button';
4	import { useToast } from '../../context/ToastContext';
5	import { buildReferenceIndex, searchReferences, type ReferenceIndex } from '../../lib/search';
6	import { useAddComment } from '../../queries/comments';
7	import { useMembers } from '../../queries/members';
8	import { store } from '../../store';
9	import { selectAllIssues } from '../../store/selectors';
10	
11	const MAX = 2000;
12	
13	interface Values {
14	  body: string;
15	}
16	
17	interface Props {
18	  issueId: string;
19	  issueKey: string;
20	}
21	
22	function CharCount({ control }: { control: Control<Values> }) {
23	  const body = useWatch({ control, name: 'body' });
24	  if (body.length < MAX * 0.8) return null;
25	  return <span className={body.length > MAX ? 'danger small' : 'muted small'}>{MAX - body.length}</span>;
26	}
27	
28	/** `@ann` at the caret: the members whose handle starts with it. */
29	function MentionMenu({ query, onPick }: { query: string; onPick(handle: string): void }) {
30	  const { data: members = [] } = useMembers();
31	  const matches = members.filter((m) => m.handle.startsWith(query.toLowerCase())).slice(0, 5);
32	  if (!matches.length) return null;
33	  return (
34	    <ul className="menu mention-menu">
35	      {matches.map((m) => (
36	        <li key={m.id} className="menu-item" onMouseDown={(e) => (e.preventDef … [2209 more]
```

**agent:** Fix confirmed in place. Here's the summary.

**Root cause:** `CommentComposer` (`src/features/issues/CommentComposer.tsx`) subscribed to `selectAllIssues` via `useAppSelector` just to seed a one-time `@mention`/`#reference` search index. That selector returns a fresh array on *every* Redux dispatch, and WEB-2 is busy with constant background traffic (issue updates, comment counts, notifications, presence pings). Each of those unrelated dispatches re-rendered the entire comment form mid-keystroke — 92-94% of its renders changed nothing on screen.

**Fix:** read the issue list once from the store snapshot at mount instead of subscribing live:
```js
const [references] = useState(() => buildReferenceIndex(selectAllIssues(store.getState())));
```
Same data, same timing, zero visual/behavioral change — it just stops resubscribing the form to unrelated store updates.

**Before → after** (same recorded repro, replayed both ways):
- `CommentComposer` re-renders: 2.99/sec → 0.56/sec (**-81%**)
- Cascade renders/sec: 6.87 → 1.69 (**-75%**)
- No longer appears in the "wasted render" list at all (was 16 of 17 hits wasted)
- Longest main-thread task while typing: 235ms → 189ms (-20%)

Whole-page totals barely moved, as expected — the fix is scoped to this one component; the busy-issue background traffic itself is unrelated overhead.

**Left alone (separate, pre-existing waste, unaffected by this fix):** `CharCount` re-renders on every keystroke but is ~free; and `IssuesPage`/`IssuesToolbar`/`Sidebar`/etc. re-render off the same unmemoized `selectAllIssues` pattern used app-wide — that's a page-wide issue, not specific to comment typing, so it was left out of scope.
