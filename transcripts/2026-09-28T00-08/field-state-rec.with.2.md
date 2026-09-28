# field-state-rec, with the plugin, run 2

fixed (waste 30); checks 5 of 5; $0.73, 479 s, 2 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: typing a message into the message box lags.
To reproduce: open the page, click the message box at the bottom and type a short message, "see you at five".
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> The perf-recorder agent finished its analysis and fix. Summary:
> 
> **Root cause**: In `src/components/Composer/index.tsx`, `MetaInput` (the two small "reply to #" / "remind in" fields) read `fieldState.error` from the same `useController` call that also produced their `<input>` binding. Because `SendButton` tracks the form's aggregate `isValid`, and `MessageInput`'s `onChange` called `trigger()` with no argument (revalidating the *whole* form on every keystroke), react-hook-form gave the `errors` object a new reference on every character typed — and both `MetaInput` rows re-rendered every time, even though the message text has nothing to do with them. `SendButton` itself also re-rendered on nearly every keystroke for the same reason.
> 
> **Fix** (no behavior/visual change):
> - `MessageInput` now revalidates only its own field (`trigger('text')`) instead of the whole form.
> - Split out a tiny `MetaFieldError` leaf component that's the only thing subscribing to `errors[name]`; `MetaInput`/`useMetaField` now only reads `field`, so the input row no longer re-renders when unrelated fields revalidate.
> 
> **Before/after** (same repro, "see you at five" typed, via `compare_recordings`):
> - `MetaInput` rows: 27.67 hits/s each, 100% no-DOM-change → eliminated entirely (replaced by a much cheaper leaf).
> - `SendButton`: 9.65 → 0.44 hits/s (‑95%).
> - Whole run: renders 169 → 115 (‑32%), renders-without-DOM-change 64.35/s → 17.08/s (‑73%), renders per character typed 9.8 → 5.2 (‑47%).
> 
> A residual, unavoidable-without-behavior-change render remains in the new `MetaFieldError` leaf (cheap, renders `null`) since `SendButton` legitimately needs form-wide `isValid`. Background stores unrelated to typing (SyncBar, TypingLine, etc.) were left untouched as out of scope.

## What it changed

```
diff -ruN a/src/components/Composer/index.tsx b/src/components/Composer/index.tsx
--- a/src/components/Composer/index.tsx
+++ b/src/components/Composer/index.tsx
@@ -22,7 +22,7 @@
         onChange={(e) => {
           field.onChange(e);
           draftStore.setState({ hasDraft: e.target.value.length > 0 });
-          // The other fields are validated against the text.
+          // Revalidate just this field; replyTo/remindIn don't depend on the text.
           void trigger();
         }}
         onKeyDown={(e) => {
@@ -35,19 +35,29 @@
 };
 
 function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
-  const { field, fieldState } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
-  return { field, error: fieldState.error?.message };
+  // Only the field itself (value/onChange/...) is read here — the error is read
+  // in MetaFieldError below, so this component isn't re-rendered by react-hook-form
+  // whenever the shared `errors` object changes for a field other than this one
+  // (e.g. while the whole form gets revalidated because SendButton tracks isValid).
+  const { field } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
+  return field;
 }
 
 const LABELS = { replyTo: 'reply to #', remindIn: 'remind in, min' } as const;
 
+const MetaFieldError = ({ control, name }: { control: FormControl; name: 'replyTo' | 'remindIn' }) => {
+  const { errors } = useFormState({ control, name, exact: true });
+  const error = errors[name]?.message;
+  return error ? <em className="error">{error}</em> : null;
+};
+
 export const MetaInput = ({ control, name }: { control: FormControl; name: 'replyTo' | 'remindIn' }) => {
-  const { field, error } = useMetaField(control, name);
+  const field = useMetaField(control, name);
   return (
     <label className="field small">
       <span>{LABELS[name]}</span>
       <input {...field} data-testid={name} placeholder="0" />
-      {error && <em className="error">{error}</em>}
+      <MetaFieldError control={control} name={name} />
     </label>
   );
 };
@@ -96,7 +106,7 @@
       })}
     >
       <div className="row">
-        <MessageInput control={control} trigger={() => trigger()} />
+        <MessageInput control={control} trigger={() => trigger('text')} />
         <SendButton control={control} />
       </div>
       <div className="row meta">
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-001548-app-panel-4ef1
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:44531/?tick=150
2	
```

**agent:** I'll delegate this to the specialized perf-recorder agent, which has the tooling to read the recording, analyze re-renders, fix the code, and verify with before/after numbers.

**→ Agent**
```
{"description":"Diagnose and fix React message box lag","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app is running at http://localhost:44531/?tick=150 (dev server auto-reloads on source changes, source in ./src relative to .).\n\nComplaint: typing into the message box at the bottom of the page lags. Repro: open the page, click the message box, type a short message like \"see you at five\".\n\nThere's already a recording of this repro captured via the recorder panel on the page. Its id is: 20260928-001548-app-panel-4ef1\n\nPlease:\n1. Rea … [1189 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: aea13fb0b2091f68b (internal ID - do not mention to user. Use SendMessage with to: 'aea13fb0b2091f68b', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-sFBsj7/tmp/claude-0/-tmp-claude-eval-sFBsj7-home-cwd/3d1102eb-d316-43b8-bbf2-c005870a24b9/tasks/aea13fb0b2091f68b.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording, find any wasted re-renders in the message box typing flow, fix them in `./src` if found, and re-record to produce before/after numbers. I'll report back once it completes.

> **→ rpr:get_recording**
> ```
> {"id":"20260928-001548-app-panel-4ef1"}
> ```

> **←**
> ```
> {"id":"20260928-001548-app-panel-4ef1","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-001548-app-panel-4ef1","summary":{"id":"20260928-001548-app-panel-4ef1","status":"done","createdAt":"2026-09-28T00:15:50.304Z","source":"panel","url":"http://localhost:44531/?tick=150","viewport":"1280×720","durationSec":1.6,"scope":null,"totals":{"commits":58,"commitsPerSec":37.32,"commitsInScope":58,"renders":169,"rendersPerScopeCommit":2.9,"rendersFromOutside":0,"rendersWithoutDom":100,"domTextChanges":26,"rendersPerTextChange":6.5},"topRoots":[{"root":"MetaInput","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync < Layout","hits":43,"hitsPerSec":27.67,"instances":1,"perHit":1,"noDomChange":43,"renderMsPerHit":0.14,"reasons":["43× state #12 (14 of them same content) · useMetaField › [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:45 const { field, error } = useMetaField(control, name);"],"causes":["43× core:input input","14× zustand:draftStore.setState"],"lanes":"Sync:43"},{"root":"MetaInput","source":"src/components/Composer/index.tsx:104","path":"Composer < ChatView < SettingsBySync < Layout","hits":43,"hitsPerSec":27.67,"instances":1,"perHit":1,"noDomChange":43,"renderMsPerHit":0.08,"reasons":["43× state #12 (14 of them same content) · useMetaField › [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:45 const { field, error } = useMetaField(control, name);" … [7377 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx"}
> ```

> **←**
> ```
> 1	import { memo, type ReactNode } from 'react';
> 2	import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
> 3	import { presenceStore, useChatStore } from '../../store/chat';
> 4	import { draftStore } from '../../store/draft';
> 5	
> 6	export interface ComposerValues {
> 7	  text: string;
> 8	  replyTo: string;
> 9	  remindIn: string;
> 10	}
> 11	
> 12	type FormControl = Control<ComposerValues>;
> 13	
> 14	export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
> 15	  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
> 16	  return (
> 17	    <label className="field grow">
> 18	      <input
> 19	        {...field}
> 20	        data-testid="message"
> 21	        placeholder="Write a message"
> 22	        onChange={(e) => {
> 23	          field.onChange(e);
> 24	          draftStore.setState({ hasDraft: e.target.value.length > 0 });
> 25	          // The other fields are validated against the text.
> 26	          void trigger();
> 27	        }}
> 28	        onKeyDown={(e) => {
> 29	          // Enter waits while someone is typing a reply, so the two messages do not cross.
> 30	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
> 31	        }}
> 32	      />
> 33	    </label>
> 34	  );
> 35	};
> 36	
> 37	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
> 38	  const { field, fieldState } = useController({  … [2462 more]
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

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"        onChange={(e) => {\n          field.onChange(e);\n          draftStore.setState({ hasDraft: e.target.value.length > 0 });\n          // The other fields are validated against the text.\n          void trigger();\n        }}","new_string":"        onChange={(e) => {\n          field.onChange(e);\n          draftStore.setState({ hasDraft: e.target.value.length > 0 });\n          // Revalidate just this field; replyTo/remindIn don't depend on the text.\n          void trigge … [18 more]
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"        <MessageInput control={control} trigger={() => trigger()} />","new_string":"        <MessageInput control={control} trigger={() => trigger('text')} />"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now let me record the same scenario after the fix and compare.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-001548-app-panel-4ef1","label":"after-trigger-scope-fix"}
> ```

> **←**
> ```
> {"id":"20260928-001821-app-record-fd7e","url":"http://localhost:44531/?tick=150&rpr=rec","requested":"http://localhost:44531/?tick=150","durationSec":2.3,"commits":65,"renders":169,"rendersWithoutDom":93,"rendersPerCommit":2.6,"topRoot":"MetaInput ×43","wasting":[{"root":"MetaInput","source":"src/components/Composer/index.tsx:103","hits":43,"instances":1,"noDomChange":43},{"root":"MetaInput","source":"src/components/Composer/index.tsx:104","hits":43,"instances":1,"noDomChange":43}],"warnings":[]}
> ```

> **→ Grep**
> ```
> {"pattern":"\"react-hook-form\"","path":"package.json"}
> ```

> **✗ error**
> ```
> Path does not exist: package.json. Note: your current working directory is ..
> ```

> **→ Glob**
> ```
> {"pattern":"**/package.json"}
> ```

> **←**
> ```
> No files found
> ```

> **→ Glob**
> ```
> {"pattern":"package.json","path":"."}
> ```

> **←**
> ```
> No files found
> ```

> **→ Glob**
> ```
> {"pattern":"*","path":"."}
> ```

> **←**
> ```
> src/app.css
> src/components/TypingLine.tsx
> src/components/ActivityLog.tsx
> src/components/PrefsLine.tsx
> src/components/ChannelStats.tsx
> src/components/WebhookForm.tsx
> src/components/Header.tsx
> src/components/ChannelTopic.tsx
> src/components/TypingBadge.tsx
> src/components/Settings.tsx
> src/components/Messages.tsx
> src/components/MessageCount.tsx
> src/components/ChatView.tsx
> src/components/Workspace.tsx
> src/components/ChatPanel.tsx
> src/components/OnlineNow.tsx
> src/components/TimeAgo.tsx
> src/hooks/useSortedMembers.ts
> src/hooks/useMessageCount.ts
> src/feed.ts
> src/vite-env.d.ts
> src/main.tsx
> src/store/clock.ts
> src/store/activity.ts
> src/store/chat.ts
> src/store/selectors.ts
> src/store/draft.ts
> src/lib/members.ts
> src/lib/channel.ts
> index.html
> src/components/Composer/useFieldError.ts
> recording.txt
> recording.json
> dev-url.txt
> src/components/Composer/index.tsx
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/useFieldError.ts"}
> ```

> **←**
> ```
> <system-reminder>Warning: the file exists but the contents are empty.</system-reminder>
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx","offset":83,"limit":27}
> ```

> **←**
> ```
> 83	export const Composer = () => {
> 84	  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
> 85	    mode: 'onChange',
> 86	    defaultValues: { text: '', replyTo: '', remindIn: '' },
> 87	  });
> 88	  return (
> 89	    <form
> 90	      className="composer"
> 91	      data-testid="composer"
> 92	      onSubmit={handleSubmit((values) => {
> 93	        useChatStore.getState().send(values.text);
> 94	        draftStore.setState({ hasDraft: false });
> 95	        reset();
> 96	      })}
> 97	    >
> 98	      <div className="row">
> 99	        <MessageInput control={control} trigger={() => trigger('text')} />
> 100	        <SendButton control={control} />
> 101	      </div>
> 102	      <div className="row meta">
> 103	        <MetaInput control={control} name="replyTo" />
> 104	        <MetaInput control={control} name="remindIn" />
> 105	        <ComposerHints control={control} />
> 106	      </div>
> 107	    </form>
> 108	  );
> 109	};
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-001821-app-record-fd7e"}
> ```

> **←**
> ```
> {"id":"20260928-001821-app-record-fd7e","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-001821-app-record-fd7e","summary":{"id":"20260928-001821-app-record-fd7e","status":"done","createdAt":"2026-09-28T00:18:23.946Z","label":"after-trigger-scope-fix","source":"script:record","url":"http://localhost:44531/?tick=150&rpr=rec","viewport":"1280×720","durationSec":2.3,"scope":null,"totals":{"commits":66,"commitsPerSec":29.06,"commitsInScope":65,"renders":169,"rendersPerScopeCommit":2.6,"rendersFromOutside":0,"rendersWithoutDom":93,"domTextChanges":31,"rendersPerTextChange":5.5},"topRoots":[{"root":"MetaInput","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync < Layout","hits":43,"hitsPerSec":18.93,"instances":1,"perHit":1,"noDomChange":43,"renderMsPerHit":0.13,"reasons":["43× state #12 (14 of them same content) · useMetaField › [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:45 const { field, error } = useMetaField(control, name);"],"causes":["43× core:input input","14× zustand:draftStore.setState"],"lanes":"Sync:43"},{"root":"MetaInput","source":"src/components/Composer/index.tsx:104","path":"Composer < ChatView < SettingsBySync < Layout","hits":43,"hitsPerSec":18.93,"instances":1,"perHit":1,"noDomChange":43,"renderMsPerHit":0.09,"reasons":["43× state #12 (14 of them same content) · useMetaField › [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:45 co … [7489 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx","offset":36,"limit":18}
> ```

> **←**
> ```
> 36	
> 37	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
> 38	  const { field, fieldState } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
> 39	  return { field, error: fieldState.error?.message };
> 40	}
> 41	
> 42	const LABELS = { replyTo: 'reply to #', remindIn: 'remind in, min' } as const;
> 43	
> 44	export const MetaInput = ({ control, name }: { control: FormControl; name: 'replyTo' | 'remindIn' }) => {
> 45	  const { field, error } = useMetaField(control, name);
> 46	  return (
> 47	    <label className="field small">
> 48	      <span>{LABELS[name]}</span>
> 49	      <input {...field} data-testid={name} placeholder="0" />
> 50	      {error && <em className="error">{error}</em>}
> 51	    </label>
> 52	  );
> 53	};
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {\n  const { field, fieldState } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });\n  return { field, error: fieldState.error?.message };\n}\n\nconst LABELS = { replyTo: 'reply to #', remindIn: 'remind in, min' } as const;\n\nexport const MetaInput = ({ control, name }: { control: FormControl; name: 'replyTo' | 'remindIn' }) => {\n  const { field, err … [1590 more]
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully.
> ```

> **agent:** Now let's record again with the same replay to measure.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-001548-app-panel-4ef1","label":"after-split-error-leaf"}
> ```

> **←**
> ```
> {"id":"20260928-002233-app-record-b1f6","url":"http://localhost:44531/?tick=150&rpr=rec","requested":"http://localhost:44531/?tick=150","durationSec":2.3,"commits":51,"renders":115,"rendersWithoutDom":39,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×15","wasting":[{"root":"MetaFieldError","source":"src/components/Composer/index.tsx:60","hits":15,"instances":2,"noDomChange":30}],"warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-001548-app-panel-4ef1","after":"20260928-002233-app-record-b1f6"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":["durations differ (1554ms vs 2284ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260928-001548-app-panel-4ef1","durationMs":1554},"after":{"id":"20260928-002233-app-record-b1f6","durationMs":2284},"totals":{"commits":"58 → 51 (-12%)","renders":"169 → 115 (-32%)","commitsPerSec":"37.32 → 22.33 (-40%)","rendersPerSec":"108.75 → 50.35 (-54%)","rendersPerCommit":"2.9 → 2.3 (-21%)","rendersWithoutDomPerSec":"64.35 → 17.08 (-73%)","rendersPerTextChange":"6.5 → 3.7 (-43%)","longTaskMaxMs":"0 → 99"},"roots":[{"root":"MetaInput","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"27.67 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"27.67 → 0 (-100%)"},{"root":"MetaInput","source":"src/components/Composer/index.tsx:104","path":"Composer < ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"27.67 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"27.67 → 0 (-100%)"},{"root":"MetaFieldError","source":"src/components/Composer/index.tsx:60","path":"MetaInput < Composer < ChatView < SettingsBySync","status":"new","hitsPerSec":"– → 6.57","perHit":"– → 2","instances":"– → 2","cascadePerSec":"0 → 13.13"},{"root":"SendButton","source":"src/components/Composer/index.tsx:110","path":"Composer < ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec … [4236 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx"}
> ```

> **←**
> ```
> 1	import { memo, type ReactNode } from 'react';
> 2	import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
> 3	import { presenceStore, useChatStore } from '../../store/chat';
> 4	import { draftStore } from '../../store/draft';
> 5	
> 6	export interface ComposerValues {
> 7	  text: string;
> 8	  replyTo: string;
> 9	  remindIn: string;
> 10	}
> 11	
> 12	type FormControl = Control<ComposerValues>;
> 13	
> 14	export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
> 15	  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
> 16	  return (
> 17	    <label className="field grow">
> 18	      <input
> 19	        {...field}
> 20	        data-testid="message"
> 21	        placeholder="Write a message"
> 22	        onChange={(e) => {
> 23	          field.onChange(e);
> 24	          draftStore.setState({ hasDraft: e.target.value.length > 0 });
> 25	          // Revalidate just this field; replyTo/remindIn don't depend on the text.
> 26	          void trigger();
> 27	        }}
> 28	        onKeyDown={(e) => {
> 29	          // Enter waits while someone is typing a reply, so the two messages do not cross.
> 30	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
> 31	        }}
> 32	      />
> 33	    </label>
> 34	  );
> 35	};
> 36	
> 37	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
> 38	  // Only the field itself … [3078 more]
> ```

> **agent:** This looks correct and clean. The fix is confirmed by the measured comparison. Let me summarize the findings.
> 
> ## Findings
> 
> **Recording read**: `20260928-001548-app-panel-4ef1` (panel recording, `http://localhost:44531/?tick=150`, viewport 1280×720, one action: typing 15 chars into the message box, 1.55s).
> 
> ### Causes of wasted re-rendering
> 
> 1. **`MetaInput` (both instances)** — `src/components/Composer/index.tsx:103` and `:104` (path `Composer < ChatView < SettingsBySync < Layout`).
>    Before fix: 43 hits each (86 total) for 15 keystrokes, **100% `noDomChange`** — every single render changed nothing on screen.
>    Reason: `useMetaField › [react-hook-form] useController › useFormState › State` at `src/components/Composer/index.tsx:45` (now `:42`/`:48`). `MetaInput` destructured `fieldState.error` in the same hook call that also produced the `<input>`'s `field`. react-hook-form marks the shared `errors` object as "read" for that component, so whenever the form's `errors` object gets a new reference — which happens on *every* keystroke in the unrelated `text` field, because `SendButton` tracks the aggregate `isValid` and that forces react-hook-form to revalidate the whole form, not just the changed field — both `MetaInput` instances (which have nothing to do with the `text` field) re-rendered along with their whole input row.
>    Contributing cause: `src/components/Composer/index.tsx:26` (`MessageInput`'s `onChange`) called `trigger()` with no argument, explicitly re-validating the entire form (including `replyTo`/`remindIn`) on every keystroke, even though those fields' validation rules (`!v || Number(v) > 0`) never depend on the `text` value — the comment claiming otherwise didn't match the code.
> 
> 2. **`SendButton`** — `src/components/Composer/index.tsx:75` (`useFormState({ control })` reading `isValid`), 15/15 hits, 14/15 `noDomChange`. Partly caused by the same explicit whole-form `trigger()` call above.
> 
> ### Fix (in `./src/components/Composer/index.tsx`)
> 
> - Scoped the manual revalidation to the field that actually changed: `trigger={() => trigger('text')}` instead of `trigger={() => trigger()}` (line 109).
> - Split `MetaInput` so the error message is read by a separate leaf component `MetaFieldError` (line 48-52) via its own `useFormState({ control, name, exact: true })`, instead of being read in the same component/hook call that also renders the `<input>` (`useMetaField`, line 37-44, now returns only `field`). This means the row holding the `<input>` no longer subscribes to the shared `errors` object at all, so it stops re-rendering when unrelated fields get revalidated; only the tiny leaf (which genuinely needs to check for its own error) still re-renders, and cheaply.
> 
> No validation logic, messages, or visible behavior changed — same rules, same error text, same disabled/enabled logic for Send.
> 
> ### Before/after (same replay of the original recording, `compare_recordings`)
> 
> - `MetaInput` root: **gone** — both instances (`27.67/s` each) dropped to 0; replaced by `MetaFieldError`, a tiny leaf with far less work per hit (`hitsPerSec 6.57` combined vs `27.67×2` before).
> - `SendButton`: `9.65/s → 0.44/s` hits (**-95%**), i.e. essentially only its one legitimate transition remains.
> - Whole run totals: `commits 58 → 51 (-12%)`, `renders 169 → 115 (-32%)`, `rendersWithoutDom/s 64.35 → 17.08 (-73%)`, `rendersPerTextChange 6.5 → 3.7 (-43%)`.
> - Per-character typing action: **9.8 renders/char → 5.2 renders/char (-47%)**.
> 
> Recording ids: before `20260928-001548-app-panel-4ef1`; after `20260928-002233-app-record-b1f6` (replay of the same repro on the fixed code); comparison run via `compare_recordings`.
> 
> ### What still renders for nothing (left as-is, and why)
> 
> `MetaFieldError` (`src/components/Composer/index.tsx:48-52`, both instances) — 15 hits each, all `noDomChange`. This remains because react-hook-form keeps `errors` as one shared object for the whole form (not sliced per field), and `SendButton` legitimately needs the aggregate `isValid` to disable/enable Send, which forces a full-form revalidation on every keystroke. Any component that must read `errors[name]` to know whether *it* has an error will be notified on that revalidation, even when its own field didn't change. This is now isolated to a minimal leaf that renders `null` either way — cheap — and removing it further would require changing behavior (e.g. not disabling Send based on `replyTo`/`remindIn` validity), which is outside a "no behavior change" fix.
> 
> ### Conditions
> Page `http://localhost:44531/?tick=150`, viewport 1280×720, no CPU throttling, scenario replayed via the recorder from the original recording's actions (typing "see you at five"-length input, 15 chars) — both before/after runs used the same replay of the same original panel recording, comparable per the tool's warning (durations differ slightly, so per-second rates aren't directly comparable, but the action-level and whole-run totals above are).
> 
> ### Not checked
> - Whether `MetaFieldError`'s residual renders could be avoided with a schema-level resolver instead of per-field `rules` (would touch validation architecture, out of scope for a minimal fix).
> - Background roots unrelated to typing (`SyncBar`, `TypingLine`, `ChannelStats`, `OnlineNow`, `Status`) — their causes are `zustand:feed/tick`/`core:message Worker`/react-query, not the typing action; not investigated further since they're outside this complaint.
> - No load/CPU throttling was tested; only default conditions were measured.

**→ Read**
```
{"file_path":"src/components/Composer/index.tsx"}
```

**←**
```
1	import { memo, type ReactNode } from 'react';
2	import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
3	import { presenceStore, useChatStore } from '../../store/chat';
4	import { draftStore } from '../../store/draft';
5	
6	export interface ComposerValues {
7	  text: string;
8	  replyTo: string;
9	  remindIn: string;
10	}
11	
12	type FormControl = Control<ComposerValues>;
13	
14	export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
15	  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
16	  return (
17	    <label className="field grow">
18	      <input
19	        {...field}
20	        data-testid="message"
21	        placeholder="Write a message"
22	        onChange={(e) => {
23	          field.onChange(e);
24	          draftStore.setState({ hasDraft: e.target.value.length > 0 });
25	          // Revalidate just this field; replyTo/remindIn don't depend on the text.
26	          void trigger();
27	        }}
28	        onKeyDown={(e) => {
29	          // Enter waits while someone is typing a reply, so the two messages do not cross.
30	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
31	        }}
32	      />
33	    </label>
34	  );
35	};
36	
37	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
38	  // Only the field itself … [3078 more]
```

**agent:** The perf-recorder agent finished its analysis and fix. Summary:

**Root cause**: In `src/components/Composer/index.tsx`, `MetaInput` (the two small "reply to #" / "remind in" fields) read `fieldState.error` from the same `useController` call that also produced their `<input>` binding. Because `SendButton` tracks the form's aggregate `isValid`, and `MessageInput`'s `onChange` called `trigger()` with no argument (revalidating the *whole* form on every keystroke), react-hook-form gave the `errors` object a new reference on every character typed — and both `MetaInput` rows re-rendered every time, even though the message text has nothing to do with them. `SendButton` itself also re-rendered on nearly every keystroke for the same reason.

**Fix** (no behavior/visual change):
- `MessageInput` now revalidates only its own field (`trigger('text')`) instead of the whole form.
- Split out a tiny `MetaFieldError` leaf component that's the only thing subscribing to `errors[name]`; `MetaInput`/`useMetaField` now only reads `field`, so the input row no longer re-renders when unrelated fields revalidate.

**Before/after** (same repro, "see you at five" typed, via `compare_recordings`):
- `MetaInput` rows: 27.67 hits/s each, 100% no-DOM-change → eliminated entirely (replaced by a much cheaper leaf).
- `SendButton`: 9.65 → 0.44 hits/s (‑95%).
- Whole run: renders 169 → 115 (‑32%), renders-without-DOM-change 64.35/s → 17.08/s (‑73%), renders per character typed 9.8 → 5.2 (‑47%).

A residual, unavoidable-without-behavior-change render remains in the new `MetaFieldError` leaf (cheap, renders `null`) since `SendButton` legitimately needs form-wide `isValid`. Background stores unrelated to typing (SyncBar, TypingLine, etc.) were left untouched as out of scope.
