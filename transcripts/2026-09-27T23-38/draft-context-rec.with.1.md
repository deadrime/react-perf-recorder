# draft-context-rec, with the plugin, run 1

fixed (waste 0); checks 5 of 5; $0.40, 124 s, 29 turns

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

> Both look correct. Everything checks out — no lingering references to the old context, and the DraftBadge/Composer behavior is unchanged in output, only in where the state lives.
> 
> ## Findings
> 
> **Root cause:** `Layout` (`src/components/ChatView.tsx`, the app's top-level component, mounted at `src/main.tsx:10`) held the message draft in its own `useState`, then handed it down through `DraftContext`. Only one component ever *read* that value — `DraftBadge` in `Header.tsx` (to show a small "draft" pill). Everything else that touched it (`MessageInput`, `Composer`) only called the *setter*.
> 
> Because the state lived at the very top of the tree, every keystroke re-rendered `Layout` itself, and with it the entire subtree below — `SyncBar`, `TypingBadge`, `SendButton`, `ChannelStats`, `OnlineNow`, etc. — none of which show anything different when the draft changes. That's the "whole page redraws with every letter" complaint: `Layout`'s own DOM never changed in any of the 15 hits (`ownDomUnchanged: 15`), confirming it was rendering for nothing.
> 
> **Fix:** moved the draft into a small vanilla zustand store (matching the pattern already used for `presenceStore`/`useChatStore`) in `src/draft.ts`. `DraftBadge` subscribes to it directly; `MessageInput`/`Composer` just call the exported `setDraft()` function. `Layout` no longer holds this state at all, so it no longer re-renders on keystrokes. Nothing about what's rendered on screen changed — same badge, same behavior.
> 
> **Before → after** (same typed action "see you at five", replayed identically):
> - Renders per keystroke: **29 → 5.1** (‑82%)
> - Total renders in the recording: **464 → 112** (‑76%)
> - Renders with no DOM change: **289 → 35** (‑92% per second)
> - `Layout` as a cascade root: **258 cascades/sec → gone entirely**
> 
> The remaining renders (`ComposerHints`, `MessageInput`, `SendButton`, `DraftBadge`) are ones that actually need to update on each keystroke (character count, validity, the draft badge) — that's real, necessary work, not waste.

## What it changed

```
diff -ruN a/src/components/ChatView.tsx b/src/components/ChatView.tsx
--- a/src/components/ChatView.tsx
+++ b/src/components/ChatView.tsx
@@ -1,5 +1,4 @@
-import { useState, type ReactNode } from 'react';
-import { DraftContext } from '../draft';
+import type { ReactNode } from 'react';
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
+import { setDraft } from '../../draft';
 import { useFieldError } from './useFieldError';
 
 export interface ComposerValues {
@@ -14,7 +14,6 @@
 
 export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
   const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
-  const { setDraft } = useDraft();
   return (
     <label className="field grow">
       <input
@@ -83,7 +82,6 @@
 };
 
 export const Composer = () => {
-  const { setDraft } = useDraft();
   const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
     mode: 'onChange',
     defaultValues: { text: '', replyTo: '', remindIn: '' },
diff -ruN a/src/components/Header.tsx b/src/components/Header.tsx
--- a/src/components/Header.tsx
+++ b/src/components/Header.tsx
@@ -16,7 +16,7 @@
 };
 
 const DraftBadge = () => {
-  const { draft } = useDraft();
+  const draft = useDraft();
   return draft ? (
     <span className="badge muted" data-testid="draft">
       draft
diff -ruN a/src/draft.ts b/src/draft.ts
--- a/src/draft.ts
+++ b/src/draft.ts
@@ -1,6 +1,9 @@
-import { createContext, useContext } from 'react';
+import { useStore } from 'zustand';
+import { createStore } from 'zustand/vanilla';
 
 /** The unsent text of the message box, for whoever needs to know there is some. */
-export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
+const draftStore = createStore(() => ({ draft: '' }));
 
-export const useDraft = () => useContext(DraftContext);
+export const setDraft = (draft: string) => draftStore.setState({ draft });
+
+export const useDraft = () => useStore(draftStore, (s) => s.draft);
```

## The steps

**agent:** This matches the react-perf-recorder skill exactly — reading the existing recording, finding the re-render cascade, fixing it, and proving it with numbers. Let me invoke it.

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

A dev-only Vite plugin that records React re-renders from the page. Re … [3506 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260927-234035-app-panel-7d41
2	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:40315/?tick=150
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
```

**→ rpr:get_recording**
```
{"id":"20260927-234035-app-panel-7d41"}
```

**←**
```
{"id":"20260927-234035-app-panel-7d41","status":"done","dir":"/tmp/tmp.tWwgk7hfQ4/20260927-234035-app-panel-7d41","summary":{"id":"20260927-234035-app-panel-7d41","status":"done","createdAt":"2026-09-27T23:40:36.666Z","source":"panel","url":"http://localhost:40315/?tick=150","viewport":"1280×720","durationSec":1.6,"scope":null,"totals":{"commits":51,"commitsPerSec":31.37,"commitsInScope":51,"renders":464,"rendersPerScopeCommit":9.1,"rendersFromOutside":0,"rendersWithoutDom":289,"domTextChanges":26,"rendersPerTextChange":17.8},"topRoots":[{"root":"Layout","source":"src/main.tsx:10","path":"","hits":15,"hitsPerSec":9.23,"instances":1,"perHit":28,"noDomChange":0,"ownDomUnchanged":15,"renderMsPerHit":2.06,"reasons":["15× state #1 · State @ src/components/ChatView.tsx:63 const [draft, setDraft] = useState('');"],"causes":["15× core:input input","1× zustand:clockStore.setState"],"lanes":"Sync:15"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","hits":15,"hitsPerSec":9.23,"instances":1,"perHit":1,"noDomChange":14,"renderMsPerHit":0.04,"reasons":["15× state #0 · [react-hook-form] useFormState › State @ src/components/Composer/index.tsx:77 const { isValid } = useFormState({ control });"],"causes":["15× core:input input"],"lanes":"Sync:15"},{"root":"SyncBar","source":"src/components/ChatView.tsx:56","path":"SettingsBySync","hits":11,"hitsPerSec":6.77,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.14,"reas … [5739 more]
```

**→ Read**
```
{"file_path":"src/main.tsx"}
```

**←**
```
1	import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
2	import { createRoot } from 'react-dom/client';
3	import { Provider } from 'react-redux';
4	import { createBrowserRouter, RouterProvider } from 'react-router-dom';
5	import './app.css';
6	import { Layout } from './components/ChatView';
7	import { store } from './store/activity';
8	
9	const client = new QueryClient();
10	const router = createBrowserRouter([{ path: '*', element: <Layout /> }]);
11	
12	createRoot(document.getElementById('root')!).render(
13	  <Provider store={store}>
14	    <QueryClientProvider client={client}>
15	      <RouterProvider router={router} />
16	    </QueryClientProvider>
17	  </Provider>
18	);
19	
```

**→ Read**
```
{"file_path":"src/components/ChatView.tsx"}
```

**←**
```
1	import { useState, type ReactNode } from 'react';
2	import { DraftContext } from '../draft';
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
47	    <span className="sync" title="Live">
48	      <s … [781 more]
```

**→ Grep**
```
{"pattern":"DraftContext|useDraft|draft","path":"src","-n":true,"output_mode":"content"}
```

**←**
```
src/draft.ts:4:export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
src/draft.ts:6:export const useDraft = () => useContext(DraftContext);
src/components/ChatView.tsx:2:import { DraftContext } from '../draft';
src/components/ChatView.tsx:63:  const [draft, setDraft] = useState('');
src/components/ChatView.tsx:65:    <DraftContext.Provider value={{ draft, setDraft }}>
src/components/ChatView.tsx:73:    </DraftContext.Provider>
src/components/Composer/index.tsx:4:import { useDraft } from '../../draft';
src/components/Composer/index.tsx:17:  const { setDraft } = useDraft();
src/components/Composer/index.tsx:86:  const { setDraft } = useDraft();
src/components/Header.tsx:2:import { useDraft } from '../draft';
src/components/Header.tsx:19:  const { draft } = useDraft();
src/components/Header.tsx:20:  return draft ? (
src/components/Header.tsx:21:    <span className="badge muted" data-testid="draft">
src/components/Header.tsx:22:      draft
```

**→ Read**
```
{"file_path":"src/components/Header.tsx"}
```

**←**
```
1	import { useChatStore } from '../store/chat';
2	import { useDraft } from '../draft';
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
19	  const { draft } = useDraft();
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

**→ Read**
```
{"file_path":"src/components/Composer/index.tsx"}
```

**←**
```
1	import { memo, type ReactNode } from 'react';
2	import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
3	import { presenceStore, useChatStore } from '../../store/chat';
4	import { useDraft } from '../../draft';
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
17	  const { setDraft } = useDraft();
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
39	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
40	   … [2520 more]
```

**→ Read**
```
{"file_path":"src/draft.ts"}
```

**←**
```
1	import { createContext, useContext } from 'react';
2	
3	/** The unsent text of the message box, for whoever needs to know there is some. */
4	export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
5	
6	export const useDraft = () => useContext(DraftContext);
7	
```

**→ Read**
```
{"file_path":"src/store/chat.ts"}
```

**←**
```
1	import { create, type StateCreator } from 'zustand';
2	import { devtools } from 'zustand/middleware';
3	import { createStore } from 'zustand/vanilla';
4	
5	export type Person = 'Anna' | 'Boris' | 'Chen';
6	
7	export interface Message {
8	  id: string;
9	  from: Person;
10	  text: string;
11	  sentAt: number;
12	}
13	
14	/** The chat runs on a compressed clock: a message every 40 ticks, a reaction every 5, typing three ticks ahead. */
15	export const ARRIVAL_EVERY = 40;
16	export const TYPING_LEAD = 3;
17	const REACTION_EVERY = 5;
18	
19	const PEOPLE: Person[] = ['Anna', 'Boris', 'Chen'];
20	const ARRIVALS = [
21	  'One more thing before I forget — the picker keeps the scroll now',
22	  'Anyone else seeing the countdown flicker?',
23	  'Merged. The release notes are in the channel topic',
24	  'I moved the standup to 10:30 tomorrow',
25	];
26	
27	export const senderAt = (step: number): Person => PEOPLE[Math.floor(step / ARRIVAL_EVERY) % PEOPLE.length];
28	
29	interface FeedSlice {
30	  reactionsById: Record<string, number>;
31	  tick(step: number): void;
32	}
33	
34	export interface Prefs {
35	  timeFormat: '12h' | '24h';
36	  compact: boolean;
37	}
38	
39	export const DEFAULT_PREFS: Prefs = { timeFormat: '24h', compact: false };
40	
41	interface WorkspaceSlice {
42	  workspace: { id: string; name: string; unread: number; lastEventAt: number };
43	  prefs: Prefs;
44	  markRead(): void;
45	}
46	
47	interface MessagesSlice {
48	  messageById: Record<string, Message>;
49	  /**  … [3483 more]
```

**→ Read**
```
{"file_path":"src/components/TypingLine.tsx"}
```

**←**
```
1	import { useStore } from 'zustand';
2	import { presenceStore, type Person } from '../store/chat';
3	
4	const line = (typing: Person[]) => {
5	  if (typing.length === 0) return ' ';
6	  const names = typing.length > 1 ? `${typing.slice(0, -1).join(', ')} and ${typing.at(-1)}` : typing[0];
7	  return `${names} ${typing.length > 1 ? 'are' : 'is'} typing…`;
8	};
9	
10	export const TypingLine = () => {
11	  const typing = useStore(presenceStore, (s) => s.typing);
12	  return (
13	    <small className="connection" data-testid="typing">
14	      {line(typing)}
15	    </small>
16	  );
17	};
18	
```

**→ Grep**
```
{"pattern":"DraftContext","path":"src","-n":true,"output_mode":"content"}
```

**←**
```
src/draft.ts:4:export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
src/draft.ts:6:export const useDraft = () => useContext(DraftContext);
src/components/ChatView.tsx:2:import { DraftContext } from '../draft';
src/components/ChatView.tsx:65:    <DraftContext.Provider value={{ draft, setDraft }}>
src/components/ChatView.tsx:73:    </DraftContext.Provider>
```

**agent:** Good, only those two files. Now applying the fix.

**→ Write**
```
{"file_path":"src/draft.ts","content":"import { useStore } from 'zustand';\nimport { createStore } from 'zustand/vanilla';\n\n/** The unsent text of the message box, for whoever needs to know there is some. */\nconst draftStore = createStore(() => ({ draft: '' }));\n\nexport const setDraft = (draft: string) => draftStore.setState({ draft });\n\nexport const useDraft = () => useStore(draftStore, (s) => s.draft);\n"}
```

**←**
```
The file src/draft.ts has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChatView.tsx","old_string":"import { useState, type ReactNode } from 'react';\nimport { DraftContext } from '../draft';\nimport { useFeed } from '../feed';","new_string":"import type { ReactNode } from 'react';\nimport { useFeed } from '../feed';"}
```

**←**
```
The file src/components/ChatView.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChatView.tsx","old_string":"export const Layout = () => {\n  useFeed();\n  const [draft, setDraft] = useState('');\n  return (\n    <DraftContext.Provider value={{ draft, setDraft }}>\n      <SettingsBySync>\n        <div className=\"app\">\n          <Header />\n          <TypingLine />\n          <ChatView />\n        </div>\n      </SettingsBySync>\n    </DraftContext.Provider>\n  );\n};","new_string":"export const Layout = () => {\n  useFeed();\n  return (\n    <SettingsBySync>\n      <div className=\"app\">\ … [114 more]
```

**←**
```
The file src/components/ChatView.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now update the two consumers.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"const DraftBadge = () => {\n  const { draft } = useDraft();","new_string":"const DraftBadge = () => {\n  const draft = useDraft();"}
```

**←**
```
The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Read**
```
{"file_path":"src/components/Composer/index.tsx","offset":1,"limit":5}
```

**←**
```
1	import { memo, type ReactNode } from 'react';
2	import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
3	import { presenceStore, useChatStore } from '../../store/chat';
4	import { useDraft } from '../../draft';
5	import { useFieldError } from './useFieldError';
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { useDraft } from '../../draft';","new_string":"import { setDraft } from '../../draft';"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully.
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });\n  const { setDraft } = useDraft();\n  return (","new_string":"  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });\n  return ("}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully.
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { setDraft } = useDraft();\n  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({","new_string":"export const Composer = () => {\n  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully.
```

**agent:** Now let me record the same typing scenario again and compare against the original recording to prove the fix worked.

**→ rpr:record_page**
```
{"replay":"20260927-234035-app-panel-7d41","label":"after"}
```

**←**
```
{"id":"20260927-234205-app-record-dcca","url":"http://localhost:40315/?tick=150&rpr=rec","requested":"http://localhost:40315/?tick=150","durationSec":2.4,"commits":51,"renders":112,"rendersWithoutDom":35,"rendersPerCommit":2.2,"topRoot":"ComposerHints ×15","warnings":[]}
```

**→ rpr:compare_recordings**
```
{"before":"20260927-234035-app-panel-7d41","after":"20260927-234205-app-record-dcca"}
```

**←**
```
{"comparable":true,"warnings":["durations differ (1626ms vs 2351ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260927-234035-app-panel-7d41","durationMs":1626},"after":{"id":"20260927-234205-app-record-dcca","durationMs":2351},"totals":{"commits":"51 → 51 (0%)","renders":"464 → 112 (-76%)","commitsPerSec":"31.37 → 21.69 (-31%)","rendersPerSec":"285.36 → 47.64 (-83%)","rendersPerCommit":"9.1 → 2.2 (-76%)","rendersWithoutDomPerSec":"177.74 → 14.89 (-92%)","rendersPerTextChange":"17.8 → 3.6 (-80%)","longTaskMaxMs":"0 → 121"},"roots":[{"root":"Layout","source":"src/main.tsx:10","path":"","status":"gone","hitsPerSec":"9.23 → –","perHit":"28 → –","instances":"1 → –","cascadePerSec":"258.3 → 0 (-100%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:106","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.38","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 12.76"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","status":"gone","hitsPerSec":"9.23 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"9.23 → 0 (-100%)"},{"root":"SyncBar","source":"src/components/ChatView.tsx:56","path":"SettingsBySync","status":"gone","hitsPerSec":"6.77 → –","perHit":"1 → –","instances":"1 → –","cascadePerSec":"6.77 → 0 (-100%)"},{"root":"DraftBadge","source":"src/compo … [3957 more]
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
4	import { setDraft } from '../../draft';
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
25	          setDraft(e.target.value);
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
38	function useMetaField(control: FormControl, name: 'replyTo' | 'remindIn') {
39	  const { field } = useController({ cont … [2442 more]
```

**agent:** Clean. Let me double check ChatView.tsx and Header.tsx final state.

**→ Read**
```
{"file_path":"src/components/ChatView.tsx"}
```

**←**
```
1	import type { ReactNode } from 'react';
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

**→ Read**
```
{"file_path":"src/components/Header.tsx"}
```

**←**
```
1	import { useChatStore } from '../store/chat';
2	import { useDraft } from '../draft';
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
19	  const draft = useDraft();
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

**agent:** Both look correct. Everything checks out — no lingering references to the old context, and the DraftBadge/Composer behavior is unchanged in output, only in where the state lives.

## Findings

**Root cause:** `Layout` (`src/components/ChatView.tsx`, the app's top-level component, mounted at `src/main.tsx:10`) held the message draft in its own `useState`, then handed it down through `DraftContext`. Only one component ever *read* that value — `DraftBadge` in `Header.tsx` (to show a small "draft" pill). Everything else that touched it (`MessageInput`, `Composer`) only called the *setter*.

Because the state lived at the very top of the tree, every keystroke re-rendered `Layout` itself, and with it the entire subtree below — `SyncBar`, `TypingBadge`, `SendButton`, `ChannelStats`, `OnlineNow`, etc. — none of which show anything different when the draft changes. That's the "whole page redraws with every letter" complaint: `Layout`'s own DOM never changed in any of the 15 hits (`ownDomUnchanged: 15`), confirming it was rendering for nothing.

**Fix:** moved the draft into a small vanilla zustand store (matching the pattern already used for `presenceStore`/`useChatStore`) in `src/draft.ts`. `DraftBadge` subscribes to it directly; `MessageInput`/`Composer` just call the exported `setDraft()` function. `Layout` no longer holds this state at all, so it no longer re-renders on keystrokes. Nothing about what's rendered on screen changed — same badge, same behavior.

**Before → after** (same typed action "see you at five", replayed identically):
- Renders per keystroke: **29 → 5.1** (‑82%)
- Total renders in the recording: **464 → 112** (‑76%)
- Renders with no DOM change: **289 → 35** (‑92% per second)
- `Layout` as a cascade root: **258 cascades/sec → gone entirely**

The remaining renders (`ComposerHints`, `MessageInput`, `SendButton`, `DraftBadge`) are ones that actually need to update on each keystroke (character count, validity, the draft badge) — that's real, necessary work, not waste.
