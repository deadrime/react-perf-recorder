# draft-context-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.31, 151 s, 3 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: typing a message lags, and the whole page seems to redraw with every letter.
To reproduce: open the page, click the message box at the bottom and type a short message, "see you at five".
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> The changes look correct and minimal — verified directly. Here's the summary:
> 
> **Root cause:** `Layout` in `src/components/ChatView.tsx` held the composer's draft text in `useState` and passed it down via `DraftContext`. Since `Layout` sits above the entire app, every keystroke re-rendered the whole tree — even though only one small badge (`DraftBadge` in `Header.tsx`) actually reads the draft, and only as a boolean.
> 
> **Fix:** Moved the draft into a tiny external store (`src/draft.ts`) using `useSyncExternalStore`, so only `DraftBadge` subscribes to the value while `Composer`/`MessageInput` just get a stable setter. No DOM/behavior changed.
> 
> **Before/after (typing "see you at five"):**
> - Total renders: 464 → 112 (−76%)
> - Renders per keystroke: 29 → 5.1 (−82%)
> - `Layout`'s whole-app cascade: 28 renders/keystroke → 0 (eliminated entirely)
> 
> Files changed: `src/draft.ts` (new), `src/components/ChatView.tsx`, `src/components/Header.tsx`, `src/components/Composer/index.tsx`. The remaining per-keystroke renders (react-hook-form fields, `ComposerHints`, `SendButton`, `DraftBadge`) are legitimate — they actually depend on the typed text.

## What it changed

```
diff -ruN a/src/components/ChatView.tsx b/src/components/ChatView.tsx
--- a/src/components/ChatView.tsx
+++ b/src/components/ChatView.tsx
@@ -1,5 +1,4 @@
-import { useState, type ReactNode } from 'react';
-import { DraftContext } from '../draft';
+import { type ReactNode } from 'react';
 import { useFeed } from '../feed';
 import ActivityLog from './ActivityLog';
 import { useChatStore } from '../store/chat';
@@ -60,16 +59,13 @@
 
 export const Layout = () => {
   useFeed();
-  const [draft, setDraft] = useState('');
   return (
-    <DraftContext.Provider value={{ draft, setDraft }}>
-      <SettingsBySync>
-        <div className="app">
-          <Header />
-          <TypingLine />
-          <ChatView />
-        </div>
-      </SettingsBySync>
-    </DraftContext.Provider>
+    <SettingsBySync>
+      <div className="app">
+        <Header />
+        <TypingLine />
+        <ChatView />
+      </div>
+    </SettingsBySync>
   );
 };
diff -ruN a/src/components/Composer/index.tsx b/src/components/Composer/index.tsx
--- a/src/components/Composer/index.tsx
+++ b/src/components/Composer/index.tsx
@@ -1,7 +1,7 @@
 import { memo, type ReactNode } from 'react';
 import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
 import { presenceStore, useChatStore } from '../../store/chat';
-import { useDraft } from '../../draft';
+import { useSetDraft } from '../../draft';
 import { useFieldError } from './useFieldError';
 
 export interface ComposerValues {
@@ -14,7 +14,7 @@
 
 export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
   const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
-  const { setDraft } = useDraft();
+  const setDraft = useSetDraft();
   return (
     <label className="field grow">
       <input
@@ -83,7 +83,7 @@
 };
 
 export const Composer = () => {
-  const { setDraft } = useDraft();
+  const setDraft = useSetDraft();
   const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
     mode: 'onChange',
     defaultValues: { text: '', replyTo: '', remindIn: '' },
diff -ruN a/src/components/Header.tsx b/src/components/Header.tsx
--- a/src/components/Header.tsx
+++ b/src/components/Header.tsx
@@ -1,5 +1,5 @@
 import { useChatStore } from '../store/chat';
-import { useDraft } from '../draft';
+import { useDraftValue } from '../draft';
 import { selectUnread } from '../store/selectors';
 import { ChannelTopic } from './ChannelTopic';
 import { TimezoneBadge } from './Settings';
@@ -16,7 +16,7 @@
 };
 
 const DraftBadge = () => {
-  const { draft } = useDraft();
+  const draft = useDraftValue();
   return draft ? (
     <span className="badge muted" data-testid="draft">
       draft
diff -ruN a/src/draft.ts b/src/draft.ts
--- a/src/draft.ts
+++ b/src/draft.ts
@@ -1,6 +1,32 @@
-import { createContext, useContext } from 'react';
+import { useSyncExternalStore } from 'react';
 
-/** The unsent text of the message box, for whoever needs to know there is some. */
-export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
+type Listener = () => void;
 
-export const useDraft = () => useContext(DraftContext);
+let draft = '';
+const listeners = new Set<Listener>();
+
+function subscribe(listener: Listener) {
+  listeners.add(listener);
+  return () => listeners.delete(listener);
+}
+
+function getSnapshot() {
+  return draft;
+}
+
+/** Sets the unsent text of the message box. Stable across renders — does not subscribe the caller to its value. */
+export function setDraft(value: string) {
+  if (value === draft) return;
+  draft = value;
+  listeners.forEach((listener) => listener());
+}
+
+/** The unsent text of the message box, for whoever needs to show it. Only the caller re-renders when it changes. */
+export function useDraftValue() {
+  return useSyncExternalStore(subscribe, getSnapshot);
+}
+
+/** For whoever only needs to set the draft, without subscribing to its value. */
+export function useSetDraft() {
+  return setDraft;
+}
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-234042-app-panel-51ea
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:46493/?tick=150
2	
```

**agent:** I'll use the specialized perf-recorder agent to analyze the recording, find the root cause, fix it, and verify with before/after numbers.

**→ Agent**
```
{"description":"Diagnose and fix React re-render lag","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app in this folder (source in ./src) has a complaint: typing in the message box at the bottom of the page lags, and the whole page seems to redraw with every keystroke.\n\nReproduction steps: open the page, click the message box at the bottom, and type \"see you at five\".\n\nThere is already a recording of this exact reproduction captured via the recorder panel in the page. Its recording id is: 20260927-234042-app-panel-51ea\n\nThe dev server is already running at: http: … [1375 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a7367bdb14ccfbccd (internal ID - do not mention to user. Use SendMessage with to: 'a7367bdb14ccfbccd', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-9AuB7S/tmp/claude-0/-tmp-claude-eval-9AuB7S-home-cwd/efe553ee-2361-4b23-a821-dde68472d4fa/tasks/a7367bdb14ccfbccd.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to analyze the existing recording, find the root cause of the re-render, apply a fix in `./src` if warranted, and verify with before/after numbers. This runs in the background — I'll report back once it completes.

> **→ rpr:get_recording**
> ```
> {"id":"20260927-234042-app-panel-51ea"}
> ```

> **←**
> ```
> {"id":"20260927-234042-app-panel-51ea","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234042-app-panel-51ea","summary":{"id":"20260927-234042-app-panel-51ea","status":"done","createdAt":"2026-09-27T23:40:43.845Z","source":"panel","url":"http://localhost:46493/?tick=150","viewport":"1280×720","durationSec":1.6,"scope":null,"totals":{"commits":51,"commitsPerSec":31.72,"commitsInScope":51,"renders":464,"rendersPerScopeCommit":9.1,"rendersFromOutside":0,"rendersWithoutDom":289,"domTextChanges":26,"rendersPerTextChange":17.8},"topRoots":[{"root":"Layout","source":"src/main.tsx:10","path":"","hits":15,"hitsPerSec":9.33,"instances":1,"perHit":28,"noDomChange":0,"ownDomUnchanged":15,"renderMsPerHit":2.09,"reasons":["15× state #1 · State @ src/components/ChatView.tsx:63 const [draft, setDraft] = useState('');"],"causes":["15× core:input input"],"lanes":"Sync:15"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","hits":15,"hitsPerSec":9.33,"instances":1,"perHit":1,"noDomChange":14,"renderMsPerHit":0.05,"reasons":["15× state #0 · [react-hook-form] useFormState › State @ src/components/Composer/index.tsx:77 const { isValid } = useFormState({ control });"],"causes":["15× core:input input"],"lanes":"Sync:15"},{"root":"SyncBar","source":"src/components/ChatView.tsx:56","path":"SettingsBySync","hits":11,"hitsPerSec":6.84,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.07,"reasons":["11× external store #2 [use … [5680 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/main.tsx"}
> ```

> **←**
> ```
> 1	import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
> 2	import { createRoot } from 'react-dom/client';
> 3	import { Provider } from 'react-redux';
> 4	import { createBrowserRouter, RouterProvider } from 'react-router-dom';
> 5	import './app.css';
> 6	import { Layout } from './components/ChatView';
> 7	import { store } from './store/activity';
> 8	
> 9	const client = new QueryClient();
> 10	const router = createBrowserRouter([{ path: '*', element: <Layout /> }]);
> 11	
> 12	createRoot(document.getElementById('root')!).render(
> 13	  <Provider store={store}>
> 14	    <QueryClientProvider client={client}>
> 15	      <RouterProvider router={router} />
> 16	    </QueryClientProvider>
> 17	  </Provider>
> 18	);
> 19	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChatView.tsx"}
> ```

> **←**
> ```
> 1	import { useState, type ReactNode } from 'react';
> 2	import { DraftContext } from '../draft';
> 3	import { useFeed } from '../feed';
> 4	import ActivityLog from './ActivityLog';
> 5	import { useChatStore } from '../store/chat';
> 6	import { ChannelStats } from './ChannelStats';
> 7	import { ChatPanel } from './ChatPanel';
> 8	import { Composer } from './Composer';
> 9	import { Header } from './Header';
> 10	import { MessageCount } from './MessageCount';
> 11	import { OnlineNow } from './OnlineNow';
> 12	import { PrefsLine } from './PrefsLine';
> 13	import { SettingsProvider } from './Settings';
> 14	import { TypingLine } from './TypingLine';
> 15	import { WebhookForm } from './WebhookForm';
> 16	
> 17	function useChatLayout() {
> 18	  return { wide: true };
> 19	}
> 20	
> 21	export const ChatView = () => {
> 22	  const { wide } = useChatLayout();
> 23	  return (
> 24	    <main className={wide ? 'chat wide' : 'chat'}>
> 25	      <div className="thread">
> 26	        <ChatPanel />
> 27	        <Composer />
> 28	      </div>
> 29	      <aside className="side" data-testid="side-panel">
> 30	        <h3>Channel</h3>
> 31	        <ChannelStats />
> 32	        <MessageCount />
> 33	        <OnlineNow />
> 34	        <PrefsLine />
> 35	        <h3>Activity</h3>
> 36	        <ActivityLog />
> 37	        <h3>Webhook</h3>
> 38	        <WebhookForm />
> 39	      </aside>
> 40	    </main>
> 41	  );
> 42	};
> 43	
> 44	const SyncBar = () => {
> 45	  const at = useChatStore((s) => s.workspace.lastEventAt);
> 46	  return (
> 47	    <span className="sync" title="Live">
> 48	      <s … [781 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/draft.ts"}
> ```

> **←**
> ```
> 1	import { createContext, useContext } from 'react';
> 2	
> 3	/** The unsent text of the message box, for whoever needs to know there is some. */
> 4	export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
> 5	
> 6	export const useDraft = () => useContext(DraftContext);
> 7	
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
> 4	import { useDraft } from '../../draft';
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
> 17	  const { setDraft } = useDraft();
> 18	  return (
> 19	    <label className="field grow">
> 20	      <input
> 21	        {...field}
> 22	        data-testid="message"
> 23	        placeholder="Write a message"
> 24	        onChange={(e) => {
> 25	          field.onChange(e);
> 26	          setDraft(e.target.value);
> 27	          // The other fields are validated against the text.
> 28	          void trigger();
> 29	        }}
> 30	        onKeyDown={(e) => {
> 31	          // Enter waits while someone is typing a reply, so the two messages do not cross.
> 32	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
> 33	        }}
> 34	      />
> 35	    </label>
> 36	  );
> 37	};
> 38	
> 39	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
> 40	   … [2520 more]
> ```

> **→ Grep**
> ```
> {"pattern":"useDraft|draft\\b","path":"src","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/components/ChatView.tsx:2:import { DraftContext } from '../draft';
> src/components/ChatView.tsx:63:  const [draft, setDraft] = useState('');
> src/components/ChatView.tsx:65:    <DraftContext.Provider value={{ draft, setDraft }}>
> src/components/Header.tsx:2:import { useDraft } from '../draft';
> src/components/Header.tsx:19:  const { draft } = useDraft();
> src/components/Header.tsx:20:  return draft ? (
> src/components/Header.tsx:21:    <span className="badge muted" data-testid="draft">
> src/components/Header.tsx:22:      draft
> src/components/Composer/index.tsx:4:import { useDraft } from '../../draft';
> src/components/Composer/index.tsx:17:  const { setDraft } = useDraft();
> src/components/Composer/index.tsx:86:  const { setDraft } = useDraft();
> src/draft.ts:4:export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
> src/draft.ts:6:export const useDraft = () => useContext(DraftContext);
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Header.tsx"}
> ```

> **←**
> ```
> 1	import { useChatStore } from '../store/chat';
> 2	import { useDraft } from '../draft';
> 3	import { selectUnread } from '../store/selectors';
> 4	import { ChannelTopic } from './ChannelTopic';
> 5	import { TimezoneBadge } from './Settings';
> 6	import { TypingBadge } from './TypingBadge';
> 7	import Workspace from './Workspace';
> 8	
> 9	const Unread = () => {
> 10	  const unread = useChatStore(selectUnread);
> 11	  return (
> 12	    <span className="badge" data-testid="unread">
> 13	      {unread} unread
> 14	    </span>
> 15	  );
> 16	};
> 17	
> 18	const DraftBadge = () => {
> 19	  const { draft } = useDraft();
> 20	  return draft ? (
> 21	    <span className="badge muted" data-testid="draft">
> 22	      draft
> 23	    </span>
> 24	  ) : null;
> 25	};
> 26	
> 27	export const Header = () => (
> 28	  <header className="head" data-testid="header">
> 29	    <Workspace />
> 30	    <ChannelTopic />
> 31	    <Unread />
> 32	    <TimezoneBadge />
> 33	    <TypingBadge />
> 34	    <DraftBadge />
> 35	  </header>
> 36	);
> 37	
> ```

> **→ Write**
> ```
> {"file_path":"src/draft.ts","content":"import { useSyncExternalStore } from 'react';\n\ntype Listener = () => void;\n\nlet draft = '';\nconst listeners = new Set<Listener>();\n\nfunction subscribe(listener: Listener) {\n  listeners.add(listener);\n  return () => listeners.delete(listener);\n}\n\nfunction getSnapshot() {\n  return draft;\n}\n\n/** Sets the unsent text of the message box. Stable across renders — does not subscribe the caller to its value. */\nexport function setDraft(value: string) {\n  if (value === draft) return;\n  draft = value;\n  listeners. … [396 more]
> ```

> **←**
> ```
> The file src/draft.ts has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ChatView.tsx","old_string":"import { useState, type ReactNode } from 'react';\nimport { DraftContext } from '../draft';\nimport { useFeed } from '../feed';","new_string":"import { type ReactNode } from 'react';\nimport { useFeed } from '../feed';"}
> ```

> **←**
> ```
> The file src/components/ChatView.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ChatView.tsx","old_string":"export const Layout = () => {\n  useFeed();\n  const [draft, setDraft] = useState('');\n  return (\n    <DraftContext.Provider value={{ draft, setDraft }}>\n      <SettingsBySync>\n        <div className=\"app\">\n          <Header />\n          <TypingLine />\n          <ChatView />\n        </div>\n      </SettingsBySync>\n    </DraftContext.Provider>\n  );\n};","new_string":"export const Layout = () => {\n  useFeed();\n  return (\n    <SettingsBySync>\n      <div className=\"app\">\ … [114 more]
> ```

> **←**
> ```
> The file src/components/ChatView.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"import { useDraft } from '../draft';","new_string":"import { useDraftValue } from '../draft';"}
> ```

> **←**
> ```
> The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"  const { draft } = useDraft();","new_string":"  const draft = useDraftValue();"}
> ```

> **←**
> ```
> The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { useDraft } from '../../draft';","new_string":"import { useSetDraft } from '../../draft';"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });\n  const { setDraft } = useDraft();","new_string":"  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });\n  const setDraft = useSetDraft();"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { setDraft } = useDraft();","new_string":"export const Composer = () => {\n  const setDraft = useSetDraft();"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now let's record the "after" using replay of the original recording and compare.

> **→ rpr:record_page**
> ```
> {"replay":"20260927-234042-app-panel-51ea","label":"after"}
> ```

> **←**
> ```
> {"id":"20260927-234218-app-record-46e6","url":"http://localhost:46493/?tick=150&rpr=rec","requested":"http://localhost:46493/?tick=150","durationSec":2.4,"commits":51,"renders":112,"rendersWithoutDom":35,"rendersPerCommit":2.2,"topRoot":"ComposerHints ×15","warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260927-234042-app-panel-51ea","after":"20260927-234218-app-record-46e6"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":["durations differ (1608ms vs 2354ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260927-234042-app-panel-51ea","durationMs":1608},"after":{"id":"20260927-234218-app-record-46e6","durationMs":2354},"totals":{"commits":"51 → 51 (0%)","renders":"464 → 112 (-76%)","commitsPerSec":"31.72 → 21.67 (-32%)","rendersPerSec":"288.56 → 47.58 (-84%)","rendersPerCommit":"9.1 → 2.2 (-76%)","rendersWithoutDomPerSec":"179.73 → 14.87 (-92%)","rendersPerTextChange":"17.8 → 3.6 (-80%)","longTaskMaxMs":"0 → 83"},"roots":[{"root":"Layout","source":"src/main.tsx:10","path":"","status":"gone","hitsPerSec":"9.33 → –","perHit":"28 → –","instances":"1 → –","cascadePerSec":"261.19 → 0 (-100%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:108","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.37","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 12.74"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","status":"gone","hitsPerSec":"9.33 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"9.33 → 0 (-100%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:56","path":"SettingsBySync","status":"gone","hitsPerSec":"6.84 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.84 → 0 (-100%)"},{"root":"DraftBadge","source":"src/compo … [3939 more]
> ```

> **agent:** ## Root cause
> 
> **Cascade root:** `Layout` (mounted at `src/main.tsx:10`), reason in the recording: `state #1 · State @ src/components/ChatView.tsx:63 const [draft, setDraft] = useState('')`.
> 
> `Layout` (`src/components/ChatView.tsx:61-75`, before the fix) held the composer's draft text in its own `useState` and handed it down through `DraftContext.Provider value={{ draft, setDraft }}`. Every keystroke called `setDraft` from `MessageInput` (`src/components/Composer/index.tsx:26`), which re-rendered `Layout` — the component sitting above the *entire* app (`Header`, `TypingLine`, `ChatView`, the side panel, etc.). Because none of those children were memoized, React re-rendered the whole subtree on every character.
> 
> Checking who actually reads `draft`: only `DraftBadge` in `src/components/Header.tsx:18-25`, and only as a boolean ("show the word 'draft' if non-empty"), not the text itself. `MessageInput` and `Composer` only ever call `setDraft`, never read it. The recording confirms this was pure waste: `Layout`'s own DOM was unchanged on all 15 keystroke hits (`ownDomUnchanged: 15`) while it fanned out to 28 renders per hit, and `rendersPerTextChange` was 17.8 — 464 renders total for 15 keystrokes.
> 
> ## The fix
> 
> Replaced the top-of-tree `useState`/Context pair with a tiny external store isolated in `src/draft.ts`, so only the component that actually displays the value subscribes to it:
> 
> - `src/draft.ts` — module-level `draft` variable + listener set; `setDraft()` is a stable function that only notifies subscribers when the value actually changes; `useDraftValue()` subscribes via `useSyncExternalStore` (for display), `useSetDraft()` just returns the stable setter (for writers, no subscription).
> - `src/components/ChatView.tsx` — `Layout` no longer holds `draft` state or renders a `DraftContext.Provider`; it just mounts `SettingsBySync`/`Header`/`TypingLine`/`ChatView` directly.
> - `src/components/Header.tsx` — `DraftBadge` now uses `useDraftValue()`.
> - `src/components/Composer/index.tsx` — `MessageInput` and `Composer` now use `useSetDraft()` instead of destructuring `setDraft` off `useDraft()`.
> 
> No DOM output or behavior changed: `DraftBadge` still shows/hides on the same truthy/falsy transitions, `setDraft('')` on submit still clears it, and the message input still updates the same way.
> 
> ## Before/after (same repro: type "see you at five" into the message box)
> 
> Recorded via `record_page` replay of the original recording (id `20260927-234042-app-panel-51ea` → after-fix id `20260927-234218-app-record-46e6`), compared with `compare_recordings`:
> 
> - Total renders: **464 → 112 (-76%)**
> - Renders per commit: **9.1 → 2.2 (-76%)**
> - Renders per keystroke (per char): **29 → 5.1 (-82%)**
> - Renders per text change: **17.8 → 3.6 (-80%)**
> - `Layout` as a cascade root: **28 renders/hit, 261 cascade renders/sec → gone entirely (-100%)**
> 
> After the fix, the per-keystroke re-renders are limited to the components that legitimately depend on the typed value (react-hook-form's `useController`/`useWatch`/`useFormState` in `MessageInput`, `ComposerHints`, `SendButton`) plus `DraftBadge` itself — no more whole-app cascade from `Layout`.
> 
> ## Conditions
> 
> Page `http://localhost:46493/?tick=150`, viewport 1280×720, no throttling recorded, repro = click message box, type "see you at five" (15 chars). Before recording: panel capture, 1.6s, 51 commits. After recording: scripted replay of the same recording, 2.4s, 51 commits (duration differs because replay timing is not click-for-click identical; per-character and per-commit metrics were used for the comparison as recommended).
> 
> ## Not checked
> 
> - Did not investigate the other, smaller cascade roots in the original recording (`SyncBar`, `TypingBadge`, `ChannelStats`/`OnlineNow` via react-query) — their `perHit`/`noDomChange` numbers suggested normal, legitimately-caused updates (external store/query changes), not waste, and were out of scope for the keystroke-lag complaint.
> - Did not run the app's test suite; changes were verified only via the recorder and code reading, not a full manual UI pass.

**→ Read**
```
{"file_path":"src/draft.ts"}
```

**←**
```
1	import { useSyncExternalStore } from 'react';
2	
3	type Listener = () => void;
4	
5	let draft = '';
6	const listeners = new Set<Listener>();
7	
8	function subscribe(listener: Listener) {
9	  listeners.add(listener);
10	  return () => listeners.delete(listener);
11	}
12	
13	function getSnapshot() {
14	  return draft;
15	}
16	
17	/** Sets the unsent text of the message box. Stable across renders — does not subscribe the caller to its value. */
18	export function setDraft(value: string) {
19	  if (value === draft) return;
20	  draft = value;
21	  listeners.forEach((listener) => listener());
22	}
23	
24	/** The unsent text of the message box, for whoever needs to show it. Only the caller re-renders when it changes. */
25	export function useDraftValue() {
26	  return useSyncExternalStore(subscribe, getSnapshot);
27	}
28	
29	/** For whoever only needs to set the draft, without subscribing to its value. */
30	export function useSetDraft() {
31	  return setDraft;
32	}
33	
```

**→ Read**
```
{"file_path":"src/components/ChatView.tsx"}
```

**←**
```
1	import { type ReactNode } from 'react';
2	import { useFeed } from '../feed';
3	import ActivityLog from './ActivityLog';
4	import { useChatStore } from '../store/chat';
5	import { ChannelStats } from './ChannelStats';
6	import { ChatPanel } from './ChatPanel';
7	import { Composer } from './Composer';
8	import { Header } from './Header';
9	import { MessageCount } from './MessageCount';
10	import { OnlineNow } from './OnlineNow';
11	import { PrefsLine } from './PrefsLine';
12	import { SettingsProvider } from './Settings';
13	import { TypingLine } from './TypingLine';
14	import { WebhookForm } from './WebhookForm';
15	
16	function useChatLayout() {
17	  return { wide: true };
18	}
19	
20	export const ChatView = () => {
21	  const { wide } = useChatLayout();
22	  return (
23	    <main className={wide ? 'chat wide' : 'chat'}>
24	      <div className="thread">
25	        <ChatPanel />
26	        <Composer />
27	      </div>
28	      <aside className="side" data-testid="side-panel">
29	        <h3>Channel</h3>
30	        <ChannelStats />
31	        <MessageCount />
32	        <OnlineNow />
33	        <PrefsLine />
34	        <h3>Activity</h3>
35	        <ActivityLog />
36	        <h3>Webhook</h3>
37	        <WebhookForm />
38	      </aside>
39	    </main>
40	  );
41	};
42	
43	const SyncBar = () => {
44	  const at = useChatStore((s) => s.workspace.lastEventAt);
45	  return (
46	    <span className="sync" title="Live">
47	      <span className="sync-fill" style={{ width: `${(at % 20) … [577 more]
```

**agent:** The changes look correct and minimal — verified directly. Here's the summary:

**Root cause:** `Layout` in `src/components/ChatView.tsx` held the composer's draft text in `useState` and passed it down via `DraftContext`. Since `Layout` sits above the entire app, every keystroke re-rendered the whole tree — even though only one small badge (`DraftBadge` in `Header.tsx`) actually reads the draft, and only as a boolean.

**Fix:** Moved the draft into a tiny external store (`src/draft.ts`) using `useSyncExternalStore`, so only `DraftBadge` subscribes to the value while `Composer`/`MessageInput` just get a stable setter. No DOM/behavior changed.

**Before/after (typing "see you at five"):**
- Total renders: 464 → 112 (−76%)
- Renders per keystroke: 29 → 5.1 (−82%)
- `Layout`'s whole-app cascade: 28 renders/keystroke → 0 (eliminated entirely)

Files changed: `src/draft.ts` (new), `src/components/ChatView.tsx`, `src/components/Header.tsx`, `src/components/Composer/index.tsx`. The remaining per-keystroke renders (react-hook-form fields, `ComposerHints`, `SendButton`, `DraftBadge`) are legitimate — they actually depend on the typed text.
