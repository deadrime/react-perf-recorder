# draft-context-rec, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.57, 219 s, 31 turns

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

> Fixed. Here's what was wrong and what changed.
> 
> **Root cause**
> 
> `Layout` in `src/components/ChatView.tsx` held the composer's draft text in `useState` and wrapped the *entire app* in a `DraftContext.Provider` whose value changed on every keystroke. Since `Layout` sits at the very top of the tree (`src/main.tsx:10`), every character typed re-rendered `Layout` and cascaded, unmemoized, through `Header`, `TypingLine`, `ChatView`, the sidebar stats, activity log, and webhook form — the "whole page redraws" the report described. The recording confirmed it: `Layout` rendered 15 times for 15 keystrokes, and **all 15** left its own DOM unchanged (`ownDomUnchanged: 15`) — pure wasted work. Yet only one tiny badge (`DraftBadge` in `Header`) ever read the draft, and only to check if it was non-empty — nobody read the actual text.
> 
> **Fix**
> 
> Moved the draft flag out of React state/context into a small zustand store (`src/store/draft.ts`), matching the pattern the codebase already uses for `presenceStore`. `MessageInput`/`Composer` now write to it directly (`draftStore.setState(...)`), the same way they already call `useChatStore.getState().send(...)`. `useDraft()` now subscribes with a boolean selector, so `DraftBadge` only re-renders when the draft flips between empty and non-empty — not on every keystroke. `Layout` no longer holds any state tied to typing, so it doesn't re-render at all when typing. Nothing about what's shown changed: the badge still appears/disappears the same way, and the input itself is still driven by react-hook-form as before.
> 
> **Before/after (same recorded interaction, replayed on both versions of the code):**
> 
> | | before | after |
> |---|---|---|
> | total renders | 478 | 97 (-80%) |
> | renders per commit | 8.4 | 1.9 (-77%) |
> | renders per character typed | 29.7 | 4.1 (-86%) |
> | renders/sec that changed nothing | 126.9 | 9.4 (-93%) |
> | `Layout`'s cascade | 180.65 renders/sec | 0 — root gone entirely |
> 
> **Left over:** `SendButton` still re-renders once per keystroke via react-hook-form's `useFormState`, with its `disabled` attribute actually changing on only 1 of 15 renders. This is unchanged before and after my fix (same 15 hits/14-no-op both times), costs about 0.1ms per render, and is a library-internal subscription rather than app state — I left it alone since it's unrelated to the reported bug and fixing it would mean changing how the form validates, not just removing redundant work.

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
+import { draftStore } from '../../store/draft';
 import { useFieldError } from './useFieldError';
 
 export interface ComposerValues {
@@ -14,7 +14,6 @@
 
 export const MessageInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
   const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });
-  const { setDraft } = useDraft();
   return (
     <label className="field grow">
       <input
@@ -23,7 +22,7 @@
         placeholder="Write a message"
         onChange={(e) => {
           field.onChange(e);
-          setDraft(e.target.value);
+          draftStore.setState({ draft: e.target.value });
           // The other fields are validated against the text.
           void trigger();
         }}
@@ -83,7 +82,6 @@
 };
 
 export const Composer = () => {
-  const { setDraft } = useDraft();
   const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
     mode: 'onChange',
     defaultValues: { text: '', replyTo: '', remindIn: '' },
@@ -94,7 +92,7 @@
       data-testid="composer"
       onSubmit={handleSubmit((values) => {
         useChatStore.getState().send(values.text);
-        setDraft('');
+        draftStore.setState({ draft: '' });
         reset();
       })}
     >
diff -ruN a/src/components/Header.tsx b/src/components/Header.tsx
--- a/src/components/Header.tsx
+++ b/src/components/Header.tsx
@@ -16,8 +16,8 @@
 };
 
 const DraftBadge = () => {
-  const { draft } = useDraft();
-  return draft ? (
+  const hasDraft = useDraft();
+  return hasDraft ? (
     <span className="badge muted" data-testid="draft">
       draft
     </span>
diff -ruN a/src/draft.ts b/src/draft.ts
--- a/src/draft.ts
+++ b/src/draft.ts
@@ -1,6 +1,5 @@
-import { createContext, useContext } from 'react';
+import { useStore } from 'zustand';
+import { draftStore } from './store/draft';
 
-/** The unsent text of the message box, for whoever needs to know there is some. */
-export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
-
-export const useDraft = () => useContext(DraftContext);
+/** Whether there is unsent text in the message box; nobody outside the box needs the text itself. */
+export const useDraft = () => useStore(draftStore, (s) => Boolean(s.draft));
diff -ruN a/src/store/draft.ts b/src/store/draft.ts
--- a/src/store/draft.ts
+++ b/src/store/draft.ts
@@ -0,0 +1,4 @@
+import { createStore } from 'zustand/vanilla';
+
+/** The unsent text of the message box, for whoever needs to know there is some. */
+export const draftStore = createStore(() => ({ draft: '' }));
```

## The steps

**agent:** This is exactly what the perf-recorder skill is built for — it'll read the existing recording, find any wasted re-renders, and let me verify a fix with real numbers.

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

A dev-only Vite plugin that records React re-renders from the page. Re … [4093 more]

**→ Read**
```
{"file_path":"recording.txt"}
```

**←**
```
1	20260928-081510-app-panel-f7cd
2	
```

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
```

**→ rpr:get_recording**
```
{"id":"20260928-081510-app-panel-f7cd"}
```

**←**
```
{"id":"20260928-081510-app-panel-f7cd","status":"done","dir":"/tmp/tmp.TaY0c7knwc/20260928-081510-app-panel-f7cd","summary":{"id":"20260928-081510-app-panel-f7cd","status":"done","createdAt":"2026-09-28T08:15:12.428Z","source":"panel","url":"http://localhost:46391/?tick=150","viewport":"1280×720","durationSec":1.5,"scope":null,"totals":{"commits":51,"commitsPerSec":33.36,"commitsInScope":51,"renders":464,"rendersPerScopeCommit":9.1,"rendersFromOutside":0,"rendersWithoutDom":289,"domTextChanges":26,"rendersPerTextChange":17.8},"topRoots":[{"root":"Layout","source":"src/main.tsx:10","path":"","hits":15,"hitsPerSec":9.81,"instances":1,"perHit":28,"noDomChange":0,"ownDomUnchanged":15,"renderMsPerHit":2.01,"reasons":["15× state #1 · State @ src/components/ChatView.tsx:63 const [draft, setDraft] = useState('');"],"causes":["15× core:input input","1× zustand:clockStore.setState"],"lanes":"Sync:15"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","hits":15,"hitsPerSec":9.81,"instances":1,"perHit":1,"noDomChange":14,"renderMsPerHit":0.09,"reasons":["15× state #0 · [react-hook-form] useFormState › State @ src/components/Composer/index.tsx:77 const { isValid } = useFormState({ control });"],"causes":["15× core:input input"],"lanes":"Sync:15"},{"root":"SyncBar","source":"src/components/ChatView.tsx:56","path":"SettingsBySync","hits":11,"hitsPerSec":7.19,"instances":1,"perHit":1,"noDomChange":0,"renderMsPerHit":0.1,"reaso … [5737 more]
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
{"pattern":"DraftContext|draft","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/draft.ts:4:export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
src/draft.ts:6:export const useDraft = () => useContext(DraftContext);
src/components/Header.tsx:2:import { useDraft } from '../draft';
src/components/Header.tsx:19:  const { draft } = useDraft();
src/components/Header.tsx:20:  return draft ? (
src/components/Header.tsx:21:    <span className="badge muted" data-testid="draft">
src/components/Header.tsx:22:      draft
src/components/ChatView.tsx:2:import { DraftContext } from '../draft';
src/components/ChatView.tsx:63:  const [draft, setDraft] = useState('');
src/components/ChatView.tsx:65:    <DraftContext.Provider value={{ draft, setDraft }}>
src/components/ChatView.tsx:73:    </DraftContext.Provider>
src/components/Composer/index.tsx:4:import { useDraft } from '../../draft';
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

**→ Glob**
```
{"pattern":"src/store/*.ts"}
```

**←**
```
src/store/clock.ts
src/store/activity.ts
src/store/chat.ts
src/store/selectors.ts
src/store/draft.ts
```

**→ Read**
```
{"file_path":"src/store/draft.ts"}
```

**←**
```
<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>
```

**→ Read**
```
{"file_path":"src/feed.ts"}
```

**←**
```
1	import { useEffect } from 'react';
2	import { addActivity, beat, store } from './store/activity';
3	import { ARRIVAL_EVERY, TYPING_LEAD, presenceStore, senderAt, useChatStore, type Person } from './store/chat';
4	
5	const everyMs = Number(new URLSearchParams(location.search).get('tick') ?? 200);
6	
7	// A worker stands in for the chat socket: its messages reach the page as `message` events, like a WebSocket's.
8	const source = `let step = 0; setInterval(() => postMessage({ step: ++step }), ${everyMs});`;
9	
10	const IDLE: Person[][] = [[], ['Anna'], [], ['Boris', 'Chen'], []];
11	
12	/** Who is typing: whoever is about to send something, and otherwise whatever the room is doing. */
13	function typingAt(step: number): Person[] {
14	  const untilArrival = ARRIVAL_EVERY - (step % ARRIVAL_EVERY);
15	  if (untilArrival <= TYPING_LEAD) return [senderAt(step + untilArrival)];
16	  return IDLE[Math.floor(step / 4) % IDLE.length];
17	}
18	
19	export function useFeed() {
20	  useEffect(() => {
21	    const socket = connectFeed();
22	    return () => socket.terminate();
23	  }, []);
24	}
25	
26	function connectFeed() {
27	  const socket = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
28	  socket.addEventListener('message', (event: MessageEvent<{ step: number }>) => {
29	    const { step } = event.data;
30	    useChatStore.getState().tick(step);
31	    store.dispatch(beat(step));
32	    if (step % ARRIVAL_EVERY === 0) store.dispatch(addActivity({ tex … [229 more]
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

**agent:** Found it. `Layout` (src/components/ChatView.tsx:61-75) holds `useState` for the composer's draft text and wraps the *entire app* in a Context whose value changes every keystroke — so every keystroke re-renders `Layout` and its whole subtree (Header, TypingLine, ChatView, sidebar, forms), even though only a tiny badge (`DraftBadge` in Header) reads `draft`, and only to check if it's non-empty. Let me confirm nothing else reads the draft text before changing it.

**→ Grep**
```
{"pattern":"useDraft|DraftContext|draftStore","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/draft.ts:4:export const DraftContext = createContext({ draft: '', setDraft: (_draft: string) => {} });
src/draft.ts:6:export const useDraft = () => useContext(DraftContext);
src/components/ChatView.tsx:2:import { DraftContext } from '../draft';
src/components/ChatView.tsx:65:    <DraftContext.Provider value={{ draft, setDraft }}>
src/components/ChatView.tsx:73:    </DraftContext.Provider>
src/components/Header.tsx:2:import { useDraft } from '../draft';
src/components/Header.tsx:19:  const { draft } = useDraft();
src/components/Composer/index.tsx:4:import { useDraft } from '../../draft';
src/components/Composer/index.tsx:17:  const { setDraft } = useDraft();
src/components/Composer/index.tsx:86:  const { setDraft } = useDraft();
```

**agent:** Now let's check the measuring guide before making the change, so I record a proper before/after comparison.

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/measuring-a-fix.md"}
```

**←**
````
1	# Measuring a fix
2	
3	Two recordings of one scenario — the code as it was, and the change — then `compare_recordings`. Do it when the cause
4	is a guess or numbers were asked for; a recording that names the root, reason and `file:line` is an answer already.
5	
6	## Route
7	
8	1. The recording with the problem — the person's, or `record_page`. Keep its id.
9	2. The change, in a git worktree when there is git (below); otherwise in place, and put back afterwards.
10	3. The same scenario on the change — `compare_recordings`' description says how to record it.
11	4. `compare_recordings` with `before: <id>`, `after: <new id>`.
12	5. A change that is not kept leaves nothing behind: `git worktree remove`, or the file as it was.
13	
14	## Worktree
15	
16	The working tree may hold someone else's changes; do not edit it for a measurement.
17	
18	```sh
19	git worktree add --detach ../<app>-fix && cd ../<app>-fix && npm ci
20	REACT_PERF_RECORDER_DIR=<abs path of the first checkout>/.agent-artifacts/perf-recorder npm run dev -- --port <other port>
21	```
22	
23	- `--detach`: no branch is made, and none is switched to.
24	- The worktree is the last commit, without uncommitted changes. When `git status` shows changes to files the page
25	  uses, record "before" in the worktree as well, before editing, so the sides differ by the fix alone.
26	- The variable puts both servers' sessions in the folder the MCP server reads; an `outDir` in the project's config
27	  overrides it — then set the s … [1124 more]
````

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:46391/?tick=150
2	
```

**agent:** Now let's record the "before" state by replaying the person's original recording against the current code.

**→ rpr:record_page**
```
{"replay":"20260928-081510-app-panel-f7cd","label":"before"}
```

**←**
```
{"id":"20260928-081718-app-record-514c","url":"http://localhost:46391/?tick=150&rpr=rec","requested":"http://localhost:46391/?tick=150","durationSec":2.3,"commits":57,"renders":478,"rendersWithoutDom":295,"rendersPerCommit":8.4,"topRoot":"Layout ×15","wasting":[{"root":"Layout","source":"src/main.tsx:10","hits":15,"instances":1,"noDomChange":0,"ownDomUnchanged":15},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","hits":15,"instances":1,"noDomChange":14},{"root":"TypingBadge","source":"src/components/Header.tsx:33","hits":6,"instances":1,"noDomChange":6}],"warnings":[]}
```

**agent:** Confirms the same picture: `Layout` renders 15 times (once per character), and every single one of those 15 renders left its own DOM unchanged (`ownDomUnchanged: 15`) — pure wasted work. Now applying the fix.

**→ Write**
```
{"file_path":"src/store/draft.ts","content":"import { createStore } from 'zustand/vanilla';\n\n/** The unsent text of the message box, for whoever needs to know there is some. */\nexport const draftStore = createStore(() => ({ draft: '' }));\n"}
```

**←**
```
File created successfully at: src/store/draft.ts (file state is current in your context — no need to Read it back)
```

**→ Write**
```
{"file_path":"src/draft.ts","content":"import { useStore } from 'zustand';\nimport { draftStore } from './store/draft';\n\n/** Whether there is unsent text in the message box; nobody outside the box needs the text itself. */\nexport const useDraft = () => useStore(draftStore, (s) => Boolean(s.draft));\n"}
```

**←**
```
The file src/draft.ts has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now update `ChatView.tsx` to drop the `useState`/Context wrapper from `Layout`:

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/ChatView.tsx","old_string":"import { useState, type ReactNode } from 'react';\nimport { DraftContext } from '../draft';\nimport { useFeed } from '../feed';","new_string":"import { type ReactNode } from 'react';\nimport { useFeed } from '../feed';"}
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

**agent:** Now update `Header.tsx`'s `DraftBadge`:

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Header.tsx","old_string":"const DraftBadge = () => {\n  const { draft } = useDraft();\n  return draft ? (","new_string":"const DraftBadge = () => {\n  const hasDraft = useDraft();\n  return hasDraft ? ("}
```

**←**
```
The file src/components/Header.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now update `Composer/index.tsx` to write to the store directly instead of through context:

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { presenceStore, useChatStore } from '../../store/chat';\nimport { useDraft } from '../../draft';\nimport { useFieldError } from './useFieldError';","new_string":"import { presenceStore, useChatStore } from '../../store/chat';\nimport { draftStore } from '../../store/draft';\nimport { useFieldError } from './useFieldError';"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"  const { field } = useController({ control, name: 'text', rules: { validate: (v) => v.trim().length > 0 || 'say something' } });\n  const { setDraft } = useDraft();\n  return (\n    <label className=\"field grow\">\n      <input\n        {...field}\n        data-testid=\"message\"\n        placeholder=\"Write a message\"\n        onChange={(e) => {\n          field.onChange(e);\n          setDraft(e.target.value);","new_string":"  const { field } = useController({ control, name: … [356 more]
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { setDraft } = useDraft();\n  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({\n    mode: 'onChange',\n    defaultValues: { text: '', replyTo: '', remindIn: '' },\n  });\n  return (\n    <form\n      className=\"composer\"\n      data-testid=\"composer\"\n      onSubmit={handleSubmit((values) => {\n        useChatStore.getState().send(values.text);\n        setDraft('');\n        reset();\n      })}\n    >","new_ … [474 more]
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's record the "after" state with the same replay and compare.

**→ rpr:record_page**
```
{"replay":"20260928-081510-app-panel-f7cd","label":"after"}
```

**←**
```
{"id":"20260928-081746-app-record-6155","url":"http://localhost:46391/?tick=150&rpr=rec","requested":"http://localhost:46391/?tick=150","durationSec":2.2,"commits":50,"renders":97,"rendersWithoutDom":21,"rendersPerCommit":1.9,"topRoot":"ComposerHints ×15","wasting":[{"root":"SendButton","source":"src/components/Composer/index.tsx:101","hits":15,"instances":1,"noDomChange":14}],"warnings":[]}
```

**agent:** Total renders dropped from 478 to 97, and `Layout` no longer appears as a wasted root at all. Let's run the formal comparison for precise before/after numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-081718-app-record-514c","after":"20260928-081746-app-record-6155"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-081718-app-record-514c","durationMs":2325},"after":{"id":"20260928-081746-app-record-6155","durationMs":2242},"totals":{"commits":"57 → 50 (-12%)","renders":"478 → 97 (-80%)","commitsPerSec":"24.52 → 22.3 (-9%)","rendersPerSec":"205.59 → 43.26 (-79%)","rendersPerCommit":"8.4 → 1.9 (-77%)","rendersWithoutDomPerSec":"126.88 → 9.37 (-93%)","rendersPerTextChange":"15.4 → 3.1 (-80%)","longTaskMaxMs":"112 → 104 (-7%)"},"roots":[{"root":"Layout","source":"src/main.tsx:10","path":"","status":"gone","hitsPerSec":"6.45 → –","perHit":"28 → –","instances":"1 → –","cascadePerSec":"180.65 → 0 (-100%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:106","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.69","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 13.38"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:100","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.69","perHit":"– → 1","instances":"– → 1","cascadePerSec":"0 → 6.69"},{"root":"SendButton","source":"src/components/Composer/index.tsx:101","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 6.69","perHit":"– → 1","instances":"– → 1","cascadePerSec":"0 → 6.69"},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","path":"Composer < ChatView < SettingsBySync","status":"gone","hitsPerSec":"6.45 →  … [3808 more]
```

**agent:** Fixed. Here's what was wrong and what changed.

**Root cause**

`Layout` in `src/components/ChatView.tsx` held the composer's draft text in `useState` and wrapped the *entire app* in a `DraftContext.Provider` whose value changed on every keystroke. Since `Layout` sits at the very top of the tree (`src/main.tsx:10`), every character typed re-rendered `Layout` and cascaded, unmemoized, through `Header`, `TypingLine`, `ChatView`, the sidebar stats, activity log, and webhook form — the "whole page redraws" the report described. The recording confirmed it: `Layout` rendered 15 times for 15 keystrokes, and **all 15** left its own DOM unchanged (`ownDomUnchanged: 15`) — pure wasted work. Yet only one tiny badge (`DraftBadge` in `Header`) ever read the draft, and only to check if it was non-empty — nobody read the actual text.

**Fix**

Moved the draft flag out of React state/context into a small zustand store (`src/store/draft.ts`), matching the pattern the codebase already uses for `presenceStore`. `MessageInput`/`Composer` now write to it directly (`draftStore.setState(...)`), the same way they already call `useChatStore.getState().send(...)`. `useDraft()` now subscribes with a boolean selector, so `DraftBadge` only re-renders when the draft flips between empty and non-empty — not on every keystroke. `Layout` no longer holds any state tied to typing, so it doesn't re-render at all when typing. Nothing about what's shown changed: the badge still appears/disappears the same way, and the input itself is still driven by react-hook-form as before.

**Before/after (same recorded interaction, replayed on both versions of the code):**

| | before | after |
|---|---|---|
| total renders | 478 | 97 (-80%) |
| renders per commit | 8.4 | 1.9 (-77%) |
| renders per character typed | 29.7 | 4.1 (-86%) |
| renders/sec that changed nothing | 126.9 | 9.4 (-93%) |
| `Layout`'s cascade | 180.65 renders/sec | 0 — root gone entirely |

**Left over:** `SendButton` still re-renders once per keystroke via react-hook-form's `useFormState`, with its `disabled` attribute actually changing on only 1 of 15 renders. This is unchanged before and after my fix (same 15 hits/14-no-op both times), costs about 0.1ms per render, and is a library-internal subscription rather than app state — I left it alone since it's unrelated to the reported bug and fixing it would mean changing how the form validates, not just removing redundant work.
