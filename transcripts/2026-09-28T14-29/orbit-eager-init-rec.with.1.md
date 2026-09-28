# orbit-eager-init-rec, with the plugin, run 1

not verified; checks 4 of 4; $0.44, 207 s, 2 turns

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

> Confirmed: the fix is a single-line change at `src/features/issues/CommentComposer.tsx:67`.
> 
> **Root cause:** `CommentComposer` built its `@`/`#` mention index with `useState(buildReferenceIndex(issues))` — the eager form. React only *keeps* the first call's result, but it still *evaluates* the argument on every render. Since typing triggers re-renders of this component (via `setMention`/`setReference` on each keystroke), the expensive trigram index over every issue's title/description was being rebuilt and thrown away on nearly every keystroke — real cost on a busy issue with many other issues in state, zero visible effect.
> 
> **Fix:** switch to the lazy initializer form, `useState(() => buildReferenceIndex(issues))`, so it only ever runs once at mount — which was already the component's real behavior (the value never updated after mount either way). No visual or behavioral change.
> 
> **Before/after (matched recordings, same URL/viewport, same scripted repro):**
> - Cost per re-render of `CommentComposer`: **25.44ms → 0.31ms** (~99% reduction)
> - Per-keystroke latency while typing the test comment: **88ms → 32ms** (-64%)
> - Render/commit counts unchanged (47 commits, ~525 renders both runs) — confirms this is purely a cost fix, not a behavior or render-count change
> 
> Two minor sources of "renders for nothing" were found but left alone since their cost is negligible (~0.04–0.3ms/hit): `CharCount` re-subscribing every keystroke (correct — it needs to know when to switch from `null`), and residual `CommentComposer` re-renders driven by background Redux updates unrelated to typing.

## What it changed

```
diff -ruN a/src/features/issues/CommentComposer.tsx b/src/features/issues/CommentComposer.tsx
--- a/src/features/issues/CommentComposer.tsx
+++ b/src/features/issues/CommentComposer.tsx
@@ -64,7 +64,7 @@
   const addComment = useAddComment(issueId);
   const toast = useToast();
   const issues = useAppSelector(selectAllIssues);
-  const [references] = useState(buildReferenceIndex(issues));
+  const [references] = useState(() => buildReferenceIndex(issues));
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
1	20260928-143137-app-panel-7fdd
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:41971/?tick=150#/issues/WEB-2
2	
```

**→ Agent**
```
{"description":"Diagnose and fix choppy comment typing","subagent_type":"react-perf-recorder:perf-recorder","run_in_background":false,"prompt":"A React app lives in ./src (cwd: .), dev server running at http://localhost:41971/?tick=150#/issues/WEB-2 (see ./dev-url.txt).\n\nComplaint: typing in the comment box on issue WEB-2 (a \"busy\" issue, i.e. one with lots of other content/comments/activity) is choppy/janky, while the rest of the page stays responsive. The rest of the page (presumably things like navigation, other panels) is NOT choppy — only typing in the c … [1940 more]
```

> **input:** A React app lives in ./src (cwd: .), dev server running at http://localhost:41971/?tick=150#/issues/WEB-2 (see ./dev-url.txt).
> 
> Complaint: typing in the comment box on i … [2176 more]

> **→ rpr:get_recording**
> ```
> {"id":"20260928-143137-app-panel-7fdd"}
> ```

> **←**
> ```
> {"id":"20260928-143137-app-panel-7fdd","status":"done","dir":"/tmp/tmp.1F5kXmNeJQ/20260928-143137-app-panel-7fdd","summary":{"id":"20260928-143137-app-panel-7fdd","status":"done","createdAt":"2026-09-28T14:31:41.718Z","source":"panel","url":"http://localhost:41971/?tick=150#/issues/WEB-2","viewport":"1440×900","durationSec":4.6,"scope":null,"totals":{"commits":54,"commitsPerSec":11.78,"commitsInScope":54,"renders":249,"rendersPerScopeCommit":4.6,"rendersFromOutside":0,"rendersWithoutDom":180,"domTextChanges":14,"rendersPerTextChange":17.8},"topRoots":[{"root":"IssueDrawer","source":"src/routes.tsx:18","path":"IssuesPage < AppShell","hits":3,"hitsPerSec":0.65,"instances":1,"perHit":26,"noDomChange":0,"mounts":6,"renderMsPerHit":1.77,"reasons":["2× external store #23 [usePresenceStore] useShallow((s)=>Object.keys(s.viewing).filter((id)=>s.viewing[id] === issueKey)) · useViewers › [zustand] useBoundStore › useStore › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssueDrawer.tsx:25 const viewers = useViewers(key);","1× external store #4 [store] (s)=>selectIssueByKey(s, key) · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssueDrawer.tsx:22 const issue = useAppSelector((s) => selectIssueByKey(s, key));"],"causes":["3× core:message Worker","2× zustand:presence/viewing","1× redux:issues/commentCounted"],"lanes":"Sync:3"},{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","hits":6, … [7749 more]
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

> **→ Grep**
> ```
> {"pattern":"buildReferenceIndex|searchReferences","path":"src/lib/search.ts","output_mode":"content","-n":true}
> ```

> **←**
> ```
> 40:export function buildReferenceIndex(issues: Array<{ key: string; title: string; description: string }>): ReferenceIndex {
> 56:export function searchReferences({ entries, grams }: ReferenceIndex, query: string, limit = 5) {
> ```

> **→ Read**
> ```
> {"file_path":"src/lib/search.ts"}
> ```

> **←**
> ```
> 1	/**
> 2	 * A small fuzzy matcher for the command palette and the issue search: every query character in order, with a bonus
> 3	 * for runs and word starts. Returns 0 when the query does not match.
> 4	 */
> 5	export function fuzzyScore(query: string, text: string) {
> 6	  if (!query) return 1;
> 7	  const q = query.toLowerCase();
> 8	  const t = text.toLowerCase();
> 9	  const exact = t.indexOf(q);
> 10	  if (exact >= 0) return 100 - Math.min(exact, 50) + (exact === 0 || t[exact - 1] === ' ' ? 20 : 0);
> 11	  let score = 0;
> 12	  let run = 0;
> 13	  let from = 0;
> 14	  for (const ch of q) {
> 15	    if (ch === ' ') continue;
> 16	    const at = t.indexOf(ch, from);
> 17	    if (at < 0) return 0;
> 18	    run = at === from ? run + 1 : 0;
> 19	    score += 1 + run * 2 + (at === 0 || t[at - 1] === ' ' ? 3 : 0);
> 20	    from = at + 1;
> 21	  }
> 22	  return score;
> 23	}
> 24	
> 25	export function matchesAllWords(query: string, text: string) {
> 26	  const t = text.toLowerCase();
> 27	  return query
> 28	    .toLowerCase()
> 29	    .split(/\s+/)
> 30	    .filter(Boolean)
> 31	    .every((word) => t.includes(word));
> 32	}
> 33	
> 34	export interface ReferenceIndex {
> 35	  entries: Array<{ key: string; title: string }>;
> 36	  grams: Map<string, Set<number>>;
> 37	}
> 38	
> 39	/** Trigrams of every issue's key, title and description, for the `#` references in a comment. */
> 40	export function buildReferenceIndex(issues: Array<{ key: string; title: string; description: string }>): ReferenceIndex {
> 41	  const entries = issues.map(({ key, title }) => ( … [1143 more]
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
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"  const [references] = useState(buildReferenceIndex(issues));","new_string":"  const [references] = useState(() => buildReferenceIndex(issues));"}
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-143137-app-panel-7fdd","label":"after-fix"}
> ```

> **←**
> ```
> {"id":"20260928-143336-app-record-5ac6","url":"http://localhost:41971/?tick=150&rpr=rec#/issues/WEB-2","requested":"http://localhost:41971/?tick=150#/issues/WEB-2","durationSec":5.4,"commits":67,"renders":877,"rendersWithoutDom":747,"rendersPerCommit":13.1,"topRoot":"IssuesPage ×8","wasting":[{"root":"CharCount","source":"src/features/issues/CommentComposer.tsx:129","hits":36,"instances":1,"noDomChange":36},{"root":"CommentComposer","source":"src/components/withPermission.tsx:8","hits":15,"instances":1,"noDomChange":14},{"root":"IssuesToolbar","source":"src/features/issues/IssuesPage.tsx:30","hits":4,"instances":1,"noDomChange":4},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","hits":6,"instances":1,"noDomChange":3},{"root":"AuthProvider","source":"src/main.tsx:17","hits":3,"instances":1,"noDomChange":0,"ownDomUnchanged":3}],"warnings":["typed placeholder text for typing 37 chars into «comment-input» in CommentComposer: the recording kept no typed values, so a search or filter showed other results than the person saw — a script that types the real text compares like with like"]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-143137-app-panel-7fdd","after":"20260928-143336-app-record-5ac6"}
> ```

> **←**
> ```
> {"comparable":false,"warnings":["viewport differs: 1440×900 vs 1280×720","condition viewport: 1440×900 vs 1280×720","CharCount (src/features/issues/CommentComposer.tsx:129) still renders for nothing, 36 of 36 hits before and 36 of 36 after: the change did not reach its cause","CommentComposer (src/components/withPermission.tsx:8) still renders for nothing, 11 of 12 hits before and 14 of 15 after: the change did not reach its cause","Sidebar (src/components/layout/AppShell.tsx:25) still renders for nothing, 0 of 1 hits before and 3 of 6 after: the change did not reach its cause"],"before":{"id":"20260928-143137-app-panel-7fdd","durationMs":4584},"after":{"id":"20260928-143336-app-record-5ac6","durationMs":5429},"totals":{"commits":"54 → 67 (+24%)","renders":"249 → 877 (+252%)","commitsPerSec":"11.78 → 12.34 (+5%)","rendersPerSec":"54.32 → 161.54 (+197%)","rendersPerCommit":"4.6 → 13.1 (+185%)","rendersWithoutDomPerSec":"39.27 → 137.59 (+250%)","rendersPerTextChange":"17.8 → 39.9 (+124%)","longTaskMaxMs":"0 → 178"},"roots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.31 → 1.47 (+12%)","perHit":"5 → 43 (+760%)","instances":"1 → 1 (0%)","cascadePerSec":"6.54 → 63.92 (+877%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"0.22 → 1.11 (+405%)","perHit":"37 → 35 (-5%)","instances":"1 → 1 (0%)","cascadePerSec":"8.07 → 38.13 (+372%)"},{"root":"IssuesToolba … [5713 more]
> ```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a953d2dbd0fd4749c (internal ID - do not mention to user. Use SendMessage with to: 'a953d2dbd0fd4749c', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-ZNtgXb/tmp/claude-0/-tmp-claude-eval-ZNtgXb-home-cwd/dc8dc778-fa08-4bfd-b335-bee672bf71e4/tasks/a953d2dbd0fd4749c.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"  const [references] = useState(() => buildReferenceIndex(issues));","new_string":"  const [references] = useState(buildReferenceIndex(issues));"}
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

**agent:** I've kicked off the perf-recorder agent to investigate the choppy comment-typing issue on WEB-2 — it'll read the existing recording, find any wasteful re-renders and their root cause, apply a behavior-preserving fix if warranted, and prove it with before/after numbers. I'll report back once it's done.

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:41971/?tick=150#/issues/WEB-2","viewport":"1440x900","label":"before-script","script":"const box = page.getByTestId('comment-input');\nawait box.click();\nawait box.pressSequentially('Looks good to me, merging after lunch', { delay: 20 });"}
> ```

> **←**
> ```
> {"id":"20260928-143400-app-record-e503","url":"http://localhost:41971/?tick=150#/issues/WEB-2","requested":"http://localhost:41971/?tick=150#/issues/WEB-2","durationSec":1.9,"commits":47,"renders":524,"rendersWithoutDom":478,"rendersPerCommit":11.1,"topRoot":"IssuesPage ×3","wasting":[{"root":"CharCount","source":"src/features/issues/CommentComposer.tsx:129","hits":36,"instances":1,"noDomChange":36},{"root":"CommentComposer","source":"src/components/withPermission.tsx:8","hits":7,"instances":1,"noDomChange":6}],"warnings":[]}
> ```

> **agent:** Now apply the fix and record after, with identical conditions.

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/features/issues/CommentComposer.tsx","old_string":"  const [references] = useState(buildReferenceIndex(issues));","new_string":"  const [references] = useState(() => buildReferenceIndex(issues));"}
> ```

> **←**
> ```
> The file src/features/issues/CommentComposer.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:41971/?tick=150#/issues/WEB-2","viewport":"1440x900","label":"after-script","script":"const box = page.getByTestId('comment-input');\nawait box.click();\nawait box.pressSequentially('Looks good to me, merging after lunch', { delay: 20 });"}
> ```

> **←**
> ```
> {"id":"20260928-143408-app-record-e8ed","url":"http://localhost:41971/?tick=150#/issues/WEB-2","requested":"http://localhost:41971/?tick=150#/issues/WEB-2","durationSec":1.5,"commits":47,"renders":526,"rendersWithoutDom":481,"rendersPerCommit":11.2,"topRoot":"IssuesPage ×3","wasting":[{"root":"CharCount","source":"src/features/issues/CommentComposer.tsx:129","hits":36,"instances":1,"noDomChange":36},{"root":"CommentComposer","source":"src/components/withPermission.tsx:8","hits":7,"instances":1,"noDomChange":6}],"warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-143400-app-record-e503","after":"20260928-143408-app-record-e8ed"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":["durations differ (1899ms vs 1510ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals","CharCount (src/features/issues/CommentComposer.tsx:129) still renders for nothing, 36 of 36 hits before and 36 of 36 after: the change did not reach its cause","CommentComposer (src/components/withPermission.tsx:8) still renders for nothing, 6 of 7 hits before and 6 of 7 after: the change did not reach its cause"],"before":{"id":"20260928-143400-app-record-e503","durationMs":1899},"after":{"id":"20260928-143408-app-record-e8ed","durationMs":1510},"totals":{"commits":"47 → 47 (0%)","renders":"524 → 526 (0%)","commitsPerSec":"24.75 → 31.13 (+26%)","rendersPerSec":"275.93 → 348.34 (+26%)","rendersPerCommit":"11.1 → 11.2 (+1%)","rendersWithoutDomPerSec":"251.71 → 318.54 (+27%)","rendersPerTextChange":"52.4 → 58.4 (+11%)","longTaskMaxMs":"198 → 204 (+3%)"},"roots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","status":"changed","hitsPerSec":"1.58 → 1.99 (+26%)","perHit":"107 → 107 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"169.56 → 213.25 (+26%)"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","status":"changed","hitsPerSec":"1.05 → 1.32 (+26%)","perHit":"37 → 37 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"38.97 → 49.01 (+26%)"},{"root":"IssueDrawer","source":"src/routes.tsx:18","path":"IssuesPage < AppShell","status":"changed" … [4900 more]
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-143400-app-record-e503"}
> ```

> **←**
> ```
> {"id":"20260928-143400-app-record-e503","status":"done","dir":"/tmp/tmp.1F5kXmNeJQ/20260928-143400-app-record-e503","summary":{"id":"20260928-143400-app-record-e503","status":"done","createdAt":"2026-09-28T14:34:02.591Z","label":"before-script","source":"script:record","url":"http://localhost:41971/?tick=150#/issues/WEB-2","viewport":"1440×900","durationSec":1.9,"scope":null,"totals":{"commits":47,"commitsPerSec":24.75,"commitsInScope":47,"renders":524,"rendersPerScopeCommit":11.1,"rendersFromOutside":0,"rendersWithoutDom":478,"domTextChanges":10,"rendersPerTextChange":52.4},"topRoots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","hits":3,"hitsPerSec":1.58,"instances":1,"perHit":107,"noDomChange":1,"mounts":485,"renderMsPerHit":33.03,"reasons":["3× external store #13 (1 of them same content) [store] selectAllIssues · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssuesPage.tsx:16 const issues = useAppSelector(selectAllIssues);","1× external store #20 [store] selectIssuesReady · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssuesPage.tsx:17 const ready = useAppSelector(selectIssuesReady);"],"causes":["2× redux:issues/fetch/fulfilled","1× react-query:added [\"comments\",\"i2\"]","1× redux:issues/issueReceived"],"lanes":"Sync:3"},{"root":"IssueDrawer","source":"src/routes.tsx:18","path":"IssuesPage < AppShell","hits":3,"hitsPerSec":1.58,"in … [8172 more]
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-143408-app-record-e8ed"}
> ```

> **←**
> ```
> {"id":"20260928-143408-app-record-e8ed","status":"done","dir":"/tmp/tmp.1F5kXmNeJQ/20260928-143408-app-record-e8ed","summary":{"id":"20260928-143408-app-record-e8ed","status":"done","createdAt":"2026-09-28T14:34:10.349Z","label":"after-script","source":"script:record","url":"http://localhost:41971/?tick=150#/issues/WEB-2","viewport":"1440×900","durationSec":1.5,"scope":null,"totals":{"commits":47,"commitsPerSec":31.13,"commitsInScope":47,"renders":526,"rendersPerScopeCommit":11.2,"rendersFromOutside":0,"rendersWithoutDom":481,"domTextChanges":9,"rendersPerTextChange":58.4},"topRoots":[{"root":"IssuesPage","source":"src/routes.tsx:18","path":"AppShell","hits":3,"hitsPerSec":1.99,"instances":1,"perHit":107,"noDomChange":1,"mounts":485,"renderMsPerHit":38.37,"reasons":["3× external store #13 (1 of them same content) [store] selectAllIssues · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssuesPage.tsx:16 const issues = useAppSelector(selectAllIssues);","1× external store #20 [store] selectIssuesReady · [react-redux] useSelector2 › useSyncExternalStoreWithSelector › SyncExternalStore @ src/features/issues/IssuesPage.tsx:17 const ready = useAppSelector(selectIssuesReady);"],"causes":["2× redux:issues/fetch/fulfilled","1× react-query:added [\"comments\",\"i2\"]","1× redux:issues/issueReceived"],"lanes":"Sync:3"},{"root":"Sidebar","source":"src/components/layout/AppShell.tsx:25","path":"AppShell","hits":2,"hitsPerSec":1.32,"i … [8316 more]
> ```

> **agent:** ## Root cause
> 
> `CommentComposer` (`src/features/issues/CommentComposer.tsx:67`, before the fix) built its `@`/`#` reference index eagerly:
> 
> ```ts
> const [references] = useState(buildReferenceIndex(issues));
> ```
> 
> `useState`'s argument is evaluated on **every** render, but only the first call's result is ever kept — every later call's return value is thrown away. `buildReferenceIndex` (`src/lib/search.ts:40`) builds a full trigram index over every issue's key/title/description, so on a "busy" project this is real work — and it silently reran on every re-render of `CommentComposer`.
> 
> `CommentComposer` re-renders on almost every keystroke even though the `<textarea>` itself is uncontrolled: `trackMention` (`CommentComposer.tsx:73-79`) calls `setMention(null)`/`setReference(null)` on plain typing. Per React's same-value bailout, the component function still runs once before React discards the update — which was enough to re-trigger the wasted `buildReferenceIndex(issues)` call every time. That's the cascade root `CommentComposer` at `src/components/withPermission.tsx:8` (memo boundary) seen in the recording with reasons `bailout: state set to the same value` / `useForm State` / `selectAllIssues`, `noDomChange` on 6 of 7 hits, and 25.4ms per hit — almost entirely spent recomputing a value nobody used.
> 
> `memo()` on `CommentComposer` doesn't help here since the render is triggered by its own internal state, not by parent props.
> 
> ## Fix
> 
> One line, `src/features/issues/CommentComposer.tsx:67`:
> 
> ```ts
> const [references] = useState(() => buildReferenceIndex(issues));
> ```
> 
> Passing a lazy initializer makes `buildReferenceIndex` run only once, at mount — which is exactly what the component's *behavior* already was (the `references` value never updated after mount in either version, since `useState` ignores the argument on later renders regardless). No UI or behavior change: same initial reference index, same mention/reference menus, same everything — only the wasted recomputation is removed.
> 
> ## Before / after (matched conditions)
> 
> Both recorded via `record_page` with an identical script (click comment box, `pressSequentially` the exact repro text, 20ms/char), same URL (`http://localhost:41971/?tick=150#/issues/WEB-2`), same viewport (1440×900), no throttling:
> - before: `20260928-143400-app-record-e503`
> - after: `20260928-143408-app-record-e8ed`
> 
> `CommentComposer` root (`src/components/withPermission.tsx:8`), same 7 hits / 6 no-DOM-change in both (cascade shape unchanged, confirming no behavior change):
> - **renderMsPerHit: 25.44ms → 0.31ms** (~99% cheaper per re-render)
> 
> Typing action (37 chars):
> - **per-keystroke latency: 88ms → 32ms (-64%)**
> - commits/renders per char unchanged (1/1 both), confirming this is a pure cost fix, not a render-count fix
> 
> `compare_recordings` on this matched pair: `comparable: true`, totals unchanged in shape (`commits 47→47`, `renders 524→526`), only cost dropped.
> 
> (A first comparison attempt against the original panel recording, replayed via `record_page`, came back `comparable: false` — viewport and load-state differed from the panel session, so I re-recorded a matched before/after pair instead of trusting that comparison.)
> 
> ## What still renders for nothing (left as-is)
> 
> - `CharCount` (`src/features/issues/CommentComposer.tsx:129`): 36/36 hits produce no DOM change — but this is correct: it returns `null` until the body is within 20% of the 2000-char max, and the hook (`useWatch`) has to subscribe on every keystroke to know that. Cost is 0.04ms/hit, negligible. Not fixed.
> - `CommentComposer` root: still 6 of 7 hits show no own DOM change after the fix — driven by `selectAllIssues` (background redux `issues/fetch/fulfilled` etc.) and `useForm` internal state settling, not primarily by typing (causes list only 3/7 from `core:input`). Since the fix, each such hit costs ~0.3ms instead of ~25ms, so it's no longer worth chasing further.
> 
> ## Conditions
> 
> Page: `http://localhost:41971/?tick=150#/issues/WEB-2` (WEB-2, the "busy" issue). Viewport 1440×900, no CPU throttle. Original complaint recording: panel session `20260928-143137-app-panel-7fdd` (4.6s). Before/after measurement pair: scripted repro (click + `pressSequentially` of "Looks good to me, merging after lunch", 20ms/char), ~1.5-1.9s each.
> 
> ## Not checked
> 
> - The `longTaskMaxMs` (~198-204ms) present in both before and after runs, tied to `IssuesPage`'s large initial-mount cascade (`perHit: 107`) — unrelated to typing, not investigated.
> - Whether `selectAllIssues`/`selectIssueByKey` selectors could be narrowed to reduce unrelated background re-renders of `IssueDrawer`/`CommentComposer` further — out of scope since their per-hit cost is now trivial.
> - The panel recording's `IssueDrawer ×79`/viewer-presence cascade — happens concurrently with typing in that session but its own causes (worker messages, presence) aren't `core:input`; not re-verified against the fix.
> 
> Modified file: `src/features/issues/CommentComposer.tsx` (line 67).

**→ Read**
```
{"file_path":"src/features/issues/CommentComposer.tsx","offset":55,"limit":30}
```

**←**
```
55	          <span className="grow">{m.title}</span>
56	        </li>
57	      ))}
58	    </ul>
59	  );
60	}
61	
62	export const CommentComposer = memo(function CommentComposer({ issueId }: Props) {
63	  const { register, handleSubmit, reset, setValue, getValues, control, formState } = useForm<Values>({ defaultValues: { body: '' } });
64	  const addComment = useAddComment(issueId);
65	  const toast = useToast();
66	  const issues = useAppSelector(selectAllIssues);
67	  const [references] = useState(() => buildReferenceIndex(issues));
68	  const [mention, setMention] = useState<string | null>(null);
69	  const [reference, setReference] = useState<string | null>(null);
70	  const field = register('body', { required: true, maxLength: MAX, validate: (v) => v.trim().length > 0 });
71	  const textarea = useRef<HTMLTextAreaElement | null>(null);
72	
73	  const trackMention = (el: HTMLTextAreaElement) => {
74	    const before = el.value.slice(0, el.selectionStart);
75	    const match = /@(\w*)$/.exec(before);
76	    setMention(match ? match[1] : null);
77	    const ref = /#([\w-]*)$/.exec(before);
78	    setReference(ref ? ref[1] : null);
79	  };
80	
81	  const insert = (pattern: RegExp, text: string) => {
82	    const el = textarea.current!;
83	    const before = el.value.slice(0, el.selectionStart).replace(pattern, `${text} `);
84	    setValue('body', before + el.value.slice(el.selectionStart), { shouldDirty: true });
```

**agent:** Confirmed: the fix is a single-line change at `src/features/issues/CommentComposer.tsx:67`.

**Root cause:** `CommentComposer` built its `@`/`#` mention index with `useState(buildReferenceIndex(issues))` — the eager form. React only *keeps* the first call's result, but it still *evaluates* the argument on every render. Since typing triggers re-renders of this component (via `setMention`/`setReference` on each keystroke), the expensive trigram index over every issue's title/description was being rebuilt and thrown away on nearly every keystroke — real cost on a busy issue with many other issues in state, zero visible effect.

**Fix:** switch to the lazy initializer form, `useState(() => buildReferenceIndex(issues))`, so it only ever runs once at mount — which was already the component's real behavior (the value never updated after mount either way). No visual or behavioral change.

**Before/after (matched recordings, same URL/viewport, same scripted repro):**
- Cost per re-render of `CommentComposer`: **25.44ms → 0.31ms** (~99% reduction)
- Per-keystroke latency while typing the test comment: **88ms → 32ms** (-64%)
- Render/commit counts unchanged (47 commits, ~525 renders both runs) — confirms this is purely a cost fix, not a behavior or render-count change

Two minor sources of "renders for nothing" were found but left alone since their cost is negligible (~0.04–0.3ms/hit): `CharCount` re-subscribing every keystroke (correct — it needs to know when to switch from `null`), and residual `CommentComposer` re-renders driven by background Redux updates unrelated to typing.
