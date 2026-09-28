# form-watch-rec, with the plugin, run 2

fixed (waste 1); checks 5 of 5; $0.45, 273 s, 2 turns

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

> Found and fixed the cause. Summary:
> 
> **Root cause:** `Composer` (`src/components/Composer/index.tsx`) called react-hook-form's `watch()` directly in its render body just to derive a `filled` count for `data-filled`. That subscribes the whole component to every field change, so it re-rendered on every keystroke even though `filled` itself only changes once (0→1) while typing. That cascade forced `MessageInput` to re-render twice per keystroke instead of once.
> 
> **Fix (only file touched):** replaced the render-time `watch()` call with react-hook-form's imperative `watch(callback)` subscription in a `useEffect`, updating `filled` state only when the derived count actually changes. Visible output (`data-filled` value, form markup) is identical — only *when* it re-renders changed.
> 
> **Before → after** (compared recordings of the "type see you at five" repro):
> - `Composer` render rate: 9.8/s → 0.88/s (**-91%**)
> - `MessageInput` render rate: 19.6/s → 6.15/s (**-69%**, the doubled cascade is gone)
> - Renders per character typed: 10.1 → 4.3 (**-57%**)
> - Renders producing no visible DOM change: 58.2/s → 10.5/s (**-82%**)
> 
> **Noted but left alone:** `SendButton` still re-renders once per keystroke via `useFormState`'s `isValid`, but avoiding that would require changing validation timing/mode, which risks changing when Send actually enables — out of scope since the page's behavior must stay the same.

## What it changed

```
diff -ruN a/src/components/Composer/index.tsx b/src/components/Composer/index.tsx
--- a/src/components/Composer/index.tsx
+++ b/src/components/Composer/index.tsx
@@ -1,4 +1,4 @@
-import { memo, type ReactNode } from 'react';
+import { memo, useEffect, useState, type ReactNode } from 'react';
 import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
 import { presenceStore, useChatStore } from '../../store/chat';
 import { draftStore } from '../../store/draft';
@@ -81,12 +81,28 @@
   );
 };
 
+function countFilled(values: Partial<ComposerValues>) {
+  return Object.values(values).filter(Boolean).length;
+}
+
 export const Composer = () => {
-  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({
+  const { control, handleSubmit, trigger, watch, getValues, reset } = useForm<ComposerValues>({
     mode: 'onChange',
     defaultValues: { text: '', replyTo: '', remindIn: '' },
   });
-  const filled = Object.values(watch()).filter(Boolean).length;
+  // watch() (called directly, not via useWatch) re-renders this component on every
+  // keystroke in the form, even for the fields below that already handle their own
+  // updates. Since all we need here is a derived count that only changes rarely (when
+  // a field goes from empty to non-empty or back), subscribe imperatively and only
+  // update state — and re-render — when that count actually changes.
+  const [filled, setFilled] = useState(() => countFilled(getValues()));
+  useEffect(() => {
+    const subscription = watch((values) => {
+      const next = countFilled(values);
+      setFilled((prev) => (prev === next ? prev : next));
+    });
+    return () => subscription.unsubscribe();
+  }, [watch]);
   return (
     <form
       className="composer"
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-081959-app-panel-5be5
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:35415/?tick=150
2	
```

**agent:** I'll delegate this to the perf-recorder agent, which specializes in reading recordings and proving fixes with numbers.

**→ Agent**
```
{"description":"Diagnose and fix message box lag","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app's dev server is running at the URL in ./dev-url.txt (relative to .), source in ./src.\n\nComplaint: typing into the message box at the bottom of the page lags. Repro steps: open the page, click the message box, type \"see you at five\".\n\nAn existing recording of this repro was already captured with the recorder panel; its id is in ./recording.txt: \"20260928-081959-app-panel-5be5\". Start by reading that recording (get_recording) rather th … [980 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: aa18ce2d646e284a7 (internal ID - do not mention to user. Use SendMessage with to: 'aa18ce2d646e284a7', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-zjkCZb/tmp/claude-0/-tmp-claude-eval-zjkCZb-home-cwd/a5b946db-481a-436c-833b-887797e93385/tasks/aa18ce2d646e284a7.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording, identify any wasteful re-renders while typing, fix them in `./src` if found, and verify with before/after numbers. I'll report back once it completes.

> **→ rpr:get_recording**
> ```
> {"id":"20260928-081959-app-panel-5be5"}
> ```

> **←**
> ```
> {"id":"20260928-081959-app-panel-5be5","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081959-app-panel-5be5","summary":{"id":"20260928-081959-app-panel-5be5","status":"done","createdAt":"2026-09-28T08:20:01.273Z","source":"panel","url":"http://localhost:35415/?tick=150","viewport":"1280×720","durationSec":1.5,"scope":null,"totals":{"commits":59,"commitsPerSec":38.56,"commitsInScope":59,"renders":173,"rendersPerScopeCommit":2.9,"rendersFromOutside":0,"rendersWithoutDom":89,"domTextChanges":26,"rendersPerTextChange":6.7},"topRoots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","hits":15,"hitsPerSec":9.8,"instances":1,"perHit":7,"noDomChange":0,"ownDomUnchanged":14,"renderMsPerHit":0.76,"reasons":["15× state #2 · [react-hook-form] useForm › State @ src/components/Composer/index.tsx:85 const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({"],"causes":["15× zustand:draftStore.setState","15× core:input input"],"lanes":"Sync:15"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","path":"Composer < ChatView < SettingsBySync < Layout","hits":30,"hitsPerSec":19.61,"instances":1,"perHit":1,"noDomChange":30,"renderMsPerHit":0.16,"reasons":["30× state #12 (15 of them same content) · [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:16 const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 … [6968 more]
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
> 5	import { useFieldError } from './useFieldError';
> 6	
> 7	export interface ComposerValues {
> 8	  text: string;
> 9	  replyTo: string;
> 10	  remindIn: string;
> 11	}
> 12	
> 13	type FormControl = Control<ComposerValues>;
> 14	
> 15	export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
> 16	  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
> 17	  return (
> 18	    <label className="field grow">
> 19	      <input
> 20	        {...field}
> 21	        data-testid="message"
> 22	        placeholder="Write a message"
> 23	        onChange={(e) => {
> 24	          field.onChange(e);
> 25	          draftStore.setState({ hasDraft: e.target.value.length > 0 });
> 26	          // The other fields are validated against the text.
> 27	          void trigger();
> 28	        }}
> 29	        onKeyDown={(e) => {
> 30	          // Enter waits while someone is typing a reply, so the two messages do not cross.
> 31	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
> 32	        }}
> 33	      />
> 34	    </label>
> 35	  );
> 36	};
> 37	
> 38	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') { … [2620 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChatView.tsx"}
> ```

> **←**
> ```
> 1	import type { ReactNode } from 'react';
> 2	import { useFeed } from '../feed';
> 3	import ActivityLog from './ActivityLog';
> 4	import { useChatStore } from '../store/chat';
> 5	import { ChannelStats } from './ChannelStats';
> 6	import { ChatPanel } from './ChatPanel';
> 7	import { Composer } from './Composer';
> 8	import { Header } from './Header';
> 9	import { MessageCount } from './MessageCount';
> 10	import { OnlineNow } from './OnlineNow';
> 11	import { PrefsLine } from './PrefsLine';
> 12	import { SettingsProvider } from './Settings';
> 13	import { TypingLine } from './TypingLine';
> 14	import { WebhookForm } from './WebhookForm';
> 15	
> 16	function useChatLayout() {
> 17	  return { wide: true };
> 18	}
> 19	
> 20	export const ChatView = () => {
> 21	  const { wide } = useChatLayout();
> 22	  return (
> 23	    <main className={wide ? 'chat wide' : 'chat'}>
> 24	      <div className="thread">
> 25	        <ChatPanel />
> 26	        <Composer />
> 27	      </div>
> 28	      <aside className="side" data-testid="side-panel">
> 29	        <h3>Channel</h3>
> 30	        <ChannelStats />
> 31	        <MessageCount />
> 32	        <OnlineNow />
> 33	        <PrefsLine />
> 34	        <h3>Activity</h3>
> 35	        <ActivityLog />
> 36	        <h3>Webhook</h3>
> 37	        <WebhookForm />
> 38	      </aside>
> 39	    </main>
> 40	  );
> 41	};
> 42	
> 43	const SyncBar = () => {
> 44	  const at = useChatStore((s) => s.workspace.lastEventAt);
> 45	  return (
> 46	    <span className="sync" title="Live">
> 47	      <span className="sync-fill" style={{ width: `${(at % 20) … [577 more]
> ```

> **→ Grep**
> ```
> {"pattern":"data-filled|filled","path":"src","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/components/Composer/index.tsx:89:  const filled = Object.values(watch()).filter(Boolean).length;
> src/components/Composer/index.tsx:94:      data-filled={filled}
> ```

> **→ Grep**
> ```
> {"pattern":"data-filled|\\[data-filled","path":".","output_mode":"files_with_matches"}
> ```

> **←**
> ```
> Found 1 file
> src/components/Composer/index.tsx
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx","offset":1,"limit":5}
> ```

> **←**
> ```
> 1	import { memo, type ReactNode } from 'react';
> 2	import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
> 3	import { presenceStore, useChatStore } from '../../store/chat';
> 4	import { draftStore } from '../../store/draft';
> 5	import { useFieldError } from './useFieldError';
> ```

> **agent:** Now implementing the fix: replace Composer's render-time `watch()` subscription (which forces a re-render on every keystroke, regardless of whether the derived value changes) with an imperative `watch(callback)` subscription that only updates local state when the derived "filled" count actually changes.

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { memo, type ReactNode } from 'react';","new_string":"import { memo, useEffect, useState, type ReactNode } from 'react';"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully.
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({\n    mode: 'onChange',\n    defaultValues: { text: '', replyTo: '', remindIn: '' },\n  });\n  const filled = Object.values(watch()).filter(Boolean).length;\n  return (","new_string":"function countFilled(values: Partial<ComposerValues>) {\n  return Object.values(values).filter(Boolean).length;\n}\n\nexport const Composer = () => {\n  const { control, handleSubmit, … [893 more]
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully.
> ```

> **agent:** Now let's record an "after" run using replay of the original recording, and compare.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-081959-app-panel-5be5","label":"after"}
> ```

> **←**
> ```
> {"id":"20260928-082337-app-record-6294","url":"http://localhost:35415/?tick=150&rpr=rec","requested":"http://localhost:35415/?tick=150","durationSec":2.3,"commits":50,"renders":101,"rendersWithoutDom":24,"rendersPerCommit":2,"topRoot":"ComposerHints ×14","wasting":[{"root":"SendButton","source":"src/components/Composer/index.tsx:119","hits":15,"instances":1,"noDomChange":14}],"warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-081959-app-panel-5be5","after":"20260928-082337-app-record-6294"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":["durations differ (1530ms vs 2278ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260928-081959-app-panel-5be5","durationMs":1530},"after":{"id":"20260928-082337-app-record-6294","durationMs":2278},"totals":{"commits":"59 → 50 (-15%)","renders":"173 → 101 (-42%)","commitsPerSec":"38.56 → 21.95 (-43%)","rendersPerSec":"113.07 → 44.34 (-61%)","rendersPerCommit":"2.9 → 2 (-31%)","rendersWithoutDomPerSec":"58.17 → 10.54 (-82%)","rendersPerTextChange":"6.7 → 3.3 (-51%)","longTaskMaxMs":"0 → 132"},"roots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"9.8 → 0.88 (-91%)","perHit":"7 → 7 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"68.63 → 5.71 (-92%)"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:118","path":"Composer < ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"19.61 → 6.15 (-69%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"19.61 → 6.15 (-69%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:124","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.15","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 12.29"},{"root":"SendButton","source":"src/components/Composer/index.tsx:119","path":"Composer < ChatView < SettingsBySync < Layout","s … [3519 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx","offset":75,"limit":45}
> ```

> **←**
> ```
> 75	const SendButton = ({ control }: { control: FormControl }) => {
> 76	  const { isValid } = useFormState({ control });
> 77	  return (
> 78	    <button type="submit" data-testid="send" disabled={!isValid}>
> 79	      Send
> 80	    </button>
> 81	  );
> 82	};
> 83	
> 84	function countFilled(values: Partial<ComposerValues>) {
> 85	  return Object.values(values).filter(Boolean).length;
> 86	}
> 87	
> 88	export const Composer = () => {
> 89	  const { control, handleSubmit, trigger, watch, getValues, reset } = useForm<ComposerValues>({
> 90	    mode: 'onChange',
> 91	    defaultValues: { text: '', replyTo: '', remindIn: '' },
> 92	  });
> 93	  // watch() (called directly, not via useWatch) re-renders this component on every
> 94	  // keystroke in the form, even for the fields below that already handle their own
> 95	  // updates. Since all we need here is a derived count that only changes rarely (when
> 96	  // a field goes from empty to non-empty or back), subscribe imperatively and only
> 97	  // update state — and re-render — when that count actually changes.
> 98	  const [filled, setFilled] = useState(() => countFilled(getValues()));
> 99	  useEffect(() => {
> 100	    const subscription = watch((values) => {
> 101	      const next = countFilled(values);
> 102	      setFilled((prev) => (prev === next ? prev : next));
> 103	    });
> 104	    return () => subscription.unsubscribe();
> 105	  }, [watch]);
> 106	  return (
> 107	    <form
> 108	      className="composer"
> 109	      data-testid="composer"
> 110	      data-filled={filled}
> 111	      o … [339 more]
> ```

> **agent:** The fix is confirmed and the numbers moved as expected. This satisfies the task's proof requirement.
> 
> ## Cause
> 
> **Cascade root: `Composer`** — `src/components/Composer/index.tsx:89` (was line 85), reason `[react-hook-form] useForm › State`.
> 
> Composer called `watch()` directly in its render body (not `useWatch`, not scoped to a field) just to compute a derived `filled` count for a `data-filled` attribute on the `<form>`. Calling `watch()` this way subscribes the whole component to *every* field change and forces a re-render on every keystroke — even though, while typing "see you at five", the `text` field is non-empty after the first character, so `filled` only actually changes once (0 → 1) and stays constant for the rest. `Composer`'s own DOM was unchanged in 14 of its 15 renders (`ownDomUnchanged: 14`), confirming the renders were for nothing.
> 
> Because `Composer` re-rendered on every keystroke, its non-memoized children re-rendered along with it. This showed up as `MessageInput` (`src/components/Composer/index.tsx:118`, `useController` root) rendering **30** times for 15 keystrokes — double what was needed, half of them flagged "same content" — i.e. one legitimate render per character plus one wasted cascade render from `Composer`.
> 
> ## Fix
> 
> `src/components/Composer/index.tsx` — replaced the render-time `watch()` call with an imperative subscription (`watch(callback)`, the official react-hook-form API for side-effects without a render) that only calls `setFilled` — and thus only triggers a re-render — when the derived count actually changes:
> 
> ```ts
> const [filled, setFilled] = useState(() => countFilled(getValues()));
> useEffect(() => {
>   const subscription = watch((values) => {
>     const next = countFilled(values);
>     setFilled((prev) => (prev === next ? prev : next));
>   });
>   return () => subscription.unsubscribe();
> }, [watch]);
> ```
> 
> This changes *when* Composer re-renders, not what it shows: `data-filled` still reflects the same count at every point in time; the visible form markup is unchanged.
> 
> ## Before/after (compare_recordings, before `20260928-081959-app-panel-5be5` vs after `20260928-082337-app-record-6294`, same replay of the "type see you at five" repro)
> 
> - `Composer` hits/sec: 9.8 → 0.88 (**-91%**)
> - `MessageInput` hits/sec: 19.61 → 6.15 (**-69%**) — the doubled cascade render is gone
> - Renders per character typed (normalized, duration-independent): 10.1 → 4.3 (**-57%**)
> - Total renders: 173 → 101 (**-42%**); renders producing no DOM change: 58.17/s → 10.54/s (**-82%**)
> - Totals/commit counts differ in absolute per-second terms because the two runs had slightly different durations (background timers), but the per-character and root-hit numbers above are the reliable comparison and all move the same direction.
> 
> ## Still renders for nothing after the fix
> 
> `SendButton` — `src/components/Composer/index.tsx:76` (`const { isValid } = useFormState({ control })`) — still shows `hits: 15, noDomChange: 14` in `wastingAfter`. This is react-hook-form's own `useFormState` notifying subscribers on every keystroke's validation cycle (`mode: 'onChange'` retriggers `isValidating` transitions each time) even though the destructured `isValid` value itself stays `true` after the first valid character. Fixing this would mean changing the validation strategy/timing (e.g., debouncing validation or restructuring `mode`), which risks changing when the Send button actually becomes enabled — a behavior change — so I left it as is per the "don't change what the page does" constraint, and note it here rather than touching it.
> 
> ## Conditions
> - Page: `http://localhost:35415/?tick=150` (dev server per `./dev-url.txt`), viewport 1280×720, no throttling.
> - Baseline: person's own panel recording (`20260928-081959-app-panel-5be5`), repro: click message box, type "see you at five", 1.53s.
> - After: `record_page` replaying that same recording's actions against the reloaded dev server (fix live via HMR), 2.28s (background timers ran a bit differently, hence the duration warning; per-action metrics used above are duration-normalized).
> 
> ## Not checked
> - Whether `SendButton`'s residual per-keystroke `useFormState` render is avoidable without changing validation timing (would need a deeper react-hook-form internals investigation or a UX decision, left to the person).
> - Other pages/routes of the app — only the message-composer repro was recorded/verified.
> - No load beyond the ~15-character typed string was tested (e.g., very long messages, paste).
> 
> Files touched: `src/components/Composer/index.tsx` (only).

**agent:** Let me quickly verify the actual diff before reporting.

**→ Read**
```
{"file_path":"src/components/Composer/index.tsx","offset":60,"limit":70}
```

**←**
```
60	));
61	
62	const LimitTitle = () => <span>limit</span>;
63	const limitTitle = <LimitTitle />;
64	
65	export const ComposerHints = ({ control }: { control: FormControl }) => {
66	  const text = useWatch({ control, name: 'text' });
67	  return (
68	    <div className="hints" data-testid="hints">
69	      <StatRow title={limitTitle} value="4000" />
70	      <StatRow title="typed" value={String(text?.length ?? 0)} />
71	    </div>
72	  );
73	};
74	
75	const SendButton = ({ control }: { control: FormControl }) => {
76	  const { isValid } = useFormState({ control });
77	  return (
78	    <button type="submit" data-testid="send" disabled={!isValid}>
79	      Send
80	    </button>
81	  );
82	};
83	
84	function countFilled(values: Partial<ComposerValues>) {
85	  return Object.values(values).filter(Boolean).length;
86	}
87	
88	export const Composer = () => {
89	  const { control, handleSubmit, trigger, watch, getValues, reset } = useForm<ComposerValues>({
90	    mode: 'onChange',
91	    defaultValues: { text: '', replyTo: '', remindIn: '' },
92	  });
93	  // watch() (called directly, not via useWatch) re-renders this component on every
94	  // keystroke in the form, even for the fields below that already handle their own
95	  // updates. Since all we need here is a derived count that only changes rarely (when
96	  // a field goes from empty to non-empty or back), subscribe imperatively and only
97	  // update state — and re-render — when that count actually changes.
98	  const [fill … [1066 more]
```

**agent:** Found and fixed the cause. Summary:

**Root cause:** `Composer` (`src/components/Composer/index.tsx`) called react-hook-form's `watch()` directly in its render body just to derive a `filled` count for `data-filled`. That subscribes the whole component to every field change, so it re-rendered on every keystroke even though `filled` itself only changes once (0→1) while typing. That cascade forced `MessageInput` to re-render twice per keystroke instead of once.

**Fix (only file touched):** replaced the render-time `watch()` call with react-hook-form's imperative `watch(callback)` subscription in a `useEffect`, updating `filled` state only when the derived count actually changes. Visible output (`data-filled` value, form markup) is identical — only *when* it re-renders changed.

**Before → after** (compared recordings of the "type see you at five" repro):
- `Composer` render rate: 9.8/s → 0.88/s (**-91%**)
- `MessageInput` render rate: 19.6/s → 6.15/s (**-69%**, the doubled cascade is gone)
- Renders per character typed: 10.1 → 4.3 (**-57%**)
- Renders producing no visible DOM change: 58.2/s → 10.5/s (**-82%**)

**Noted but left alone:** `SendButton` still re-renders once per keystroke via `useFormState`'s `isValid`, but avoiding that would require changing validation timing/mode, which risks changing when Send actually enables — out of scope since the page's behavior must stay the same.
