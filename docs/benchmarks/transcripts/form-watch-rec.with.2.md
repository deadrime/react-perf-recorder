# form-watch-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.52, 233 s, 29 turns

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

> Numbers match, and no warnings (no HMR full-refresh, no React dev warnings). The fix is confirmed and stable.
> 
> ## What was found
> 
> `Composer` (`src/components/Composer/index.tsx`) called react-hook-form's `watch()` with no argument during render, just to compute a `data-filled` count:
> 
> ```tsx
> const filled = Object.values(watch()).filter(Boolean).length;
> ```
> 
> `watch()` called this way subscribes the *whole component* to every field change. So typing one character re-rendered all of `Composer` — and everything below it (`MessageInput`, `SendButton`, both `MetaInput`s, `ComposerHints`) — even though `data-filled` only actually changes value at the empty↔non-empty transition, not on every keystroke. The recording showed `Composer`'s own output unchanged in 15 of 16 hits (`ownDomUnchanged: 15`) — pure waste.
> 
> ## Fix
> 
> Moved the `watch` subscription into a small leaf component (`FilledAttribute`) that renders nothing (`return null`) and imperatively sets the `data-filled` attribute on the form via a ref, instead of running inside `Composer` itself. `Composer` no longer subscribes to form state at all, so it stops re-rendering per keystroke. The page's DOM output is identical — same attribute, same values, updated at the same points.
> 
> ## Before → after (same recorded scenario, replayed against both versions)
> 
> | Metric | Before | After | Change |
> |---|---|---|---|
> | Renders (typing "see you at five") | 187 | 113 | **-40%** |
> | Commits | 65 | 50 | -23% |
> | Renders without any DOM change /s | 41.65 | 16.17 | **-61%** |
> | Renders per character typed | 10.1 | 5.1 | **-50%** |
> | `Composer` re-renders /s | 6.94 | 0.44 | **-94%** |
> | `MessageInput` re-renders /s | 13.02 | 6.56 | -50% (collateral: no longer double-rendered by its wasteful parent) |
> 
> `Composer` effectively stopped re-rendering on every keystroke, and the actual typing box (`MessageInput`) — the thing that was lagging — now renders half as often per character, since it's no longer forced to re-render both from its own field subscription and again from its parent's needless cascade.
> 
> One thing left unfixed on purpose: `SendButton` still re-renders on nearly every keystroke (`useFormState({ control })` for `isValid`) with no visible change most of the time. That's react-hook-form recomputing validity per keystroke because `mode: 'onChange'` validates on every change — it's tied to real behavior (the Send button's disabled state), not a subscription mistake, so fixing it would mean changing when validation runs. I left it as-is per your ask not to change what the page shows/does.

## What it changed

```
diff -ruN a/src/components/Composer/index.tsx b/src/components/Composer/index.tsx
--- a/src/components/Composer/index.tsx
+++ b/src/components/Composer/index.tsx
@@ -1,4 +1,4 @@
-import { memo, type ReactNode } from 'react';
+import { memo, useEffect, useRef, type ReactNode, type RefObject } from 'react';
 import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
 import { presenceStore, useChatStore } from '../../store/chat';
 import { draftStore } from '../../store/draft';
@@ -81,23 +81,36 @@
   );
 };
 
+// Keeps the form's own data-filled attribute in sync without subscribing Composer itself to every
+// keystroke: watch() during render would re-render the whole composer tree on each field change.
+const FilledAttribute = ({ control, formRef }: { control: FormControl; formRef: RefObject<HTMLFormElement> }) => {
+  const values = useWatch({ control });
+  const filled = Object.values(values).filter(Boolean).length;
+  useEffect(() => {
+    formRef.current?.setAttribute('data-filled', String(filled));
+  }, [filled, formRef]);
+  return null;
+};
+
 export const Composer = () => {
-  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({
+  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
     mode: 'onChange',
     defaultValues: { text: '', replyTo: '', remindIn: '' },
   });
-  const filled = Object.values(watch()).filter(Boolean).length;
+  const formRef = useRef<HTMLFormElement>(null);
   return (
     <form
+      ref={formRef}
       className="composer"
       data-testid="composer"
-      data-filled={filled}
+      data-filled={0}
       onSubmit={handleSubmit((values) => {
         useChatStore.getState().send(values.text);
         draftStore.setState({ hasDraft: false });
         reset();
       })}
     >
+      <FilledAttribute control={control} formRef={formRef} />
       <div className="row">
         <MessageInput control={control} trigger={() => trigger()} />
         <SendButton control={control} />
```

## The steps

**agent:** This is exactly what the react-perf-recorder skill is for — I'll use it to analyze the recording and find the re-render cause.

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

A dev-only Vite plugin that records React re-renders from the page. Re … [3952 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-001748-app-panel-4d38
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
{"id":"20260928-001748-app-panel-4d38"}
```

**←**
```
{"id":"20260928-001748-app-panel-4d38","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-001748-app-panel-4d38","summary":{"id":"20260928-001748-app-panel-4d38","status":"done","createdAt":"2026-09-28T00:17:49.968Z","source":"panel","url":"http://localhost:34425/?tick=150","viewport":"1280×720","durationSec":1.5,"scope":null,"totals":{"commits":59,"commitsPerSec":38.41,"commitsInScope":59,"renders":173,"rendersPerScopeCommit":2.9,"rendersFromOutside":0,"rendersWithoutDom":89,"domTextChanges":26,"rendersPerTextChange":6.7},"topRoots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","hits":15,"hitsPerSec":9.77,"instances":1,"perHit":7,"noDomChange":0,"ownDomUnchanged":14,"renderMsPerHit":0.61,"reasons":["15× state #2 · [react-hook-form] useForm › State @ src/components/Composer/index.tsx:85 const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({"],"causes":["15× zustand:draftStore.setState","15× core:input input"],"lanes":"Sync:15"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","path":"Composer < ChatView < SettingsBySync < Layout","hits":30,"hitsPerSec":19.53,"instances":1,"perHit":1,"noDomChange":30,"renderMsPerHit":0.14,"reasons":["30× state #12 (15 of them same content) · [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:16 const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length >  … [6948 more]
```

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
5	import { useFieldError } from './useFieldError';
6	
7	export interface ComposerValues {
8	  text: string;
9	  replyTo: string;
10	  remindIn: string;
11	}
12	
13	type FormControl = Control<ComposerValues>;
14	
15	export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
16	  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
17	  return (
18	    <label className="field grow">
19	      <input
20	        {...field}
21	        data-testid="message"
22	        placeholder="Write a message"
23	        onChange={(e) => {
24	          field.onChange(e);
25	          draftStore.setState({ hasDraft: e.target.value.length > 0 });
26	          // The other fields are validated against the text.
27	          void trigger();
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
38	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') { … [2620 more]
```

**→ Grep**
```
{"pattern":"data-filled|filled","path":"src","-n":true}
```

**←**
```
Found 1 file
src/components/Composer/index.tsx
```

**→ Grep**
```
{"pattern":"data-filled|composer","path":".","-n":true,"-i":true}
```

**←**
```
Found 3 files
src/components/Composer/index.tsx
src/app.css
src/components/ChatView.tsx
```

**→ Grep**
```
{"pattern":"filled","path":"src/app.css","-n":true,"-C":2}
```

**←**
```
No files found
```

**→ Grep**
```
{"pattern":"composer|Composer","path":"src/components/ChatView.tsx","-n":true,"-C":2}
```

**←**
```
Found 1 file
src/components/ChatView.tsx
```

**→ Grep**
```
{"pattern":"composer","path":"src/app.css","-n":true,"-i":true,"-C":2}
```

**←**
```
Found 1 file
src/app.css
```

**→ Grep**
```
{"pattern":"Composer","path":"src/components/ChatView.tsx","-n":true}
```

**←**
```
Found 1 file
src/components/ChatView.tsx
```

**→ Grep**
```
{"pattern":"composer|Composer","path":"src/app.css","output_mode":"content","-n":true}
```

**←**
```
91:.composer {
217:/* Composer */
218:.composer {
223:.composer .row {
229:.composer .row.meta {
291:.composer button[type='submit'],
301:.composer button[type='submit']:disabled,
```

**→ Grep**
```
{"pattern":"Composer","path":"src/components/ChatView.tsx","output_mode":"content","-n":true}
```

**←**
```
7:import { Composer } from './Composer';
26:        <Composer />
```

**→ Grep**
```
{"pattern":"data-filled","path":".","-n":true,"output_mode":"content"}
```

**←**
```
src/components/Composer/index.tsx:94:      data-filled={filled}
```

**agent:** Found it. `Composer` (src/components/Composer/index.tsx:85-89) calls react-hook-form's `watch()` directly during render with no field name — this subscribes the whole `Composer` component to every keystroke in the form, just to compute a `data-filled` count. The recording shows `Composer` re-rendering 15 times while typing "see you at five" (once per keystroke), with `ownDomUnchanged: 14` — 14 of those 15 renders produce no change to what `Composer` itself puts on the page (the `filled` count only flips when a field goes from empty ↔ non-empty).

Let me check the dev-url and confirm the baseline reproduction, then fix it by moving the `watch` subscription into a leaf component that doesn't re-render the rest of the composer tree.

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:34425/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ rpr:record_page**
```
{"replay":"20260928-001748-app-panel-4d38","label":"before"}
```

**←**
```
{"id":"20260928-001934-app-record-db53","url":"http://localhost:34425/?tick=150&rpr=rec","requested":"http://localhost:34425/?tick=150","durationSec":2.3,"commits":65,"renders":187,"rendersWithoutDom":96,"rendersPerCommit":2.9,"topRoot":"Composer ×16","wasting":[{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","hits":30,"instances":1,"noDomChange":30},{"root":"Composer","source":"src/components/ChatView.tsx:26","hits":16,"instances":1,"noDomChange":1,"ownDomUnchanged":15},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","hits":15,"instances":1,"noDomChange":14}],"warnings":[]}
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/causes-and-actions.md"}
```

**←**
```
1	# Causes, actions, plugins, traps
2	
3	## Causes
4	
5	What scheduled each commit, aimed at the components it actually updated:
6	
7	| Cause                                 | Means                                                                            |
8	| ------------------------------------- | -------------------------------------------------------------------------------- |
9	| `zustand:<action>`                    | a store write, with the keys it changed and a `SAME-CONTENT` mark                |
10	| `redux:<action type>`                 | a Redux action that changed the store, with the slices it changed                |
11	| `react-query:fetch → success <key>`   | a query's events, one cause per query and commit, on its subscribers' commit     |
12	| `core:input <event>`                  | the person's click, keystroke, scroll                                            |
13	| `core:message WebSocket` / `Worker`   | a frame arrived                                                                  |
14	| `core:timer setInterval <fn> @ src/…` | a timer, with the place it was started                                           |
15	| `core:navigation push`                | a navigation                                                                     |
16	| `core:effect @ src/hooks/useX.ts`     | a setState from an effect                                                        |
17	| `core:update <fn> @ src/…`            | a plain call in the app's code; `(<package>)`  … [1888 more]
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/reading-a-recording.md"}
```

**←**
```
1	# Reading a recording
2	
3	In the order a diagnosis needs: who started the cascade, why it rendered, how it reached the component, and how much
4	of it was wasted. What scheduled the commit: `causes-and-actions.md`.
5	
6	## Roots
7	
8	A **cascade root** is a component that rendered while its parent did not — where a render started. `hits` is how
9	many commits it started, `cascade` the renders it pulled, `perHit` the renders per commit, `instances` how many
10	copies fired at once. `outsideRoots` are roots above the recorded area that reached into it.
11	
12	`noDomChange` (per root) and `rendersWithoutDom` (in totals) count renders after which the DOM did not change —
13	waste with no argument attached. `ownDomUnchanged`, when a root has it, counts its hits that changed none of the elements it
14	renders itself nor anything a child drew from a value the root passed it in props: what changed was in children that
15	render on their own anyway, so the root's own render was spent handing them what they had. `mounts` other than zero on a page that only changes text means remounting: a
16	component declared inside a render, or an unstable `key`.
17	
18	A `warnings` line starting `React warned:` is React's own dev warning, caught since the page loaded: a list without
19	keys, two children with one key, a component setting another's state while it renders, an update loop. It names the
20	component; ", before the recording" means React printed it at load and prints it once, so it ho … [3287 more]
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { memo, type ReactNode } from 'react';\nimport { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';","new_string":"import { memo, useEffect, useRef, type ReactNode } from 'react';\nimport { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({\n    mode: 'onChange',\n    defaultValues: { text: '', replyTo: '', remindIn: '' },\n  });\n  const filled = Object.values(watch()).filter(Boolean).length;\n  return (\n    <form\n      className=\"composer\"\n      data-testid=\"composer\"\n      data-filled={filled}\n      onSubmit={handleSubmit((values) => {\n        useChatStore.getState().send(values.text);\n … [2075 more]
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Read**
```
{"file_path":"src/components/Composer/index.tsx"}
```

**←**
```
1	import { memo, useEffect, useRef, type ReactNode } from 'react';
2	import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
3	import { presenceStore, useChatStore } from '../../store/chat';
4	import { draftStore } from '../../store/draft';
5	import { useFieldError } from './useFieldError';
6	
7	export interface ComposerValues {
8	  text: string;
9	  replyTo: string;
10	  remindIn: string;
11	}
12	
13	type FormControl = Control<ComposerValues>;
14	
15	export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
16	  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
17	  return (
18	    <label className="field grow">
19	      <input
20	        {...field}
21	        data-testid="message"
22	        placeholder="Write a message"
23	        onChange={(e) => {
24	          field.onChange(e);
25	          draftStore.setState({ hasDraft: e.target.value.length > 0 });
26	          // The other fields are validated against the text.
27	          void trigger();
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
38	function useMetaField(control: FormControl, name: 'reply … [3297 more]
```

**agent:** Looks correct. Now let's replay the same recording against the fixed code to measure after-numbers, then compare directly against the "before" baseline.

**→ rpr:record_page**
```
{"replay":"20260928-001748-app-panel-4d38","label":"after"}
```

**←**
```
{"id":"20260928-002049-app-record-3959","url":"http://localhost:34425/?tick=150&rpr=rec","requested":"http://localhost:34425/?tick=150","durationSec":2.3,"commits":50,"renders":113,"rendersWithoutDom":37,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×15","wasting":[{"root":"FilledAttribute","source":"src/components/Composer/index.tsx:113","hits":15,"instances":1,"noDomChange":15},{"root":"SendButton","source":"src/components/Composer/index.tsx:116","hits":15,"instances":1,"noDomChange":14}],"warnings":[]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-001934-app-record-db53","after":"20260928-002049-app-record-3959"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-001934-app-record-db53","durationMs":2305},"after":{"id":"20260928-002049-app-record-3959","durationMs":2288},"totals":{"commits":"65 → 50 (-23%)","renders":"187 → 113 (-40%)","commitsPerSec":"28.2 → 21.85 (-23%)","rendersPerSec":"81.13 → 49.39 (-39%)","rendersPerCommit":"2.9 → 2.3 (-21%)","rendersWithoutDomPerSec":"41.65 → 16.17 (-61%)","rendersPerTextChange":"6 → 3.6 (-40%)","longTaskMaxMs":"104 → 92 (-12%)"},"roots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"6.94 → 0.44 (-94%)","perHit":"7 → 7 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"48.16 → 3.06 (-94%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:121","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.56","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 13.11"},{"root":"FilledAttribute","source":"src/components/Composer/index.tsx:113","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.56","perHit":"– → 1","instances":"– → 1","cascadePerSec":"0 → 6.56"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:115","path":"Composer < ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"13.02 → 6.56 (-50%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"13.02 → 6.56 (-50%)"},{"root":"SendButton","source":"src/compo … [3654 more]
```

**agent:** I should double check the `React.RefObject` type reference — the file only imports named exports from `react`, not the `React` namespace, which could break type-checking.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { memo, useEffect, useRef, type ReactNode } from 'react';","new_string":"import { memo, useEffect, useRef, type ReactNode, type RefObject } from 'react';"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"const FilledAttribute = ({ control, formRef }: { control: FormControl; formRef: React.RefObject<HTMLFormElement> }) => {","new_string":"const FilledAttribute = ({ control, formRef }: { control: FormControl; formRef: RefObject<HTMLFormElement> }) => {"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Since the dev server has HMR, let me re-record after this touch-up to confirm the numbers still hold with the corrected types.

**→ rpr:record_page**
```
{"replay":"20260928-001748-app-panel-4d38","label":"after-fixed-types"}
```

**←**
```
{"id":"20260928-002120-app-record-1cc5","url":"http://localhost:34425/?tick=150&rpr=rec","requested":"http://localhost:34425/?tick=150","durationSec":2.2,"commits":50,"renders":113,"rendersWithoutDom":37,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×15","wasting":[{"root":"FilledAttribute","source":"src/components/Composer/index.tsx:113","hits":15,"instances":1,"noDomChange":15},{"root":"SendButton","source":"src/components/Composer/index.tsx:116","hits":15,"instances":1,"noDomChange":14}],"warnings":[]}
```

**agent:** Numbers match, and no warnings (no HMR full-refresh, no React dev warnings). The fix is confirmed and stable.

## What was found

`Composer` (`src/components/Composer/index.tsx`) called react-hook-form's `watch()` with no argument during render, just to compute a `data-filled` count:

```tsx
const filled = Object.values(watch()).filter(Boolean).length;
```

`watch()` called this way subscribes the *whole component* to every field change. So typing one character re-rendered all of `Composer` — and everything below it (`MessageInput`, `SendButton`, both `MetaInput`s, `ComposerHints`) — even though `data-filled` only actually changes value at the empty↔non-empty transition, not on every keystroke. The recording showed `Composer`'s own output unchanged in 15 of 16 hits (`ownDomUnchanged: 15`) — pure waste.

## Fix

Moved the `watch` subscription into a small leaf component (`FilledAttribute`) that renders nothing (`return null`) and imperatively sets the `data-filled` attribute on the form via a ref, instead of running inside `Composer` itself. `Composer` no longer subscribes to form state at all, so it stops re-rendering per keystroke. The page's DOM output is identical — same attribute, same values, updated at the same points.

## Before → after (same recorded scenario, replayed against both versions)

| Metric | Before | After | Change |
|---|---|---|---|
| Renders (typing "see you at five") | 187 | 113 | **-40%** |
| Commits | 65 | 50 | -23% |
| Renders without any DOM change /s | 41.65 | 16.17 | **-61%** |
| Renders per character typed | 10.1 | 5.1 | **-50%** |
| `Composer` re-renders /s | 6.94 | 0.44 | **-94%** |
| `MessageInput` re-renders /s | 13.02 | 6.56 | -50% (collateral: no longer double-rendered by its wasteful parent) |

`Composer` effectively stopped re-rendering on every keystroke, and the actual typing box (`MessageInput`) — the thing that was lagging — now renders half as often per character, since it's no longer forced to re-render both from its own field subscription and again from its parent's needless cascade.

One thing left unfixed on purpose: `SendButton` still re-renders on nearly every keystroke (`useFormState({ control })` for `isValid`) with no visible change most of the time. That's react-hook-form recomputing validity per keystroke because `mode: 'onChange'` validates on every change — it's tied to real behavior (the Send button's disabled state), not a subscription mistake, so fixing it would mean changing when validation runs. I left it as-is per your ask not to change what the page shows/does.
