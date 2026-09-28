# draft-context-rec, with the plugin, run 1

fixed (waste 0); checks 5 of 5; $0.48, 224 s, 5 turns

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

> The fix is sound and matches its report — `useDraftSetter`/`useDraftValue` are used consistently in `Composer/index.tsx` and `Header.tsx`, and `Layout` in `ChatView.tsx` no longer owns the draft state directly.
> 
> **Root cause:** typing updated `draft` state that lived directly in `Layout` (`ChatView.tsx`), the top-level component wrapping the entire page. Every keystroke re-rendered `Layout` and its whole subtree — header, chat panel, sidebar stats, everything — none of it memoized. A second issue compounded it: the context value was a fresh `{draft, setDraft}` object each render, so even components that only needed the stable setter (like `Composer`) re-rendered on every character.
> 
> **Fix (in `./src` only):**
> - `src/components/ChatView.tsx` — moved the draft state out of `Layout` into a new inner `DraftProvider` component, so a keystroke only re-renders that provider and its consumers, not the whole page.
> - `src/draft.ts` — split the single context into `DraftValueContext` (the text) and `DraftSetterContext` (the stable setter function), with `useDraftValue()`/`useDraftSetter()` hooks.
> - `src/components/Header.tsx` and `src/components/Composer/index.tsx` — updated to use the specific hook they actually need, so `Composer` (which only clears the draft on submit) stops re-rendering per keystroke.
> 
> No UI, props, or behavior changed — only which component owns the state and which context each consumer subscribes to.
> 
> **Before/after (via the recording tool, same "type 'see you at five'" replay):**
> - Total renders: 464 → 156 (**-66%**)
> - Renders per typed character: 29 → 8.1 (**-72%**)
> - `Layout`'s page-wide cascade (was 271.84 renders/sec): gone
> - `Composer` no longer fires on typing at all (was every keystroke → 0.44/s)
> 
> **Residual, minor, not worth fixing:** `DraftProvider` itself re-renders each keystroke (unavoidable — it owns the state) and `DraftBadge` re-renders each keystroke but only changes DOM 1/15 times (would need extra machinery like a boolean-selector context to eliminate, for a one-line badge). `SendButton`'s per-keystroke `isValid` recompute is `react-hook-form`'s own behavior, pre-existing and unrelated to this bug.
> 
> One caveat from the agent: it verified this via the recorder and code review but did not manually click through the running app to eyeball the draft badge/send button/submit-reset — worth a quick manual smoke test if you want extra confidence before treating this as fully done.

## What it changed

```
diff -ruN a/src/components/ChatView.tsx b/src/components/ChatView.tsx
--- a/src/components/ChatView.tsx
+++ b/src/components/ChatView.tsx
@@ -1,5 +1,5 @@
 import { useState, type ReactNode } from 'react';
-import { DraftContext } from '../draft';
+import { DraftSetterContext, DraftValueContext } from '../draft';
 import { useFeed } from '../feed';
 import ActivityLog from './ActivityLog';
 import { useChatStore } from '../store/chat';
@@ -58,11 +58,24 @@
   </SettingsProvider>
 );
 
+/**
+ * Holds the draft text on its own so that typing (which updates this state on every
+ * keystroke) only re-renders this provider and the components that actually read the
+ * context value, instead of re-rendering the whole page held by Layout.
+ */
+const DraftProvider = ({ children }: { children: ReactNode }) => {
+  const [draft, setDraft] = useState('');
+  return (
+    <DraftSetterContext.Provider value={setDraft}>
+      <DraftValueContext.Provider value={draft}>{children}</DraftValueContext.Provider>
+    </DraftSetterContext.Provider>
+  );
+};
+
 export const Layout = () => {
   useFeed();
-  const [draft, setDraft] = useState('');
   return (
-    <DraftContext.Provider value={{ draft, setDraft }}>
+    <DraftProvider>
       <SettingsBySync>
         <div className="app">
           <Header />
@@ -70,6 +83,6 @@
           <ChatView />
         </div>
       </SettingsBySync>
-    </DraftContext.Provider>
+    </DraftProvider>
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
+import { useDraftSetter } from '../../draft';
 import { useFieldError } from './useFieldError';
 
 export interface ComposerValues {
@@ -14,7 +14,7 @@
 
 export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
   const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
-  const { setDraft } = useDraft();
+  const setDraft = useDraftSetter();
   return (
     <label className="field grow">
       <input
@@ -83,7 +83,7 @@
 };
 
 export const Composer = () => {
-  const { setDraft } = useDraft();
+  const setDraft = useDraftSetter();
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
@@ -1,6 +1,11 @@
 import { createContext, useContext } from 'react';
 
-/** The unsent text of the message box, for whoever needs to know there is some. */
-export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
+/** The unsent text of the message box, for whoever needs to know there is some.
+ *  Split into two contexts so a component that only needs to *set* the draft
+ *  (e.g. to clear it on send) doesn't re-render on every keystroke just because
+ *  the current text changed. */
+export const DraftValueContext = createContext('');
+export const DraftSetterContext = createContext((_draft: string) => {});
 
-export const useDraft = () => useContext(DraftContext);
+export const useDraftValue = () => useContext(DraftValueContext);
+export const useDraftSetter = () => useContext(DraftSetterContext);
```

## The steps

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-074841-app-panel-798a
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:37063/?tick=150
2	
```

**→ Agent**
```
{"description":"Diagnose and fix unnecessary re-renders","subagent_type":"react-perf-recorder:perf-recorder","prompt":"A React app lives in ./src of the current working directory (.). Its dev server is running at http://localhost:37063/?tick=150 and hot-reloads on source changes.\n\nUser complaint: typing in the message box at the bottom of the page lags, and the whole page appears to redraw with every keystroke.\n\nRepro steps: open the page, click the message box at the bottom, type \"see you at five\".\n\nThere is already an existing recording of this repro, i … [1365 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: ab8bdb632c45505cb (internal ID - do not mention to user. Use SendMessage with to: 'ab8bdb632c45505cb', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-gV0mwI/tmp/claude-0/-tmp-claude-eval-gV0mwI-home-cwd/b756fe8a-93ee-4da8-a152-e83d7587ecfb/tasks/ab8bdb632c45505cb.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

> **→ rpr:get_recording**
> ```
> {"id":"20260928-074841-app-panel-798a"}
> ```

> **←**
> ```
> {"id":"20260928-074841-app-panel-798a","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-074841-app-panel-798a","summary":{"id":"20260928-074841-app-panel-798a","status":"done","createdAt":"2026-09-28T07:48:43.062Z","source":"panel","url":"http://localhost:37063/?tick=150","viewport":"1280×720","durationSec":1.5,"scope":null,"totals":{"commits":51,"commitsPerSec":33.01,"commitsInScope":51,"renders":464,"rendersPerScopeCommit":9.1,"rendersFromOutside":0,"rendersWithoutDom":289,"domTextChanges":26,"rendersPerTextChange":17.8},"topRoots":[{"root":"Layout","source":"src/main.tsx:10","path":"","hits":15,"hitsPerSec":9.71,"instances":1,"perHit":28,"noDomChange":0,"ownDomUnchanged":15,"renderMsPerHit":1.83,"reasons":["15× state #1 · State @ src/components/ChatView.tsx:63 const [draft, setDraft] = useState('');"],"causes":["15× core:input input"],"lanes":"Sync:15"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","hits":15,"hitsPerSec":9.71,"instances":1,"perHit":1,"noDomChange":14,"renderMsPerHit":0.07,"reasons":["15× state #0 · [react-hook-form] useFormState › State @ src/components/Composer/index.tsx:77 const { isValid } = useFormState({ control });"],"causes":["15× core:input input"],"lanes":"Sync:15"},{"root":"SyncBar","source":"src/components/ChatView.tsx:56","path":"SettingsBySync","hits":11,"hitsPerSec":7.12,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.08,"reasons":["11× external store #2 [use … [5706 more]
> ```

**agent:** I've dispatched the perf-recorder agent to investigate. It's reading the existing recording (`20260928-074841-app-panel-798a`), will identify the re-render cascade cause, fix it in `./src` if warranted, and record an "after" pass to compare against baseline numbers. This runs in the background — I'll report back once it completes.

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

> **→ Grep**
> ```
> {"pattern":"DraftContext|draft","path":"src","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/draft.ts:4:export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
> src/draft.ts:6:export const useDraft = () => useContext(DraftContext);
> src/components/ChatView.tsx:2:import { DraftContext } from '../draft';
> src/components/ChatView.tsx:63:  const [draft, setDraft] = useState('');
> src/components/ChatView.tsx:65:    <DraftContext.Provider value={{ draft, setDraft }}>
> src/components/ChatView.tsx:73:    </DraftContext.Provider>
> src/components/Header.tsx:2:import { useDraft } from '../draft';
> src/components/Header.tsx:19:  const { draft } = useDraft();
> src/components/Header.tsx:20:  return draft ? (
> src/components/Header.tsx:21:    <span className="badge muted" data-testid="draft">
> src/components/Header.tsx:22:      draft
> src/components/Composer/index.tsx:4:import { useDraft } from '../../draft';
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

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ChatView.tsx","old_string":"export const Layout = () => {\n  useFeed();\n  const [draft, setDraft] = useState('');\n  return (\n    <DraftContext.Provider value={{ draft, setDraft }}>\n      <SettingsBySync>\n        <div className=\"app\">\n          <Header />\n          <TypingLine />\n          <ChatView />\n        </div>\n      </SettingsBySync>\n    </DraftContext.Provider>\n  );\n};","new_string":"/**\n * Holds the draft text on its own so that typing (which updates this state on every\n * keystroke) only … [642 more]
> ```

> **←**
> ```
> The file src/components/ChatView.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now let's record an "after" pass using replay of the same repro, and compare.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-074841-app-panel-798a","label":"after"}
> ```

> **←**
> ```
> {"id":"20260928-074952-app-record-ffc0","url":"http://localhost:37063/?tick=150&rpr=rec","requested":"http://localhost:37063/?tick=150","durationSec":2.5,"commits":51,"renders":202,"rendersWithoutDom":80,"rendersPerCommit":4,"topRoot":"Composer ×16","wasting":[{"root":"Composer","source":"src/components/ChatView.tsx:27","hits":16,"instances":1,"noDomChange":1,"ownDomUnchanged":16},{"root":"DraftProvider","source":"src/components/ChatView.tsx:74","hits":15,"instances":1,"noDomChange":0,"ownDomUnchanged":15},{"root":"DraftBadge","source":"src/components/Header.tsx:34","hits":15,"instances":1,"noDomChange":14},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","hits":15,"instances":1,"noDomChange":14}],"warnings":[]}
> ```

> **agent:** Renders dropped from 464 to 202, and the cascade root is no longer the entire `Layout` tree. Let's compare directly for full numbers.

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-074841-app-panel-798a","after":"20260928-074952-app-record-ffc0"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":["durations differ (1545ms vs 2457ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260928-074841-app-panel-798a","durationMs":1545},"after":{"id":"20260928-074952-app-record-ffc0","durationMs":2457},"totals":{"commits":"51 → 51 (0%)","renders":"464 → 202 (-56%)","commitsPerSec":"33.01 → 20.76 (-37%)","rendersPerSec":"300.32 → 82.21 (-73%)","rendersPerCommit":"9.1 → 4 (-56%)","rendersWithoutDomPerSec":"187.06 → 32.56 (-83%)","rendersPerTextChange":"17.8 → 6.5 (-63%)","longTaskMaxMs":"0 → 139"},"roots":[{"root":"Layout","source":"src/main.tsx:10","path":"","status":"gone","hitsPerSec":"9.71 → –","perHit":"28 → –","instances":"1 → –","cascadePerSec":"271.84 → 0 (-100%)"},{"root":"Composer","source":"src/components/ChatView.tsx:27","path":"ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.51","perHit":"– → 7","instances":"– → 1","cascadePerSec":"0 → 45.18"},{"root":"DraftProvider","source":"src/components/ChatView.tsx:74","path":"Layout","status":"new","hitsPerSec":"– → 6.11","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 12.21"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","status":"gone","hitsPerSec":"9.71 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"9.71 → 0 (-100%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:56","path":"Settin … [4219 more]
> ```

> **agent:** The primary fix already eliminated the full-page cascade. Let's check whether the remaining `wastingAfter` items are worth a second, safe fix — particularly `Composer`, which re-renders needlessly because it consumes the same context object as `DraftBadge`.

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

> **→ Write**
> ```
> {"file_path":"src/draft.ts","content":"import { createContext, useContext } from 'react';\n\n/** The unsent text of the message box, for whoever needs to know there is some.\n *  Split into two contexts so a component that only needs to *set* the draft\n *  (e.g. to clear it on send) doesn't re-render on every keystroke just because\n *  the current text changed. */\nexport const DraftValueContext = createContext('');\nexport const DraftSetterContext = createContext((_draft: string) => {});\n\nexport const useDraftValue = () => useContext(DraftValueContext);\ne … [70 more]
> ```

> **←**
> ```
> The file src/draft.ts has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ChatView.tsx","old_string":"import { DraftContext } from '../draft';","new_string":"import { DraftSetterContext, DraftValueContext } from '../draft';"}
> ```

> **←**
> ```
> The file src/components/ChatView.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/ChatView.tsx","old_string":"const DraftProvider = ({ children }: { children: ReactNode }) => {\n  const [draft, setDraft] = useState('');\n  return <DraftContext.Provider value={{ draft, setDraft }}>{children}</DraftContext.Provider>;\n};","new_string":"const DraftProvider = ({ children }: { children: ReactNode }) => {\n  const [draft, setDraft] = useState('');\n  return (\n    <DraftSetterContext.Provider value={setDraft}>\n      <DraftValueContext.Provider value={draft}>{children}</DraftValueContext.Provider>\n … [46 more]
> ```

> **←**
> ```
> The file src/components/ChatView.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now update the consumers: `Header.tsx` (DraftBadge needs only the value) and `Composer/index.tsx` (Composer and MessageInput need only the setter).

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
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { useDraft } from '../../draft';","new_string":"import { useDraftSetter } from '../../draft';"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });\n  const { setDraft } = useDraft();","new_string":"  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });\n  const setDraft = useDraftSetter();"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { setDraft } = useDraft();","new_string":"export const Composer = () => {\n  const setDraft = useDraftSetter();"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **agent:** Now let's record another "after" pass with this second-stage fix and compare against the same before recording.

> **→ rpr:record_page**
> ```
> {"replay":"20260928-074841-app-panel-798a","label":"after2"}
> ```

> **←**
> ```
> {"id":"20260928-075118-app-record-6e9b","url":"http://localhost:37063/?tick=150&rpr=rec","requested":"http://localhost:37063/?tick=150","durationSec":2.3,"commits":50,"renders":156,"rendersWithoutDom":35,"rendersPerCommit":3.1,"topRoot":"DraftProvider ×15","wasting":[{"root":"DraftProvider","source":"src/components/ChatView.tsx:78","hits":15,"instances":1,"noDomChange":0,"ownDomUnchanged":15},{"root":"DraftBadge","source":"src/components/Header.tsx:34","hits":15,"instances":1,"noDomChange":14},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","hits":15,"instances":1,"noDomChange":14}],"warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-074841-app-panel-798a","after":"20260928-075118-app-record-6e9b"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":["durations differ (1545ms vs 2276ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260928-074841-app-panel-798a","durationMs":1545},"after":{"id":"20260928-075118-app-record-6e9b","durationMs":2276},"totals":{"commits":"51 → 50 (-2%)","renders":"464 → 156 (-66%)","commitsPerSec":"33.01 → 21.97 (-33%)","rendersPerSec":"300.32 → 68.54 (-77%)","rendersPerCommit":"9.1 → 3.1 (-66%)","rendersWithoutDomPerSec":"187.06 → 15.38 (-92%)","rendersPerTextChange":"17.8 → 5 (-72%)","longTaskMaxMs":"0 → 94"},"roots":[{"root":"Layout","source":"src/main.tsx:10","path":"","status":"gone","hitsPerSec":"9.71 → –","perHit":"28 → –","instances":"1 → –","cascadePerSec":"271.84 → 0 (-100%)"},{"root":"DraftProvider","source":"src/components/ChatView.tsx:78","path":"Layout","status":"new","hitsPerSec":"– → 6.59","perHit":"– → 3","instances":"– → 1","cascadePerSec":"0 → 19.77"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:108","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.59","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 13.18"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","status":"gone","hitsPerSec":"9.71 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"9.71 → 0 (-100%)"},{"root":"SyncBar","source":"src/components/ChatView … [4274 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChatView.tsx","offset":60,"limit":30}
> ```

> **←**
> ```
> 60	
> 61	/**
> 62	 * Holds the draft text on its own so that typing (which updates this state on every
> 63	 * keystroke) only re-renders this provider and the components that actually read the
> 64	 * context value, instead of re-rendering the whole page held by Layout.
> 65	 */
> 66	const DraftProvider = ({ children }: { children: ReactNode }) => {
> 67	  const [draft, setDraft] = useState('');
> 68	  return (
> 69	    <DraftSetterContext.Provider value={setDraft}>
> 70	      <DraftValueContext.Provider value={draft}>{children}</DraftValueContext.Provider>
> 71	    </DraftSetterContext.Provider>
> 72	  );
> 73	};
> 74	
> 75	export const Layout = () => {
> 76	  useFeed();
> 77	  return (
> 78	    <DraftProvider>
> 79	      <SettingsBySync>
> 80	        <div className="app">
> 81	          <Header />
> 82	          <TypingLine />
> 83	          <ChatView />
> 84	        </div>
> 85	      </SettingsBySync>
> 86	    </DraftProvider>
> 87	  );
> 88	};
> 89	
> ```

> **agent:** ## Root cause
> 
> The whole page re-rendering on every keystroke was real, and confirmed by the recording (`20260928-074841-app-panel-798a`).
> 
> `Layout` (`src/components/ChatView.tsx:61-75`, mounted at `src/main.tsx:10`) owned the message-draft state:
> 
> ```
> const [draft, setDraft] = useState('');
> <DraftContext.Provider value={{ draft, setDraft }}>
>   <SettingsBySync>...<Header/><TypingLine/><ChatView/>...</SettingsBySync>
> </DraftContext.Provider>
> ```
> 
> `setDraft` was called from `MessageInput`'s `onChange` (`src/components/Composer/index.tsx:26`) on every character. Because the state (and the whole subtree) lived in `Layout` itself, every keystroke re-executed `Layout`, and everything below it (`SyncBar`, `Header` and its children, `TypingLine`, `ChatPanel`, `Composer`, `ChannelStats`, `OnlineNow`, etc.) re-rendered too — none of it memoized. That's the "whole page redraws" the user saw. Recorded top root: `Layout` — 15 hits, 28 renders/hit, cascade 271.84/s, reason `state #1 · State @ ChatView.tsx:63`.
> 
> A second, smaller contributor: the context value was a fresh `{ draft, setDraft }` object every render, so any consumer of that context (not just the one reading `draft`) re-rendered on every keystroke — including `Composer`, which only needed the stable `setDraft` function to clear the draft on submit.
> 
> ## Fix (`./src` only, no behavior/UI change)
> 
> 1. `src/components/ChatView.tsx:66-73` — extracted the `draft` state into its own `DraftProvider` component instead of keeping it in `Layout`. Now a keystroke re-renders `DraftProvider` and its context consumers only, not `Layout`'s whole subtree.
> 2. `src/draft.ts` — split the single `DraftContext` into `DraftValueContext` (the text) and `DraftSetterContext` (the stable setter), with `useDraftValue()` / `useDraftSetter()`. Updated consumers:
>    - `src/components/Header.tsx:19` (`DraftBadge`) now calls `useDraftValue()`.
>    - `src/components/Composer/index.tsx:17` (`MessageInput`) and `:86` (`Composer`) now call `useDraftSetter()` instead of destructuring the whole context, so `Composer` (which only needs the setter, for the reset-on-submit) no longer re-renders on every character.
> 
> No prop, JSX, or logic that affects what's shown/sent changed — only which component owns the state and which context each consumer subscribes to.
> 
> ## Before/after numbers (`compare_recordings`, same replay of "type into MessageInput ‘see you at five’", 1280×720)
> 
> Before: `20260928-074841-app-panel-798a` (top root `Layout`, 464 renders total)
> After: `20260928-075118-app-record-6e9b` (top root `DraftProvider`, 156 renders total)
> 
> - total renders: 464 → 156 (**-66%**)
> - renders per commit: 9.1 → 3.1 (**-66%**)
> - renders per DOM-affecting text change: 17.8 → 5 (**-72%**)
> - renders per typed character (the recorded action): 29 → 8.1 (**-72%**)
> - `Layout` cascade root: gone entirely (was 271.84 cascaded renders/sec)
> - `Composer` (secondary fix target): before the split it was still a wasted root (16 hits/keystroke burst, own DOM unchanged 16/16); after the split its hit rate dropped from "every keystroke" to 0.44/s, perHit 6 — it no longer fires on typing at all.
> 
> (An intermediate measurement after only step 1 — before the context split — already showed 464 → 202 renders (-56%); the context split brought it further down to 156.)
> 
> ## What still renders for nothing after the fix
> 
> From `wastingAfter` in the final comparison:
> - `DraftProvider` (`ChatView.tsx:78`) — 15 hits, `ownDomUnchanged: 15`. Unavoidable: it's the component that owns the draft state, has no DOM of its own, and must re-render to hand the new value to `DraftValueContext`.
> - `DraftBadge` (`Header.tsx:34`) — 15 hits, DOM changes in only 1 of 15. It re-renders every keystroke because it reads the draft text from context, but it only ever needs the text's truthiness (`draft ? <span>draft</span> : null`). Minor, real waste; not fixed because it would need a boolean-selecting context (e.g. `use-context-selector` or a third "hasDraft" context) — more machinery for a one-line badge that costs a trivial render.
> - `SendButton` (`Composer/index.tsx:103`) — 15 hits, DOM (the `disabled` attribute) changes in only 1 of 15. This is react-hook-form's own `useFormState({ control })` recomputing `isValid` on every change event in `mode: 'onChange'` (already flagged pre-fix in the recording's `memos` section); pre-existing library behavior, not introduced or worsened by this fix, and not the cause of the reported "whole page" symptom.
> 
> ## Conditions
> - URL: `http://localhost:37063/?tick=150`, viewport 1280×720, no throttling.
> - Repro: click the message box, type "see you at five" (replayed via `record_page` `replay` on the original panel recording, so both before/after used identical keystroke timing/content).
> - Before recording: panel capture, 1.5s, 51 commits. After recording: scripted replay, ~2.3s, 50 commits (duration differs because replay re-drives real timing; compared by per-action/per-commit rates, not wall time, per the tool's own warning).
> 
> ## Not checked
> - Whether `SendButton`'s and `DraftBadge`'s remaining per-keystroke re-renders cause any perceptible lag on their own (numbers suggest they're cheap — single small elements, no `noDomChange`-driving cost reported).
> - Behavior/visual regression testing beyond code review (no test suite was run); the changes are read-only refactors of where state/context live, so no visible behavior should differ, but I did not click through the app manually to confirm the draft badge, send button, and submit-reset all still work.
> - The `redux`/`zustand`/`react-query` background churn visible in the recordings (feed tick, presence, connection beat) — unrelated to the typing complaint, left untouched.

**→ Read**
```
{"file_path":"src/draft.ts"}
```

**←**
```
1	import { createContext, useContext } from 'react';
2	
3	/** The unsent text of the message box, for whoever needs to know there is some.
4	 *  Split into two contexts so a component that only needs to *set* the draft
5	 *  (e.g. to clear it on send) doesn't re-render on every keystroke just because
6	 *  the current text changed. */
7	export const DraftValueContext = createContext('');
8	export const DraftSetterContext = createContext((_draft: string) => {});
9	
10	export const useDraftValue = () => useContext(DraftValueContext);
11	export const useDraftSetter = () => useContext(DraftSetterContext);
12	
```

**→ Read**
```
{"file_path":"src/components/ChatView.tsx"}
```

**←**
```
1	import { useState, type ReactNode } from 'react';
2	import { DraftSetterContext, DraftValueContext } from '../draft';
3	import { useFeed } from '../feed';
4	import ActivityLog from './ActivityLog';
5	import { useChatStore } from '../store/chat';
6	import { ChannelStats } from './ChannelStats';
7	import { ChatPanel } from './ChatPanel';
8	import { Composer } from './Composer';
9	import { Header } from './Header';
10	import { MessageCount } from './MessageCount';
11	import { OnlineNow } from './OnlineNow';
12	import { PrefsLine } from './PrefsLine';
13	import { SettingsProvider } from './Settings';
14	import { TypingLine } from './TypingLine';
15	import { WebhookForm } from './WebhookForm';
16	
17	function useChatLayout() {
18	  return { wide: true };
19	}
20	
21	export const ChatView = () => {
22	  const { wide } = useChatLayout();
23	  return (
24	    <main className={wide ? 'chat wide' : 'chat'}>
25	      <div className="thread">
26	        <ChatPanel />
27	        <Composer />
28	      </div>
29	      <aside className="side" data-testid="side-panel">
30	        <h3>Channel</h3>
31	        <ChannelStats />
32	        <MessageCount />
33	        <OnlineNow />
34	        <PrefsLine />
35	        <h3>Activity</h3>
36	        <ActivityLog />
37	        <h3>Webhook</h3>
38	        <WebhookForm />
39	      </aside>
40	    </main>
41	  );
42	};
43	
44	const SyncBar = () => {
45	  const at = useChatStore((s) => s.workspace.lastEventAt);
46	  return (
47	    <span className="sync"  … [1314 more]
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
4	import { useDraftSetter } from '../../draft';
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
17	  const setDraft = useDraftSetter();
18	  return (
19	    <label className="field grow">
20	      <input
21	        {...field}
22	        data-testid="message"
23	        placeholder="Write a message"
24	        onChange={(e) => {
25	          field.onChange(e);
26	          setDraft(e.target.value);
27	          // The other fields are validated against the text.
28	          void trigger();
29	        }}
30	        onKeyDown={(e) => {
31	          // Enter waits while someone is typing a reply, so the two messages do not cross.
32	          if (e.key === 'Enter' && presenceStore.getState().typing.length > 0) e.preventDefault();
33	        }}
34	      />
35	    </label>
36	  );
37	};
38	
39	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') … [2530 more]
```

**→ Read**
```
{"file_path":"src/components/Header.tsx"}
```

**←**
```
1	import { useChatStore } from '../store/chat';
2	import { useDraftValue } from '../draft';
3	import { selectUnread } from '../store/selectors';
4	import { ChannelTopic } from './ChannelTopic';
5	import { TimezoneBadge } from './Settings';
6	import { TypingBadge } from './TypingBadge';
7	import Workspace from './Workspace';
8	
9	const Unread = () => {
10	  const unread = useChatStore(selectUnread);
11	  return (
12	    <span className="badge" data-testid="unread">
13	      {unread} unread
14	    </span>
15	  );
16	};
17	
18	const DraftBadge = () => {
19	  const draft = useDraftValue();
20	  return draft ? (
21	    <span className="badge muted" data-testid="draft">
22	      draft
23	    </span>
24	  ) : null;
25	};
26	
27	export const Header = () => (
28	  <header className="head" data-testid="header">
29	    <Workspace />
30	    <ChannelTopic />
31	    <Unread />
32	    <TimezoneBadge />
33	    <TypingBadge />
34	    <DraftBadge />
35	  </header>
36	);
37	
```

**agent:** The fix is sound and matches its report — `useDraftSetter`/`useDraftValue` are used consistently in `Composer/index.tsx` and `Header.tsx`, and `Layout` in `ChatView.tsx` no longer owns the draft state directly.

**Root cause:** typing updated `draft` state that lived directly in `Layout` (`ChatView.tsx`), the top-level component wrapping the entire page. Every keystroke re-rendered `Layout` and its whole subtree — header, chat panel, sidebar stats, everything — none of it memoized. A second issue compounded it: the context value was a fresh `{draft, setDraft}` object each render, so even components that only needed the stable setter (like `Composer`) re-rendered on every character.

**Fix (in `./src` only):**
- `src/components/ChatView.tsx` — moved the draft state out of `Layout` into a new inner `DraftProvider` component, so a keystroke only re-renders that provider and its consumers, not the whole page.
- `src/draft.ts` — split the single context into `DraftValueContext` (the text) and `DraftSetterContext` (the stable setter function), with `useDraftValue()`/`useDraftSetter()` hooks.
- `src/components/Header.tsx` and `src/components/Composer/index.tsx` — updated to use the specific hook they actually need, so `Composer` (which only clears the draft on submit) stops re-rendering per keystroke.

No UI, props, or behavior changed — only which component owns the state and which context each consumer subscribes to.

**Before/after (via the recording tool, same "type 'see you at five'" replay):**
- Total renders: 464 → 156 (**-66%**)
- Renders per typed character: 29 → 8.1 (**-72%**)
- `Layout`'s page-wide cascade (was 271.84 renders/sec): gone
- `Composer` no longer fires on typing at all (was every keystroke → 0.44/s)

**Residual, minor, not worth fixing:** `DraftProvider` itself re-renders each keystroke (unavoidable — it owns the state) and `DraftBadge` re-renders each keystroke but only changes DOM 1/15 times (would need extra machinery like a boolean-selector context to eliminate, for a one-line badge). `SendButton`'s per-keystroke `isValid` recompute is `react-hook-form`'s own behavior, pre-existing and unrelated to this bug.

One caveat from the agent: it verified this via the recorder and code review but did not manually click through the running app to eyeball the draft badge/send button/submit-reset — worth a quick manual smoke test if you want extra confidence before treating this as fully done.
