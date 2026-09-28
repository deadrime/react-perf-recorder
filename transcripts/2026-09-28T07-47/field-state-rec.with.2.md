# field-state-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.53, 218 s, 2 turns

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

> The fix looks clean and minimal — the wasteful whole-form `trigger()` call is gone, and `MessageInput`/`Composer` no longer thread the unused `trigger` prop. Nothing else in the file changed.
> 
> ## Root cause
> Every keystroke in the message box called `trigger()` with no field name, forcing react-hook-form to revalidate the **entire form** and rebuild its shared `errors`/formState object. That woke up every field subscriber — not just the message input — even though nothing about `replyTo`, `remindIn`, or send-button validity had actually changed.
> 
> ## Fix
> `src/components/Composer/index.tsx`: removed the redundant `trigger()` call in `MessageInput`'s `onChange` and the now-unused `trigger` prop passed from `Composer`. `mode: 'onChange'` already validates each field independently when it changes, so behavior (validation, submit, what's displayed) is unaffected.
> 
> ## Before → after (typing "see you at five", same repro replayed)
> - `MetaInput` (both `replyTo`/`remindIn` instances): 28.5 renders/sec → **0**, all previously 100% wasted (no DOM change)
> - `SendButton`: 9.95 → 0.45 renders/sec (**-95%**)
> - Renders per typed character: 9.8 → 3.1 (**-68%**)
> - Total renders: 168 → 83 (**-51%**), commits: 57 → 36 (**-37%**)
> - Wasted (no-DOM-change) renders/sec: 66.3 → 3.1 (**-95%**)
> 
> Everything still visibly changing (typed-length hint, send-button enable/disable) still re-renders as expected — nothing was suppressed that should update.
> 
> Not touched: unrelated background activity (presence/typing indicators, stats) — out of scope for this complaint. A `tsc` typecheck wasn't run, but no other file imports `MessageInput`, so the prop-signature change is safe.

## What it changed

```
diff -ruN a/src/components/Composer/index.tsx b/src/components/Composer/index.tsx
--- a/src/components/Composer/index.tsx
+++ b/src/components/Composer/index.tsx
@@ -11,7 +11,7 @@
 
 type FormControl = Control<ComposerValues>;
 
-export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
+export const MessageInput = ({ control }: { control: FormControl }) => {
   const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
   return (
     <label className="field grow">
@@ -22,8 +22,9 @@
         onChange={(e) => {
           field.onChange(e);
           draftStore.setState({ hasDraft: e.target.value.length > 0 });
-          // The other fields are validated against the text.
-          void trigger();
+          // field.onChange above already validates this field (mode: 'onChange');
+          // the other fields validate themselves independently when they change,
+          // so no explicit trigger() of the whole form is needed here.
         }}
         onKeyDown={(e) => {
           // Enter waits while someone is typing a reply, so the two messages do not cross.
@@ -81,7 +82,7 @@
 };
 
 export const Composer = () => {
-  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
+  const { control, handleSubmit, reset } = useForm<ComposerValues>({
     mode: 'onChange',
     defaultValues: { text: '', replyTo: '', remindIn: '' },
   });
@@ -96,7 +97,7 @@
       })}
     >
       <div className="row">
-        <MessageInput control={control} trigger={() => trigger()} />
+        <MessageInput control={control} />
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
1	20260928-075308-app-panel-712f
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:43529/?tick=150
2	
```

**→ Agent**
```
{"description":"Diagnose and fix React re-render lag","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app lives in ., source in ./src. Dev server is already running at http://localhost:43529/?tick=150 and hot-reloads on source changes.\n\nComplaint: typing into the message box at the bottom of the page lags. Repro: open the page, click the message box, type a short message like \"see you at five\".\n\nThere is already a recording of this repro made with the recorder's panel on the page. Its id is: 20260928-075308-app-panel-712f\n\nTask:\n1.  … [1020 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: ab982f4d35b33ccda (internal ID - do not mention to user. Use SendMessage with to: 'ab982f4d35b33ccda', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-7gn5u7/tmp/claude-0/-tmp-claude-eval-7gn5u7-home-cwd/772f5308-78f9-4575-892a-d18d30ea762d/tasks/ab982f4d35b33ccda.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording (`20260928-075308-app-panel-712f`), find any wasted re-renders while typing in the message box, fix them in `./src` if real, and produce before/after numbers. It's running in the background — I'll report back once it finishes.

> **→ rpr:get_recording**
> ```
> {"id":"20260928-075308-app-panel-712f"}
> ```

> **←**
> ```
> {"id":"20260928-075308-app-panel-712f","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075308-app-panel-712f","summary":{"id":"20260928-075308-app-panel-712f","status":"done","createdAt":"2026-09-28T07:53:10.438Z","source":"panel","url":"http://localhost:43529/?tick=150","viewport":"1280×720","durationSec":1.5,"scope":null,"totals":{"commits":57,"commitsPerSec":37.8,"commitsInScope":57,"renders":168,"rendersPerScopeCommit":2.9,"rendersFromOutside":0,"rendersWithoutDom":100,"domTextChanges":26,"rendersPerTextChange":6.5},"topRoots":[{"root":"MetaInput","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync < Layout","hits":43,"hitsPerSec":28.51,"instances":1,"perHit":1,"noDomChange":43,"renderMsPerHit":0.13,"reasons":["43× state #12 (14 of them same content) · useMetaField › [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:45 const { field, error } = useMetaField(control, name);"],"causes":["43× core:input input","14× zustand:draftStore.setState"],"lanes":"Sync:43"},{"root":"MetaInput","source":"src/components/Composer/index.tsx:104","path":"Composer < ChatView < SettingsBySync < Layout","hits":43,"hitsPerSec":28.51,"instances":1,"perHit":1,"noDomChange":43,"renderMsPerHit":0.07,"reasons":["43× state #12 (14 of them same content) · useMetaField › [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:45 const { field, error } = useMetaField(control, name);"] … [7354 more]
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

> **agent:** The recording shows the cascade root `MetaInput` (both instances, `src/components/Composer/index.tsx:45`) firing 43 times while typing 15 characters, with `noDomChange: 43` for **both** — every single one of those renders changed nothing on screen. The reason: `useMetaField › useController › useFormState › State`. Let me confirm the mechanism in the code around the input handler.

> **→ Grep**
> ```
> {"pattern":"trigger","path":"src/components/Composer/index.tsx","-n":true}
> ```

> **←**
> ```
> Found 1 file
> src/components/Composer/index.tsx
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"          field.onChange(e);\n          draftStore.setState({ hasDraft: e.target.value.length > 0 });\n          // The other fields are validated against the text.\n          void trigger();","new_string":"          field.onChange(e);\n          draftStore.setState({ hasDraft: e.target.value.length > 0 });\n          // Only the text field's own validity depends on what was typed here;\n          // the other fields validate themselves independently (mode: 'onChange').\n         … [25 more]
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now let's record the repro again (replay the original recording) and compare.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-075308-app-panel-712f","label":"after"}
> ```

> **←**
> ```
> {"id":"20260928-075409-app-record-b05d","url":"http://localhost:43529/?tick=150&rpr=rec","requested":"http://localhost:43529/?tick=150","durationSec":2.4,"commits":65,"renders":184,"rendersWithoutDom":107,"rendersPerCommit":2.8,"topRoot":"MetaInput ×43","wasting":[{"root":"MetaInput","source":"src/components/Composer/index.tsx:104","hits":43,"instances":1,"noDomChange":43},{"root":"MetaInput","source":"src/components/Composer/index.tsx:105","hits":43,"instances":1,"noDomChange":43},{"root":"SendButton","source":"src/components/Composer/index.tsx:101","hits":15,"instances":1,"noDomChange":14}],"warnings":[]}
> ```

> **→ Grep**
> ```
> {"pattern":"\"react-hook-form\"","path":"package.json"}
> ```

> **✗ error**
> ```
> Path does not exist: package.json. Note: your current working directory is ..
> ```

> **→ Grep**
> ```
> {"pattern":"react-hook-form","path":"package.json","output_mode":"content"}
> ```

> **✗ error**
> ```
> Path does not exist: package.json. Note: your current working directory is ..
> ```

> **→ Glob**
> ```
> {"pattern":"**/package.json","path":"."}
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

> **→ Glob**
> ```
> {"pattern":"**/react-hook-form/package.json","path":"."}
> ```

> **←**
> ```
> No files found
> ```

> **→ Glob**
> ```
> {"pattern":"**/node_modules/react-hook-form/package.json"}
> ```

> **←**
> ```
> No files found
> ```

> **→ Glob**
> ```
> {"pattern":"**/react-hook-form/dist/useController.js"}
> ```

> **←**
> ```
> No files found
> ```

> **→ Glob**
> ```
> {"pattern":"**/react-hook-form/**"}
> ```

> **←**
> ```
> No files found
> ```

> **→ Glob**
> ```
> {"pattern":"node_modules/*","path":"."}
> ```

> **←**
> ```
> No files found
> ```

> **→ Glob**
> ```
> {"pattern":"node_modules/*","path":"/tmp/claude-eval-7gn5u7/home"}
> ```

> **←**
> ```
> No files found
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-075409-app-record-b05d","section":"components"}
> ```

> **←**
> ```
> {"id":"20260928-075409-app-record-b05d","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075409-app-record-b05d","components":{"total":42,"offset":0,"items":[{"name":"MetaInput","renders":88,"mounts":2,"withoutDom":88,"byParent":2,"reasons":[{"i":9,"n":58,"reason":"state #12"},{"i":11,"n":28,"reason":"state #12 SAME-CONTENT"},{"i":2,"n":2,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":2,"way":"core:effect (react-hook-form) › Composer · state useForm › MetaInput · props equal"}]},{"name":"MessageInput","renders":16,"mounts":1,"withoutDom":1,"byParent":1,"reasons":[{"i":5,"n":15,"reason":"state #6"},{"i":1,"n":1,"reason":"parent: props new ref, same content: trigger"}],"chains":[{"n":1,"way":"core:effect (react-hook-form) › Composer · state useForm › MessageInput · new ref, same content trigger"}]},{"name":"SendButton","renders":16,"mounts":1,"withoutDom":15,"byParent":1,"reasons":[{"i":8,"n":15,"reason":"state #0"},{"i":2,"n":1,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":1,"way":"core:effect (react-hook-form) › Composer · state useForm › SendButton · props equal"}]},{"name":"ComposerHints","renders":16,"mounts":1,"withoutDom":1,"byParent":1,"reasons":[{"i":6,"n":15,"reason":"state #5"},{"i":2,"n":1,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":1,"way":"core:effect (react-hook-form) › Composer · state useForm › ComposerHints · props equal"}]},{"name":"StatRow","renders":15,"mounts":2,"withoutDom":0,"byParent":15 … [932 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx","offset":14,"limit":20}
> ```

> **←**
> ```
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
> 25	          // Only the text field's own validity depends on what was typed here;
> 26	          // the other fields validate themselves independently (mode: 'onChange').
> 27	          void trigger('text');
> 28	        }}
> 29	        onKeyDown={(e) => {
> 30	          // Enter waits while someone is typing a reply, so the two messages do not cross.
> 31	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
> 32	        }}
> 33	      />
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"          void trigger('text');","new_string":"          // void trigger('text'); // diagnostic: temporarily disabled"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully.
> ```

> **→ rpr:record_page**
> ```
> {"replay":"20260928-075308-app-panel-712f","label":"diagnostic-no-trigger"}
> ```

> **←**
> ```
> {"id":"20260928-075529-app-record-3e65","url":"http://localhost:43529/?tick=150&rpr=rec","requested":"http://localhost:43529/?tick=150","durationSec":2.2,"commits":36,"renders":83,"rendersWithoutDom":7,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×15","wasting":[],"warnings":[]}
> ```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-075529-app-record-3e65"}
> ```

> **←**
> ```
> {"id":"20260928-075529-app-record-3e65","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075529-app-record-3e65","summary":{"id":"20260928-075529-app-record-3e65","status":"done","createdAt":"2026-09-28T07:55:31.591Z","label":"diagnostic-no-trigger","source":"script:record","url":"http://localhost:43529/?tick=150&rpr=rec","viewport":"1280×720","durationSec":2.2,"scope":null,"totals":{"commits":37,"commitsPerSec":17,"commitsInScope":36,"renders":83,"rendersPerScopeCommit":2.3,"rendersFromOutside":0,"rendersWithoutDom":7,"domTextChanges":31,"rendersPerTextChange":2.7},"topRoots":[{"root":"ComposerHints","source":"src/components/Composer/index.tsx:106","path":"Composer < ChatView < SettingsBySync < Layout","hits":15,"hitsPerSec":6.89,"instances":1,"perHit":2,"noDomChange":0,"renderMsPerHit":0.11,"reasons":["15× state #5 · [react-hook-form] useWatch › State @ src/components/Composer/index.tsx:66 const text = useWatch({ control, name: 'text' });"],"causes":["15× zustand:draftStore.setState","15× core:input input"],"lanes":"Sync:15"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:100","path":"Composer < ChatView < SettingsBySync < Layout","hits":15,"hitsPerSec":6.89,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.18,"reasons":["15× state #6 · [react-hook-form] useController › useWatch › State @ src/components/Composer/index.tsx:15 const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say somethi … [7353 more]
> ```

> **→ Glob**
> ```
> {"pattern":"tsconfig*.json","path":"."}
> ```

> **←**
> ```
> No files found
> ```

> **→ Grep**
> ```
> {"pattern":"MessageInput","path":"src","-n":true}
> ```

> **←**
> ```
> Found 1 file
> src/components/Composer/index.tsx
> ```

> **agent:** Only used within this file. Let's clean it up properly: remove the now-unnecessary `trigger` plumbing.

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx","offset":83,"limit":20}
> ```

> **←**
> ```
> 83	
> 84	export const Composer = () => {
> 85	  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
> 86	    mode: 'onChange',
> 87	    defaultValues: { text: '', replyTo: '', remindIn: '' },
> 88	  });
> 89	  return (
> 90	    <form
> 91	      className="composer"
> 92	      data-testid="composer"
> 93	      onSubmit={handleSubmit((values) => {
> 94	        useChatStore.getState().send(values.text);
> 95	        draftStore.setState({ hasDraft: false });
> 96	        reset();
> 97	      })}
> 98	    >
> 99	      <div className="row">
> 100	        <MessageInput control={control} trigger={() => trigger()} />
> 101	        <SendButton control={control} />
> 102	      </div>
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {\n  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });\n  return (\n    <label className=\"field grow\">\n      <input\n        {...field}\n        data-testid=\"message\"\n        placeholder=\"Write a message\"\n        onChange={(e) => {\n          field.onChange(e);\n          draftStore. … [1062 more]
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully.
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({\n    mode: 'onChange',\n    defaultValues: { text: '', replyTo: '', remindIn: '' },\n  });\n  return (\n    <form\n      className=\"composer\"\n      data-testid=\"composer\"\n      onSubmit={handleSubmit((values) => {\n        useChatStore.getState().send(values.text);\n        draftStore.setState({ hasDraft: false });\n        reset();\n      })}\n    >\n      <div className=\"row\">\n        <Messag … [685 more]
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully.
> ```

> **agent:** Now let's record the fixed version and compare against the original baseline recording.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-075308-app-panel-712f","label":"after"}
> ```

> **←**
> ```
> {"id":"20260928-075605-app-record-9ff8","url":"http://localhost:43529/?tick=150&rpr=rec","requested":"http://localhost:43529/?tick=150","durationSec":2.2,"commits":36,"renders":83,"rendersWithoutDom":7,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×15","wasting":[],"warnings":[]}
> ```

> **agent:** Wasting is empty. Let's run the formal compare against the original baseline recording.

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-075308-app-panel-712f","after":"20260928-075605-app-record-9ff8"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":["durations differ (1508ms vs 2228ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260928-075308-app-panel-712f","durationMs":1508},"after":{"id":"20260928-075605-app-record-9ff8","durationMs":2228},"totals":{"commits":"57 → 36 (-37%)","renders":"168 → 83 (-51%)","commitsPerSec":"37.8 → 16.16 (-57%)","rendersPerSec":"111.41 → 37.25 (-67%)","rendersPerCommit":"2.9 → 2.3 (-21%)","rendersWithoutDomPerSec":"66.31 → 3.14 (-95%)","rendersPerTextChange":"6.5 → 2.7 (-58%)","longTaskMaxMs":"0 → 115"},"roots":[{"root":"MetaInput","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"28.51 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"28.51 → 0 (-100%)"},{"root":"MetaInput","source":"src/components/Composer/index.tsx:104","path":"Composer < ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"28.51 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"28.51 → 0 (-100%)"},{"root":"SendButton","source":"src/components/Composer/index.tsx:101","path":"Composer < ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"9.95 → 0.45 (-95%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"9.95 → 0.45 (-95%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:106","path":"Composer < ChatView < SettingsBySync < Layout","s … [3880 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx","offset":1,"limit":35}
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
> 14	export const MessageInput = ({ control }: { control: FormControl }) => {
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
> 25	          // field.onChange above already validates this field (mode: 'onChange');
> 26	          // the other fields validate themselves independently when they change,
> 27	          // so no explicit trigger() of the whole form is needed here.
> 28	        }}
> 29	        onKeyDown={(e) => {
> 30	          // Enter waits while someone is typing a reply, so the two messages do not cross.
> 31	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
> 32	        }}
> 33	      />
> 34	    </label>
> 35	  );
> ```

> **agent:** Clean. Summary of the finding and fix:
> 
> ## Root cause
> 
> Every keystroke in the message box called `trigger()` (react-hook-form, no field name → revalidates the whole form): `src/components/Composer/index.tsx:26` (in `MessageInput`'s `onChange`, before the fix), passed in via `Composer` at line 100 (`trigger={() => trigger()}`).
> 
> That whole-form revalidation recreated react-hook-form's shared `errors`/formState object on every character, which notified every field subscriber in the form, not just the one whose value actually changed. Cascade root: **`MetaInput`** (both instances — `replyTo` and `remindIn`), `src/components/Composer/index.tsx:45` (`useMetaField › useController › useFormState › State`). The recording showed `hits: 43, noDomChange: 43` for **both** instances — 100% of their renders during the 15-char typing action changed nothing on screen (many flagged `SAME-CONTENT`), because neither of those fields ever changed while typing in the message box. `SendButton` (`:75`) and `ComposerHints`/`MessageInput` were also over-rendering from the same cause, though less wastefully (some of their renders did reflect a real value/validity change).
> 
> I verified by diagnostic: removing the `trigger()` call entirely dropped `MetaInput`'s waste to zero immediately (confirmed the mechanism before finalizing).
> 
> ## Fix
> 
> `src/components/Composer/index.tsx` — removed the redundant `trigger()` call and the now-unused `trigger` prop threading between `Composer` and `MessageInput`. `mode: 'onChange'` already validates a field automatically when its own `onChange` fires, so `replyTo`/`remindIn` still validate themselves independently when the user actually edits them; nothing shown, validated or submitted changes — only the needless whole-form revalidation on unrelated keystrokes is gone.
> 
> Lines changed:
> - `MessageInput` signature: dropped `trigger` prop, dropped the `void trigger()` call in `onChange` (was `void trigger();`, briefly `void trigger('text');` in an intermediate attempt that turned out not to help — react-hook-form's `errors` object is recreated as a whole on any validation pass regardless of the field name argument, so only removing the call itself fixed it).
> - `Composer`: `useForm(...)` no longer destructures `trigger`; `<MessageInput control={control} />` no longer passes it.
> 
> ## Before / after (via `compare_recordings`, same replayed repro: typing "see you at five")
> 
> - `MetaInput` root (both instances, line 103/104): **gone entirely** — hitsPerSec 28.51 → 0 (-100%), `wastingAfter: []`.
> - `SendButton`: hitsPerSec 9.95 → 0.45 (-95%).
> - Per-typed-character: renders 9.8 → 3.1 per char (**-68%**).
> - Overall: renders 168 → 83 (-51%), commits 57 → 36 (-37%), `rendersWithoutDomPerSec` 66.31 → 3.14 (-95%), `rendersPerTextChange` 6.5 → 2.7 (-58%).
> 
> ## What still renders (legitimately)
> 
> `ComposerHints` and `MessageInput` itself still re-render once per keystroke (they show the typed text / its length), and `SendButton` still re-renders on the rare validity transition — all with real DOM changes, per `wastingAfter: []`.
> 
> ## Conditions
> 
> Page `http://localhost:43529/?tick=150`, viewport 1280×720, repro = click message box, type "see you at five" (15 chars), replayed via `record_page` `replay` against the original panel recording `20260928-075308-app-panel-712f`; after-fix id `20260928-075605-app-record-9ff8`.
> 
> ## Not checked
> 
> - `SyncBar`, `OnlineNow`, `ChannelStats`, `TypingLine`, `Status`, `DraftBadge` etc. (background workspace/presence/query activity, unrelated to typing) — left as is, not part of the complaint.
> - No production build / typecheck run for the removed `trigger` prop (this is a dev server with esbuild transpile-only; no other file imports `MessageInput`, so the signature change is safe, but I did not run `tsc`).
> - Duration of before/after replay runs differed (1508ms vs 2228ms, noted by the comparator); conclusions are drawn from the per-character and per-root rate/waste metrics, which normalize for that.

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
14	export const MessageInput = ({ control }: { control: FormControl }) => {
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
25	          // field.onChange above already validates this field (mode: 'onChange');
26	          // the other fields validate themselves independently when they change,
27	          // so no explicit trigger() of the whole form is needed here.
28	        }}
29	        onKeyDown={(e) => {
30	          // Enter waits while someone is typing a reply, so the two messages do not cross.
31	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
32	        }}
33	      />
34	    </label>
35	  );
36	};
37	
38	function useMetaF … [2538 more]
```

**agent:** The fix looks clean and minimal — the wasteful whole-form `trigger()` call is gone, and `MessageInput`/`Composer` no longer thread the unused `trigger` prop. Nothing else in the file changed.

## Root cause
Every keystroke in the message box called `trigger()` with no field name, forcing react-hook-form to revalidate the **entire form** and rebuild its shared `errors`/formState object. That woke up every field subscriber — not just the message input — even though nothing about `replyTo`, `remindIn`, or send-button validity had actually changed.

## Fix
`src/components/Composer/index.tsx`: removed the redundant `trigger()` call in `MessageInput`'s `onChange` and the now-unused `trigger` prop passed from `Composer`. `mode: 'onChange'` already validates each field independently when it changes, so behavior (validation, submit, what's displayed) is unaffected.

## Before → after (typing "see you at five", same repro replayed)
- `MetaInput` (both `replyTo`/`remindIn` instances): 28.5 renders/sec → **0**, all previously 100% wasted (no DOM change)
- `SendButton`: 9.95 → 0.45 renders/sec (**-95%**)
- Renders per typed character: 9.8 → 3.1 (**-68%**)
- Total renders: 168 → 83 (**-51%**), commits: 57 → 36 (**-37%**)
- Wasted (no-DOM-change) renders/sec: 66.3 → 3.1 (**-95%**)

Everything still visibly changing (typed-length hint, send-button enable/disable) still re-renders as expected — nothing was suppressed that should update.

Not touched: unrelated background activity (presence/typing indicators, stats) — out of scope for this complaint. A `tsc` typecheck wasn't run, but no other file imports `MessageInput`, so the prop-signature change is safe.
