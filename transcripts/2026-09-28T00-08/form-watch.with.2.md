# form-watch, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.50, 203 s, 25 turns

## The prompt

```
A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: typing a message into the message box lags.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
```

## The answer

> ## Summary
> 
> **Cause found:** `Composer` (`src/components/Composer/index.tsx`) called `watch()` directly in its render body just to compute a `filled` count for a `data-filled` debug attribute on the `<form>`. That subscribes the whole component to *every* field, so it re-rendered on every keystroke — and because `MetaInput`, `SendButton`, and `ComposerHints` aren't memoized, they all re-rendered along with it, even though almost nothing about them actually changed. The recording showed `Composer`'s own DOM (`data-filled`) unchanged in 17 of 18 keystrokes, and `MetaInput` (the reply-to/remind-in fields, unrelated to the message text) re-rendering 36 times with **zero** of those renders changing anything.
> 
> **Fix:** moved that `watch()` subscription into a tiny leaf component (`FormFilledAttr`) that reads the form values and imperatively sets the `data-filled` attribute on the form via a ref, instead of forcing the whole `Composer` tree to re-render. Nothing about what's displayed changed — same attribute, same value, same visible UI.
> 
> **Before/after** (typing "Hello there friend" into the message box, measured with `react-perf-recorder`):
> 
> | metric | before | after |
> |---|---|---|
> | renders | 197 | 107 (**-46%**) |
> | renders/sec | 142.9 | 78.5 (**-45%**) |
> | renders with no DOM change /sec | 77.6 | 25.7 (**-67%**) |
> | renders per keystroke | 10.1 | 5.1 (**-50%**) |
> | `Composer` cascade | 91.4/s | 0 (**gone**) |
> | `MetaInput` renders | 36 (all wasted) | 0 (no longer renders on typing) |
> 
> One small residual remains: `SendButton` still re-renders ~17/18 keystrokes with the same `isValid` value, but that's driven by the app's own `trigger()` call on every keystroke (intentionally re-validating the reply/remind fields against the message text, per the existing code comment) — fixing that would change validation behavior, so I left it as-is.

## What it changed

```
diff -ruN a/src/components/Composer/index.tsx b/src/components/Composer/index.tsx
--- a/src/components/Composer/index.tsx
+++ b/src/components/Composer/index.tsx
@@ -1,4 +1,4 @@
-import { memo, type ReactNode } from 'react';
+import { memo, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
 import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
 import { presenceStore, useChatStore } from '../../store/chat';
 import { draftStore } from '../../store/draft';
@@ -81,17 +81,28 @@
   );
 };
 
+// Keeps the form's own `data-filled` attribute in sync without subscribing the whole
+// Composer (and its unmemoized children) to every field on every keystroke.
+const FormFilledAttr = ({ control, formRef }: { control: FormControl; formRef: RefObject<HTMLFormElement | null> }) => {
+  const values = useWatch({ control });
+  useLayoutEffect(() => {
+    formRef.current?.setAttribute('data-filled', String(Object.values(values).filter(Boolean).length));
+  });
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
@@ -107,6 +118,7 @@
         <MetaInput control={control} name="remindIn" />
         <ComposerHints control={control} />
       </div>
+      <FormFilledAttr control={control} formRef={formRef} />
     </form>
   );
 };
```

## The steps

**agent:** I'll use the react-perf-recorder skill, which is built exactly for diagnosing unnecessary re-renders and proving fixes with numbers.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Investigate why typing in the message box lags. Find any components re-rendering for nothing, fix the root cause in ./src without changing what the page displays, and show before/after numbers proving the fix worked. The dev server URL is in ./dev-url.txt."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4221 more]

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ Read**
```
{"file_path":"./dev-url.txt"}
```

**←**
```
1	http://localhost:45511/?tick=150
2	
```

**→ Grep**
```
{"pattern":"message|Message","path":"./src","output_mode":"files_with_matches"}
```

**←**
```
Found 13 files
src/components/Composer/index.tsx
src/components/ChatPanel.tsx
src/feed.ts
src/hooks/useMessageCount.ts
src/store/activity.ts
src/store/chat.ts
src/store/draft.ts
src/store/selectors.ts
src/app.css
src/components/ChatView.tsx
src/components/Composer/useFieldError.ts
src/components/MessageCount.tsx
src/components/Messages.tsx
```

**→ rpr:list_recordings**
```
{"limit":10}
```

**←**
```
{"dir":"/tmp/tmp.VHVbZKgKac","total":40,"recordings":[{"id":"20260928-001632-app-panel-3169","status":"recording","createdAt":"2026-09-28T00:16:32.944Z","source":"panel","url":"http://localhost:46495/?tick=150","area":"whole app","durationSec":0,"actions":0,"commits":0,"renders":0,"topRoot":null,"plugins":["zustand","proxy-memoize","react-query","redux"],"bytes":918},{"id":"20260928-001605-app-record-5eb5","status":"done","createdAt":"2026-09-28T00:16:05.649Z","source":"script:record","label":"after","url":"http://localhost:33829/?tick=150","area":"whole app","durationSec":5,"actions":0,"commits":43,"renders":66,"topRoot":"SyncBar ×33 · external store #2 [useChatStore] (s)=>s.workspace.lastEventAt","plugins":["zustand","proxy-memoize","react-query","redux"],"bytes":42402},{"id":"20260928-001548-app-panel-4ef1","status":"done","createdAt":"2026-09-28T00:15:48.746Z","source":"panel","url":"http://localhost:44531/?tick=150","area":"whole app","durationSec":1.6,"actions":1,"commits":58,"renders":169,"topRoot":"MetaInput ×43 · state #12","plugins":["zustand","proxy-memoize","react-query","redux"],"bytes":80800},{"id":"20260928-001547-app-record-2839","status":"done","createdAt":"2026-09-28T00:15:47.529Z","source":"script:record","label":"before","url":"http://localhost:33829/?tick=150","area":"whole app","durationSec":5,"actions":0,"commits":43,"renders":76,"topRoot":"SyncBar ×33 · external store #2 [useChatStore] (s)=>s.workspace.lastEventAt","plugins":["zustand","proxy-memoize", … [2414 more]
```

**→ Read**
```
{"file_path":"./src/components/Composer/index.tsx"}
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

**→ Read**
```
{"file_path":"./src/components/ChatView.tsx"}
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
{"file_path":"./src/components/ChatPanel.tsx"}
```

**←**
```
1	import { memo, useCallback } from 'react';
2	import { useSearchParams } from 'react-router-dom';
3	import { MessageList, PeopleList } from './Messages';
4	
5	export const useActiveTab = () => {
6	  const [params, setParams] = useSearchParams();
7	  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
8	  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);
9	  return [tab, select] as const;
10	};
11	
12	const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
13	  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
14	    {name}
15	  </button>
16	));
17	
18	export const ChatPanel = () => {
19	  const [tab, setTab] = useActiveTab();
20	  return (
21	    <section className="panel" data-testid="chat-panel">
22	      <div className="tabs" role="tablist">
23	        {['chat', 'people'].map((name) => (
24	          <Tab key={name} name={name} active={tab === name} onPick={setTab} />
25	        ))}
26	      </div>
27	      {tab === 'chat' ? <MessageList /> : <PeopleList />}
28	    </section>
29	  );
30	};
31	
```

**→ Read**
```
{"file_path":"./src/store/draft.ts"}
```

**←**
```
1	import { createStore } from 'zustand/vanilla';
2	
3	/** Whether the message box holds unsent text. */
4	export const draftStore = createStore(() => ({ hasDraft: false }));
5	
```

**→ Read**
```
{"file_path":"./src/store/chat.ts"}
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
{"file_path":"./src/components/Messages.tsx"}
```

**←**
```
1	import { memo, useMemo } from 'react';
2	import { memoize } from 'proxy-memoize';
3	import { messageInfo, selectMessageIds, selectSeen } from '../store/selectors';
4	import { useChatStore, type Chat } from '../store/chat';
5	import { useSettings } from './Settings';
6	import { TimeAgo } from './TimeAgo';
7	
8	function useMessageInfo(id: string) {
9	  const select = useMemo(() => memoize((s: Chat) => messageInfo(s, id)), [id]);
10	  return useChatStore(select);
11	}
12	
13	const Status = memo(({ id }: { id: string }) => {
14	  const info = useMessageInfo(id);
15	  const seen = useChatStore(selectSeen);
16	  return (
17	    <span className="status" title={seen ? 'read by everyone' : 'sent'}>
18	      ♥ <b>{info.reactions}</b> {seen ? '✓✓' : '✓'}
19	    </span>
20	  );
21	});
22	
23	const NO_FILES: string[] = [];
24	
25	const Attachments = memo(({ id }: { id: string }) => {
26	  const files = useChatStore((s) => s.attachmentsById[id] ?? NO_FILES);
27	  return files.length ? <span className="files">📎 {files.join(', ')}</span> : null;
28	});
29	
30	export const MessageRow = memo(({ id }: { id: string }) => {
31	  const message = useChatStore((s) => s.messageById[id]);
32	  const { dense } = useSettings();
33	  return (
34	    <li className={dense ? 'message dense' : 'message'} data-testid={`message-${id}`}>
35	      <span className="avatar">{message.from[0]}</span>
36	      <span className="body">
37	        <span className="who">
38	          {message.from}
39	          <TimeA … [951 more]
```

**→ Read**
```
{"file_path":"./src/store/selectors.ts"}
```

**←**
```
1	import { memoize } from 'proxy-memoize';
2	import type { Chat } from './chat';
3	
4	export const selectWorkspace = (s: Chat) => s.workspace;
5	export const selectUnread = (s: Chat) => s.workspace.unread;
6	
7	export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));
8	
9	export const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });
10	
11	export const selectSeen = (s: Chat) => s.workspace.unread < 13;
12	
```

**→ Read**
```
{"file_path":"./src/hooks/useMessageCount.ts"}
```

**←**
```
1	import { useChannel } from '../lib/channel';
2	
3	const countOf = (byId: Record<string, unknown>) => Object.keys(byId).length;
4	
5	export function useMessageCount() {
6	  return useChannel((chat) => countOf(chat.messageById));
7	}
8	
```

**→ Read**
```
{"file_path":"./src/feed.ts"}
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

**agent:** Now I'll record the page ourselves, typing into the message input, to see what re-renders.

**→ rpr:record_page**
```
{"url":"http://localhost:45511/?tick=150","label":"before","script":"export default async (page) => {\n  const input = page.locator('[data-testid=\"message\"]');\n  await input.click();\n  await input.pressSequentially('Hello there friend', { delay: 60 });\n};"}
```

**←**
```
{"id":"20260928-001725-app-record-5403","url":"http://localhost:45511/?tick=150","requested":"http://localhost:45511/?tick=150","durationSec":1.4,"commits":65,"renders":197,"rendersWithoutDom":107,"rendersPerCommit":3,"topRoot":"Composer ×18","wasting":[{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","hits":36,"instances":1,"noDomChange":36},{"root":"Composer","source":"src/components/ChatView.tsx:26","hits":18,"instances":1,"noDomChange":0,"ownDomUnchanged":17},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","hits":18,"instances":1,"noDomChange":17}],"warnings":[]}
```

**→ rpr:get_recording**
```
{"id":"latest"}
```

**←**
```
{"warning":"\"latest\" is 20260928-001725-app-record-5403 on localhost:45511; localhost:41959, localhost:42887, localhost:46495 were recorded in the same ten minutes — someone else may record into this folder: pass the id record_page returned","id":"20260928-001725-app-record-5403","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-001725-app-record-5403","summary":{"id":"20260928-001725-app-record-5403","status":"done","createdAt":"2026-09-28T00:17:27.167Z","label":"before","source":"script:record","url":"http://localhost:45511/?tick=150","viewport":"1280×720","durationSec":1.4,"scope":null,"totals":{"commits":65,"commitsPerSec":47.14,"commitsInScope":65,"renders":197,"rendersPerScopeCommit":3,"rendersFromOutside":0,"rendersWithoutDom":107,"domTextChanges":25,"rendersPerTextChange":7.9},"topRoots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","hits":18,"hitsPerSec":13.05,"instances":1,"perHit":7,"noDomChange":0,"ownDomUnchanged":17,"renderMsPerHit":0.65,"reasons":["18× state #2 · [react-hook-form] useForm › State @ src/components/Composer/index.tsx:85 const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({"],"causes":["18× zustand:draftStore.setState","18× core:input input"],"lanes":"Sync:18"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","path":"Composer < ChatView < SettingsBySync < Layout","hits":36,"hitsPerSec":26.11,"instances":1,"perHit":1,"noDomChange":36, … [7338 more]
```

**→ rpr:get_recording**
```
{"id":"latest","section":"components"}
```

**←**
```
{"warning":"\"latest\" is 20260928-001748-app-panel-4d38 on localhost:34425; localhost:45511, localhost:41959, localhost:42887 were recorded in the same ten minutes — someone else may record into this folder: pass the id record_page returned","id":"20260928-001748-app-panel-4d38","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-001748-app-panel-4d38","components":{"total":12,"offset":0,"items":[{"name":"MessageInput","renders":45,"withoutDom":30,"byParent":15,"reasons":[{"i":3,"n":15,"reason":"parent: props new ref, same content: trigger"},{"i":6,"n":15,"reason":"state #12 SAME-CONTENT"},{"i":7,"n":15,"reason":"state #12"}],"chains":[{"n":15,"way":"zustand:draftStore.setState › Composer · state useForm › MessageInput · new ref, same content trigger"}]},{"name":"SendButton","renders":30,"withoutDom":29,"byParent":15,"reasons":[{"i":4,"n":15,"reason":"parent: same props, memo would skip it"},{"i":9,"n":14,"reason":"state #0 SAME-CONTENT"},{"i":8,"n":1,"reason":"state #0"}],"chains":[{"n":15,"way":"zustand:draftStore.setState › Composer · state useForm › SendButton · props equal"}]},{"name":"MetaInput","renders":30,"withoutDom":30,"byParent":30,"reasons":[{"i":4,"n":30,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":30,"way":"zustand:draftStore.setState › Composer · state useForm › MetaInput · props equal"}]},{"name":"Composer","renders":15,"withoutDom":0,"byParent":0,"reasons":[{"i":2,"n":15,"reason":"state #2"}]},{"name":"ComposerHints","renders":15,"with … [1029 more]
```

**agent:** The "latest" pointer got clobbered by another concurrent session. Let me re-fetch using my own recording's explicit id.

**→ rpr:get_recording**
```
{"id":"20260928-001725-app-record-5403","section":"components"}
```

**←**
```
{"id":"20260928-001725-app-record-5403","status":"done","dir":"/tmp/tmp.VHVbZKgKac/20260928-001725-app-record-5403","components":{"total":12,"offset":0,"items":[{"name":"MessageInput","renders":54,"withoutDom":36,"byParent":18,"reasons":[{"i":2,"n":18,"reason":"parent: props new ref, same content: trigger"},{"i":5,"n":18,"reason":"state #12 SAME-CONTENT"},{"i":6,"n":18,"reason":"state #12"}],"chains":[{"n":18,"way":"zustand:draftStore.setState › Composer · state useForm › MessageInput · new ref, same content trigger"}]},{"name":"SendButton","renders":36,"withoutDom":35,"byParent":18,"reasons":[{"i":3,"n":18,"reason":"parent: same props, memo would skip it"},{"i":9,"n":17,"reason":"state #0 SAME-CONTENT"},{"i":7,"n":1,"reason":"state #0"}],"chains":[{"n":18,"way":"zustand:draftStore.setState › Composer · state useForm › SendButton · props equal"}]},{"name":"MetaInput","renders":36,"withoutDom":36,"byParent":36,"reasons":[{"i":3,"n":36,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":36,"way":"zustand:draftStore.setState › Composer · state useForm › MetaInput · props equal"}]},{"name":"Composer","renders":18,"withoutDom":0,"byParent":0,"reasons":[{"i":1,"n":18,"reason":"state #2"}]},{"name":"ComposerHints","renders":18,"withoutDom":0,"byParent":18,"reasons":[{"i":3,"n":18,"reason":"parent: same props, memo would skip it"}],"chains":[{"n":18,"way":"zustand:draftStore.setState › Composer · state useForm › ComposerHints · props equal"}]},{"name":"StatRow","render … [787 more]
```

**agent:** I've identified the cause. The `Composer` component calls `watch()` (no args) directly in its render body just to compute a `data-filled` count — this subscribes the whole component to every field on every keystroke, and since `MetaInput`, `SendButton`, `ComposerHints`, and `MessageInput` aren't memoized, they all re-render along with it even though their own props never change. The recording data confirms it: `Composer` re-rendered 18 times for 18 keystrokes with `ownDomUnchanged: 17/18`, and `MetaInput` re-rendered 36 times (2 instances × 18) with **all 36** producing no DOM change at all — pure waste.

Let me fix it by isolating that `watch()` subscription into a leaf component that updates the DOM attribute directly via a ref, instead of forcing the whole form to re-render.

**→ Edit**
```
{"replace_all":false,"file_path":"./src/components/Composer/index.tsx","old_string":"import { memo, type ReactNode } from 'react';\nimport { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';","new_string":"import { memo, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';\nimport { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';"}
```

**←**
```
The file ./src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"./src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({\n    mode: 'onChange',\n    defaultValues: { text: '', replyTo: '', remindIn: '' },\n  });\n  const filled = Object.values(watch()).filter(Boolean).length;\n  return (\n    <form\n      className=\"composer\"\n      data-testid=\"composer\"\n      data-filled={filled}\n      onSubmit={handleSubmit((values) => {\n        useChatStore.getState().send(values.text);\n        draftStore.setState({ h … [1970 more]
```

**←**
```
The file ./src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's re-record the same scenario after the fix and compare the two.

**→ rpr:record_page**
```
{"url":"http://localhost:45511/?tick=150","label":"after","script":"export default async (page) => {\n  const input = page.locator('[data-testid=\"message\"]');\n  await input.click();\n  await input.pressSequentially('Hello there friend', { delay: 60 });\n};"}
```

**←**
```
{"id":"20260928-001912-app-record-0b6e","url":"http://localhost:45511/?tick=150","requested":"http://localhost:45511/?tick=150","durationSec":1.4,"commits":47,"renders":107,"rendersWithoutDom":35,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×18","wasting":[{"root":"FormFilledAttr","source":"src/components/Composer/index.tsx:121","hits":18,"instances":1,"noDomChange":18},{"root":"SendButton","source":"src/components/Composer/index.tsx:114","hits":18,"instances":1,"noDomChange":17}],"warnings":[]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-001725-app-record-5403","after":"20260928-001912-app-record-0b6e"}
```

**←**
```
{"comparable":true,"warnings":[],"before":{"id":"20260928-001725-app-record-5403","durationMs":1379},"after":{"id":"20260928-001912-app-record-0b6e","durationMs":1363},"totals":{"commits":"65 → 47 (-28%)","renders":"197 → 107 (-46%)","commitsPerSec":"47.14 → 34.48 (-27%)","rendersPerSec":"142.86 → 78.5 (-45%)","rendersPerCommit":"3 → 2.3 (-23%)","rendersWithoutDomPerSec":"77.59 → 25.68 (-67%)","rendersPerTextChange":"7.9 → 4.3 (-46%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"13.05 → –","perHit":"7 → –","instances":"1 → –","cascadePerSec":"91.37 → 0 (-100%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:119","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 13.21","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 26.41"},{"root":"FormFilledAttr","source":"src/components/Composer/index.tsx:121","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 13.21","perHit":"– → 1","instances":"– → 1","cascadePerSec":"0 → 13.21"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:113","path":"Composer < ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"26.11 → 13.21 (-49%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"26.11 → 13.21 (-49%)"},{"root":"SendButton","source":"src/components/Composer/index.tsx:114" … [3444 more]
```

**→ Read**
```
{"file_path":"./src/components/Composer/index.tsx"}
```

**←**
```
1	import { memo, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
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
38	function useMetaField(control: For … [3242 more]
```

**agent:** ## Summary

**Cause found:** `Composer` (`src/components/Composer/index.tsx`) called `watch()` directly in its render body just to compute a `filled` count for a `data-filled` debug attribute on the `<form>`. That subscribes the whole component to *every* field, so it re-rendered on every keystroke — and because `MetaInput`, `SendButton`, and `ComposerHints` aren't memoized, they all re-rendered along with it, even though almost nothing about them actually changed. The recording showed `Composer`'s own DOM (`data-filled`) unchanged in 17 of 18 keystrokes, and `MetaInput` (the reply-to/remind-in fields, unrelated to the message text) re-rendering 36 times with **zero** of those renders changing anything.

**Fix:** moved that `watch()` subscription into a tiny leaf component (`FormFilledAttr`) that reads the form values and imperatively sets the `data-filled` attribute on the form via a ref, instead of forcing the whole `Composer` tree to re-render. Nothing about what's displayed changed — same attribute, same value, same visible UI.

**Before/after** (typing "Hello there friend" into the message box, measured with `react-perf-recorder`):

| metric | before | after |
|---|---|---|
| renders | 197 | 107 (**-46%**) |
| renders/sec | 142.9 | 78.5 (**-45%**) |
| renders with no DOM change /sec | 77.6 | 25.7 (**-67%**) |
| renders per keystroke | 10.1 | 5.1 (**-50%**) |
| `Composer` cascade | 91.4/s | 0 (**gone**) |
| `MetaInput` renders | 36 (all wasted) | 0 (no longer renders on typing) |

One small residual remains: `SendButton` still re-renders ~17/18 keystrokes with the same `isValid` value, but that's driven by the app's own `trigger()` call on every keystroke (intentionally re-validating the reply/remind fields against the message text, per the existing code comment) — fixing that would change validation behavior, so I left it as-is.
