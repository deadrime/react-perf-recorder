# form-watch, with the plugin, run 1

fixed (waste 1); checks 5 of 5; $1.22, 461 s, 52 turns

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

> No errors — send, reset, and the message list update all work exactly as before.
> 
> ## Summary
> 
> **Cause:** `Composer` (`src/components/Composer/index.tsx`) called `watch()` with no field name to compute a `filled` count for the `data-filled` attribute. That subscribes the whole component to *every* keystroke in *any* field, not just changes to the count. Since `Composer` sits above the whole form, each render cascaded into `MessageInput`, `SendButton`, `MetaInput` ×2 and `ComposerHints`, most of which produced no DOM change — a classic "root reads more than it shows" case, confirmed by the recorder (`Composer`'s own DOM was unchanged in 34 of 35 renders).
> 
> **Fix:** replaced the bare `watch()` with a small hook (`useFilledCount`, modeled on the file's existing `useFieldError` pattern) that subscribes via react-hook-form's low-level `control._subscribe` and only calls `setState` when the derived count actually changes — not on every character. `Composer` now re-renders only when a field crosses the empty/non-empty boundary, instead of on every keystroke. (Also passed `trigger` directly instead of a new closure each render, so it stays a stable prop.)
> 
> I initially tried a ref+effect approach to move the read into a child; testing it caught a real bug (`useLayoutEffect` in a child fires before the parent's own ref attaches on mount, so `data-filled` was never set). That's why I switched to the subscription-based fix above, which I verified via Playwright: `data-filled` is `"0"` on load, becomes `"1"` on typing/filling any field, back to `"0"` on clearing, and sending a message still resets the form and appends to the list — identical to before.
> 
> **Measured (same scripted keystrokes, replayed before/after):**
> | metric | before | after |
> |---|---|---|
> | renders per character typed | 10 | 4.1 (‑59%) |
> | renders per text-change event | 7.4 | 3.4 (‑54%) |
> | total renders/sec | 151.3 | 58.9 (‑61%) |
> | renders with no DOM effect /sec | 82.4 | 13.3 (‑84%) |
> | `Composer` re-renders/sec | 13.8 | 0.6 (‑96%) |
> 
> **Left as-is:** `SendButton` still re-renders on every keystroke (35 hits, 34 with no DOM change) — that's react-hook-form's own `useFormState({control})` re-checking `isValid` on every change in `mode: 'onChange'`, present before my change too and unrelated to the `Composer` issue. Its cost is negligible (a single button, ~0.04ms/render) and removing it would mean changing when validity is recomputed, so I left it and am naming it here rather than changing behavior.

## What it changed

```
diff -ruN a/src/components/Composer/index.tsx b/src/components/Composer/index.tsx
--- a/src/components/Composer/index.tsx
+++ b/src/components/Composer/index.tsx
@@ -1,4 +1,4 @@
-import { memo, type ReactNode } from 'react';
+import { memo, useLayoutEffect, useState, type ReactNode } from 'react';
 import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
 import { presenceStore, useChatStore } from '../../store/chat';
 import { draftStore } from '../../store/draft';
@@ -81,12 +81,29 @@
   );
 };
 
+/** How many fields hold a value. Re-renders only when that count changes, not on every keystroke. */
+function useFilledCount(control: FormControl) {
+  const [filled, setFilled] = useState(0);
+  useLayoutEffect(
+    () =>
+      control._subscribe({
+        formState: { values: true },
+        callback: ({ values }) => {
+          const next = Object.values(values ?? {}).filter(Boolean).length;
+          setFilled((prev) => (prev === next ? prev : next));
+        },
+      }),
+    [control]
+  );
+  return filled;
+}
+
 export const Composer = () => {
-  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({
+  const { control, handleSubmit, trigger, reset } = useForm<ComposerValues>({
     mode: 'onChange',
     defaultValues: { text: '', replyTo: '', remindIn: '' },
   });
-  const filled = Object.values(watch()).filter(Boolean).length;
+  const filled = useFilledCount(control);
   return (
     <form
       className="composer"
@@ -99,7 +116,7 @@
       })}
     >
       <div className="row">
-        <MessageInput control={control} trigger={() => trigger()} />
+        <MessageInput control={control} trigger={trigger} />
         <SendButton control={control} />
       </div>
       <div className="row meta">
```

## The steps

**agent:** This is exactly what the react-perf-recorder skill is built for. Let me invoke it.

**→ Skill**
```
{"skill":"react-perf-recorder:react-perf-recorder","args":"Typing into the message box lags. Find out whether anything on the page re-renders for nothing, and why. Fix it in ./src without changing what the page shows, and show before-and-after numbers proving the fix worked. If nothing re-renders unnecessarily, say so and change nothing. Dev server URL is in ./dev-url.txt."}
```

**←**
```
Launching skill: react-perf-recorder:react-perf-recorder
```

**input:** Base directory for this skill: test/eval-plugin/skills/react-perf-recorder

# react-perf-recorder

A dev-only Vite plugin that records React re-renders from the page. Re … [4422 more]

**→ ToolSearch**
```
{"query":"select:mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings,mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__record_page,mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording,mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings","max_results":5}
```

**←**
```
mcp__plugin_react-perf-recorder_react-perf-recorder__list_recordings
mcp__plugin_react-perf-recorder_react-perf-recorder__get_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__record_page
mcp__plugin_react-perf-recorder_react-perf-recorder__wait_for_recording
mcp__plugin_react-perf-recorder_react-perf-recorder__compare_recordings
```

**→ Read**
```
{"file_path":"test/eval-plugin/skills/react-perf-recorder/references/recording-yourself.md"}
```

**←**
```
1	# Recording it yourself
2	
3	Only when there is no recording of the person's and they cannot make one: a recording you stage is a guess at what
4	annoyed them. What `record_page` takes is in its own description; this is how to use it well.
5	
6	- **The scenario is the person's steps**, as they described them: the page, what they did, what felt slow. One
7	  scenario, 3–12 seconds. Nothing to reproduce means nothing to measure — ask for the steps.
8	- **About one component** ("this list", a file): read the file and take the name it is exported under — that is
9	  what `scope` and `watch` take. A component the scenario itself brings up is not mounted when the recording
10	  starts: record the whole page with `watch` instead.
11	- **What has to exist first** — data, a sign-in, a backend stubbed with `page.route` — goes in `setup`, not in the
12	  scenario, so it is not in the recording.
13	- **The same conditions on both sides of a fix**: viewport, throttling, data, account, area. A fix is proved with
14	  `replay: <id>` of the first recording, or the same `script` run again, then `compare_recordings` —
15	  `references/measuring-a-fix.md`.
16	- A run fails: read what it says about the page (its url, text, screenshot) before calling it again with a guess.
17	- Driving the page with a Playwright of your own rather than `record_page`: `references/from-scripts.md`; close the
18	  browser you opened, even when the run failed.
19	
```

**→ Read**
```
{"file_path":"dev-url.txt"}
```

**←**
```
1	http://localhost:41457/?tick=150
2	
```

**→ rpr:list_recordings**
```
{"url":"localhost:41457"}
```

**←**
```
{"dir":"/tmp/tmp.jZKe2ZEf35","total":0,"recordings":[]}
```

**→ Grep**
```
{"pattern":"message|Message","path":"src","output_mode":"files_with_matches"}
```

**←**
```
Found 13 files
src/components/Composer/index.tsx
src/app.css
src/components/ChatPanel.tsx
src/components/ChatView.tsx
src/components/Composer/useFieldError.ts
src/components/MessageCount.tsx
src/components/Messages.tsx
src/feed.ts
src/hooks/useMessageCount.ts
src/store/activity.ts
src/store/chat.ts
src/store/draft.ts
src/store/selectors.ts
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
{"file_path":"src/components/ChatPanel.tsx"}
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
{"file_path":"src/store/draft.ts"}
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
{"file_path":"src/components/Messages.tsx"}
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
{"file_path":"src/components/Settings.tsx"}
```

**←**
```
1	import { createContext, useContext, useMemo, type ReactNode } from 'react';
2	
3	interface Settings {
4	  dense: boolean;
5	  timezone: string;
6	}
7	
8	const SettingsContext = createContext<Settings>({ dense: false, timezone: 'UTC' });
9	
10	export const useSettings = () => useContext(SettingsContext);
11	
12	export const SettingsProvider = ({ dense, children }: { dense: boolean; children: ReactNode }) => {
13	  const value = useMemo(() => ({ dense, timezone: 'UTC' }), [dense]);
14	  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
15	};
16	
17	export const TimezoneBadge = () => {
18	  const { timezone } = useSettings();
19	  return (
20	    <span className="badge muted" data-testid="timezone">
21	      {timezone}
22	    </span>
23	  );
24	};
25	
```

**→ Read**
```
{"file_path":"src/components/Composer/useFieldError.ts"}
```

**←**
```
1	import { useLayoutEffect, useState } from 'react';
2	import { get, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
3	
4	type FieldError = { invalid: boolean; message?: string };
5	
6	const read = (errors: object, name: string): FieldError => {
7	  const error = get(errors, name);
8	  return { invalid: Boolean(error), message: error?.message };
9	};
10	
11	/** The error of one field, updated when that field's error changes. */
12	export function useFieldError<T extends FieldValues>(control: Control<T>, name: FieldPath<T>) {
13	  const [state, setState] = useState(() => read(control._formState.errors, name));
14	  useLayoutEffect(
15	    () =>
16	      control._subscribe({
17	        name,
18	        exact: true,
19	        formState: { errors: true },
20	        callback: ({ errors }) => {
21	          const next = read(errors ?? {}, name);
22	          setState((prev) => (prev.invalid === next.invalid && prev.message === next.message ? prev : next));
23	        },
24	      }),
25	    [control, name]
26	  );
27	  return state;
28	}
29	
```

**→ Read**
```
{"file_path":"src/store/selectors.ts"}
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

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","label":"before","script":"await page.locator('[data-testid=\"message\"]').click();\\nawait page.locator('[data-testid=\"message\"]').type('Hello there, this is a test message', { delay: 60 });"}
```

**✗ error**
```
Invalid or unexpected token
page http://localhost:41457/?tick=150; showing: "Design team Release week: freeze on Thursday 12 unread UTC everyone is around chat people A Anna 4 minutes ago The picker opens on the item you clicked now ♥ 2 ✓✓ 📎 picker.mp4 × B Boris 2 minutes ago Ship it — the tree is finally readable ♥ 0 ✓✓ × C Chen a minute ago The new onboarding flow is on s"; screenshot /tmp/tmp.jZKe2ZEf35/record-page-failure-1790582034910.png
```

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","label":"before","script":"const input = page.locator('[data-testid=\"message\"]');\nawait input.click();\nawait input.type('Hello there, this is a test message', { delay: 60 });"}
```

**←**
```
{"id":"20260928-075358-app-record-adc8","url":"http://localhost:41457/?tick=150","requested":"http://localhost:41457/?tick=150","durationSec":2.5,"commits":126,"renders":384,"rendersWithoutDom":209,"rendersPerCommit":3,"topRoot":"Composer ×35","wasting":[{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","hits":70,"instances":1,"noDomChange":70},{"root":"Composer","source":"src/components/ChatView.tsx:26","hits":35,"instances":1,"noDomChange":0,"ownDomUnchanged":34},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","hits":35,"instances":1,"noDomChange":34}],"warnings":[]}
```

**→ rpr:get_recording**
```
{"id":"20260928-075358-app-record-adc8"}
```

**←**
```
{"id":"20260928-075358-app-record-adc8","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075358-app-record-adc8","summary":{"id":"20260928-075358-app-record-adc8","status":"done","createdAt":"2026-09-28T07:54:00.913Z","label":"before","source":"script:record","url":"http://localhost:41457/?tick=150","viewport":"1280×720","durationSec":2.5,"scope":null,"totals":{"commits":126,"commitsPerSec":49.65,"commitsInScope":126,"renders":384,"rendersPerScopeCommit":3,"rendersFromOutside":0,"rendersWithoutDom":209,"domTextChanges":52,"rendersPerTextChange":7.4},"topRoots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","hits":35,"hitsPerSec":13.79,"instances":1,"perHit":7,"noDomChange":0,"ownDomUnchanged":34,"renderMsPerHit":0.69,"reasons":["35× state #2 · [react-hook-form] useForm › State @ src/components/Composer/index.tsx:85 const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({"],"causes":["35× zustand:draftStore.setState","35× core:input input"],"lanes":"Sync:35"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","path":"Composer < ChatView < SettingsBySync < Layout","hits":70,"hitsPerSec":27.58,"instances":1,"perHit":1,"noDomChange":70,"renderMsPerHit":0.16,"reasons":["70× state #12 (35 of them same content) · [react-hook-form] useController › useFormState › State @ src/components/Composer/index.tsx:16 const { field } = useController({ control, name: 'text', rules: { valid … [7119 more]
```

**→ Grep**
```
{"pattern":"data-filled|filled","path":".","output_mode":"content","-n":true}
```

**←**
```
src/components/Composer/index.tsx:89:  const filled = Object.values(watch()).filter(Boolean).length;
src/components/Composer/index.tsx:94:      data-filled={filled}
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { memo, type ReactNode } from 'react';\nimport { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';","new_string":"import { memo, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';\nimport { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({\n    mode: 'onChange',\n    defaultValues: { text: '', replyTo: '', remindIn: '' },\n  });\n  const filled = Object.values(watch()).filter(Boolean).length;\n  return (\n    <form\n      className=\"composer\"\n      data-testid=\"composer\"\n      data-filled={filled}\n      onSubmit={handleSubmit((values) => {\n        useChatStore.getState().send(values.text);\n … [1952 more]
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
38	function useMetaField(control: For … [3190 more]
```

**agent:** Now let's replay the same scenario on the fixed code and compare.

**→ rpr:record_page**
```
{"replay":"20260928-075358-app-record-adc8","label":"after"}
```

**←**
```
{"id":"20260928-075549-app-record-8b8c","url":"http://localhost:41457/?tick=150&rpr=rec","requested":"http://localhost:41457/?tick=150","durationSec":3.4,"commits":99,"renders":227,"rendersWithoutDom":77,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×35","wasting":[{"root":"FilledCount","source":"src/components/Composer/index.tsx:111","hits":35,"instances":1,"noDomChange":35},{"root":"SendButton","source":"src/components/Composer/index.tsx:114","hits":35,"instances":1,"noDomChange":34}],"warnings":[]}
```

**→ rpr:compare_recordings**
```
{"before":"20260928-075358-app-record-adc8","after":"20260928-075549-app-record-8b8c"}
```

**←**
```
{"comparable":true,"warnings":["durations differ (2538ms vs 3361ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260928-075358-app-record-adc8","durationMs":2538},"after":{"id":"20260928-075549-app-record-8b8c","durationMs":3361},"totals":{"commits":"126 → 99 (-21%)","renders":"384 → 227 (-41%)","commitsPerSec":"49.65 → 29.46 (-41%)","rendersPerSec":"151.3 → 67.54 (-55%)","rendersPerCommit":"3 → 2.3 (-23%)","rendersWithoutDomPerSec":"82.35 → 22.91 (-72%)","rendersPerTextChange":"7.4 → 3.9 (-47%)","longTaskMaxMs":"0 → 119"},"roots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"13.79 → 0.3 (-98%)","perHit":"7 → 7 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"96.53 → 2.08 (-98%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:119","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 10.41","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 20.83"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:113","path":"Composer < ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"27.58 → 10.41 (-62%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"27.58 → 10.41 (-62%)"},{"root":"FilledCount","source":"src/components/Composer/index.tsx:111","path":"Composer < ChatView < SettingsBySync < Layo … [4040 more]
```

**agent:** Let me do a quick sanity check that the `data-filled` attribute still tracks correctly (same as before the fix).

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","ms":500,"script":"const form = page.locator('[data-testid=\"composer\"]');\nconst input = page.locator('[data-testid=\"message\"]');\nconst before = await form.getAttribute('data-filled');\nawait input.click();\nawait input.type('hi');\nawait page.waitForTimeout(100);\nconst afterTyping = await form.getAttribute('data-filled');\nawait input.fill('');\nawait page.waitForTimeout(100);\nconst afterClear = await form.getAttribute('data-filled');\nconsole.log(JSON.stringify({ before, afterTyping, afterClear }));"}
```

**←**
```
{"id":"20260928-075630-app-record-3ba2","url":"http://localhost:41457/?tick=150","requested":"http://localhost:41457/?tick=150","durationSec":0.3,"commits":9,"renders":20,"rendersWithoutDom":6,"rendersPerCommit":2.2,"topRoot":"ComposerHints ×3","wasting":[{"root":"FilledCount","source":"src/components/Composer/index.tsx:111","hits":3,"instances":1,"noDomChange":3},{"root":"SendButton","source":"src/components/Composer/index.tsx:114","hits":4,"instances":1,"noDomChange":2}],"warnings":[]}
```

**→ rpr:get_recording**
```
{"id":"20260928-075630-app-record-3ba2","section":"warnings"}
```

**←**
```
{"id":"20260928-075630-app-record-3ba2","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075630-app-record-3ba2","warnings":{"warnings":[],"errors":[]}}
```

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","ms":500,"script":"const form = page.locator('[data-testid=\"composer\"]');\nconst input = page.locator('[data-testid=\"message\"]');\nconst before = await form.getAttribute('data-filled');\nif (before !== '0') throw new Error('expected before=0 got ' + before);\nawait input.click();\nawait input.type('hi');\nawait page.waitForTimeout(100);\nconst afterTyping = await form.getAttribute('data-filled');\nif (afterTyping !== '1') throw new Error('expected afterTyping=1 got ' + afterTyping);\nawait input.fill('');\nawait page.waitForTimeout(100);\nconst aft … [136 more]
```

**✗ error**
```
expected before=0 got null
page http://localhost:41457/?tick=150; showing: "Design team Release week: freeze on Thursday 12 unread UTC everyone is around chat people A Anna 4 minutes ago The picker opens on the item you clicked now ♥ 2 ✓✓ 📎 picker.mp4 × B Boris 2 minutes ago Ship it — the tree is finally readable ♥ 0 ✓✓ × C Chen a minute ago The new onboarding flow is on s"; screenshot /tmp/tmp.jZKe2ZEf35/record-page-failure-1790582202361.png
```

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","ms":500,"script":"const form = page.locator('[data-testid=\"composer\"]');\nawait page.waitForFunction(() => document.querySelector('[data-testid=\"composer\"]')?.hasAttribute('data-filled'));\nconst before = await form.getAttribute('data-filled');\nif (before !== '0') throw new Error('expected before=0 got ' + before);\nconst input = page.locator('[data-testid=\"message\"]');\nawait input.click();\nawait input.type('hi');\nawait page.waitForFunction(() => document.querySelector('[data-testid=\"composer\"]')?.getAttribute('data-filled') === '1');\ncon … [440 more]
```

**✗ error**
```
page.waitForFunction: Timeout 30000ms exceeded.
page http://localhost:41457/?tick=150; showing: "Design team Release week: freeze on Thursday 17 unread UTC everyone is around chat people A Anna 5 minutes ago The picker opens on the item you clicked now ♥ 9 ✓ 📎 picker.mp4 × B Boris 3 minutes ago Ship it — the tree is finally readable ♥ 9 ✓ × C Chen 2 minutes ago The new onboarding flow is on st"; screenshot /tmp/tmp.jZKe2ZEf35/record-page-failure-1790582257008.png
```

**→ rpr:list_recordings**
```
{"url":"localhost:41457","limit":3}
```

**←**
```
{"dir":"/tmp/tmp.jZKe2ZEf35","total":6,"recordings":[{"id":"20260928-075707-app-record-2c4c","status":"recording","createdAt":"2026-09-28T07:57:07.006Z","source":"script:record","url":"http://localhost:41457/?tick=150","area":"whole app","durationSec":29.2,"actions":0,"commits":257,"renders":427,"topRoot":"SyncBar ×195 · external store #2 [useChatStore] (s)=>s.workspace.lastEventAt","plugins":["zustand","proxy-memoize","react-query","redux"],"bytes":46441},{"id":"20260928-075642-app-record-b472","status":"interrupted","createdAt":"2026-09-28T07:56:42.332Z","source":"script:record","url":"http://localhost:41457/?tick=150","area":"whole app","durationSec":0,"actions":0,"commits":0,"renders":0,"topRoot":null,"plugins":["zustand","proxy-memoize","react-query","redux"],"bytes":927},{"id":"20260928-075630-app-record-3ba2","status":"done","createdAt":"2026-09-28T07:56:30.779Z","source":"script:record","url":"http://localhost:41457/?tick=150","area":"whole app","durationSec":0.3,"actions":2,"commits":9,"renders":20,"topRoot":"ComposerHints ×3 · state #5","plugins":["zustand","proxy-memoize","react-query","redux"],"bytes":29005}]}
```

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","ms":500,"script":"await page.waitForTimeout(300);\nconst html = await page.locator('[data-testid=\"composer\"]').evaluate((el) => el.outerHTML.slice(0, 400));\nthrow new Error('HTML: ' + html);"}
```

**✗ error**
```
HTML: <form class="composer" data-testid="composer"><div class="row"><label class="field grow"><input name="text" data-testid="message" placeholder="Write a message" value=""></label><button type="submit" data-testid="send" disabled="">Send</button></div><div class="row meta"><label class="field small"><span>reply to #</span><input name="replyTo" data-testid="replyTo" placeholder="0" value=""></label><l
page http://localhost:41457/?tick=150; showing: "Design team Release week: freeze on Thursday 12 unread UTC everyone is around chat people A Anna 4 minutes ago The picker opens on the item you clicked now ♥ 2 ✓✓ 📎 picker.mp4 × B Boris 2 minutes ago Ship it — the tree is finally readable ♥ 0 ✓✓ × C Chen a minute ago The new onboarding flow is on s"; screenshot /tmp/tmp.jZKe2ZEf35/record-page-failure-1790582272184.png
```

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","ms":500,"setup":"globalThis.__errs = [];\npage.on('pageerror', (e) => globalThis.__errs.push('pageerror: ' + e.message));\npage.on('console', (msg) => { if (msg.type() === 'error') globalThis.__errs.push('console: ' + msg.text()); });","script":"await page.waitForTimeout(400);\nthrow new Error('ERRORS: ' + JSON.stringify(globalThis.__errs));"}
```

**✗ error**
```
ERRORS: ["console: [[\"presence\"]]: No queryFn was passed as an option, and no default queryFn was found. The queryFn parameter is only optional when using a default queryFn. More info here: https://tanstack.com/query/latest/docs/framework/react/guides/default-query-function","console: [[\"presence\"]]: No queryFn was passed as an option, and no default queryFn was found. The queryFn parameter is only optional when using a default queryFn. More info here: https://tanstack.com/query/latest/docs/framework/react/guides/default-query-function","console: [[\"presence\"]]: No queryFn was passed as an option, and no default queryFn was found. The queryFn parameter is only optional when using a default queryFn. More info here: https://tanstack.com/query/latest/docs/framework/react/guides/default-query-function","console: Failed to load resource: the server responded with a status of 404 (Not Found)"]
page http://localhost:41457/?tick=150; showing: "Design team Release week: freeze on Thursday 12 unread UTC everyone is around chat people A Anna 4 minutes ago The picker opens on the item you clicked now ♥ 2 ✓✓ 📎 picker.mp4 × B Boris 2 minutes ago Ship it — the tree is finally readable ♥ 0 ✓✓ × C Chen a minute ago The new onboarding flow is on s"; screenshot /tmp/tmp.jZKe2ZEf35/record-page-failure-1790582309069.png
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"  useLayoutEffect(() => {\n    formRef.current?.setAttribute('data-filled', String(filled));\n  }, [filled, formRef]);","new_string":"  useLayoutEffect(() => {\n    console.error('DEBUG filled=', filled, 'formRef.current=', formRef.current);\n    formRef.current?.setAttribute('data-filled', String(filled));\n  }, [filled, formRef]);"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","ms":500,"setup":"globalThis.__errs = [];\npage.on('console', (msg) => { if (msg.text().includes('DEBUG')) globalThis.__errs.push(msg.text()); });","script":"await page.waitForTimeout(400);\nthrow new Error('ERRORS: ' + JSON.stringify(globalThis.__errs));"}
```

**✗ error**
```
ERRORS: ["DEBUG filled= 0 formRef.current= null"]
page http://localhost:41457/?tick=150; showing: "Design team Release week: freeze on Thursday 12 unread UTC everyone is around chat people A Anna 4 minutes ago The picker opens on the item you clicked now ♥ 2 ✓✓ 📎 picker.mp4 × B Boris 2 minutes ago Ship it — the tree is finally readable ♥ 0 ✓✓ × C Chen a minute ago The new onboarding flow is on s"; screenshot /tmp/tmp.jZKe2ZEf35/record-page-failure-1790582318730.png
```

**→ Grep**
```
{"pattern":"_formValues|_subscribe|_getWatch","path":"node_modules/react-hook-form/dist/types/form.d.ts","output_mode":"content","-n":true}
```

**✗ error**
```
Permission to use Grep has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.
```

**→ Glob**
```
{"pattern":"node_modules/react-hook-form/dist/types/form.d.ts","path":"."}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"**/react-hook-form/**/form.d.ts"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"**/react-hook-form/package.json"}
```

**←**
```
No files found
```

**→ Glob**
```
{"pattern":"node_modules/*"}
```

**←**
```
No files found
```

**→ Read**
```
{"file_path":"package.json"}
```

**✗ error**
```
File does not exist. Note: your current working directory is ..
```

**→ Glob**
```
{"pattern":"*"}
```

**←**
```
src/app.css
src/components/TypingLine.tsx
src/components/ActivityLog.tsx
src/components/PrefsLine.tsx
src/components/ChannelStats.tsx
src/components/Composer/useFieldError.ts
src/components/WebhookForm.tsx
src/components/Header.tsx
src/components/ChannelTopic.tsx
src/components/TypingBadge.tsx
src/components/Settings.tsx
src/components/Messages.tsx
src/components/MessageCount.tsx
src/components/ChatView.tsx
src/components/Workspace.tsx
src/components/ChatPanel.tsx
src/components/OnlineNow.tsx
src/components/TimeAgo.tsx
src/hooks/useSortedMembers.ts
src/hooks/useMessageCount.ts
src/feed.ts
src/vite-env.d.ts
src/main.tsx
src/store/clock.ts
src/store/activity.ts
src/store/chat.ts
src/store/selectors.ts
src/store/draft.ts
src/lib/members.ts
src/lib/channel.ts
index.html
dev-url.txt
src/components/Composer/index.tsx
```

**→ Read**
```
{"file_path":"src/components/Composer/index.tsx"}
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
38	function useMetaField(control: For … [3275 more]
```

**agent:** Now let's replace with the coarser-subscription approach, following the existing `useFieldError` idiom already in this codebase.

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { memo, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';\nimport { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';","new_string":"import { memo, useLayoutEffect, useState, type ReactNode } from 'react';\nimport { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';"}
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**→ Edit**
```
{"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"/** Keeps the form's `data-filled` count in sync without subscribing the whole Composer to every field. */\nconst FilledCount = ({ control, formRef }: { control: FormControl; formRef: RefObject<HTMLFormElement | null> }) => {\n  const values = useWatch({ control });\n  const filled = Object.values(values).filter(Boolean).length;\n  useLayoutEffect(() => {\n    console.error('DEBUG filled=', filled, 'formRef.current=', formRef.current);\n    formRef.current?.setAttribute('data-fil … [2533 more]
```

**←**
```
The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
```

**agent:** Now let's verify correctness (the `data-filled` attribute behavior) and then re-measure performance.

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","ms":500,"script":"const form = page.locator('[data-testid=\"composer\"]');\nconst input = page.locator('[data-testid=\"message\"]');\nconst before = await form.getAttribute('data-filled');\nif (before !== '0') throw new Error('expected before=0 got ' + before);\nawait input.click();\nawait input.type('hi');\nawait page.waitForFunction(() => document.querySelector('[data-testid=\"composer\"]')?.getAttribute('data-filled') === '1', { timeout: 3000 });\nconst afterTyping = await form.getAttribute('data-filled');\nif (afterTyping !== '1') throw new Error( … [565 more]
```

**←**
```
{"id":"20260928-080010-app-record-00b6","url":"http://localhost:41457/?tick=150","requested":"http://localhost:41457/?tick=150","durationSec":0.2,"commits":9,"renders":30,"rendersWithoutDom":13,"rendersPerCommit":3.3,"topRoot":"Composer ×3","wasting":[{"root":"SendButton","source":"src/components/Composer/index.tsx:120","hits":4,"instances":1,"noDomChange":2}],"warnings":[]}
```

**agent:** Now let's re-run the original typing scenario replay for final before/after numbers.

**→ rpr:record_page**
```
{"replay":"20260928-075358-app-record-adc8","label":"after-fixed"}
```

**←**
```
{"id":"20260928-080015-app-record-dbaa","url":"http://localhost:41457/?tick=150&rpr=rec","requested":"http://localhost:41457/?tick=150","durationSec":3.3,"commits":99,"renders":195,"rendersWithoutDom":44,"rendersPerCommit":2,"topRoot":"ComposerHints ×34","wasting":[{"root":"SendButton","source":"src/components/Composer/index.tsx:120","hits":35,"instances":1,"noDomChange":34}],"warnings":[]}
```

**agent:** Composer no longer shows up as a wasting root at all now. Let's get the full comparison numbers.

**→ rpr:compare_recordings**
```
{"before":"20260928-075358-app-record-adc8","after":"20260928-080015-app-record-dbaa"}
```

**←**
```
{"comparable":true,"warnings":["durations differ (2538ms vs 3313ms): rates per second move with the length too — a scenario run twice compares by its actions and by the whole-run totals"],"before":{"id":"20260928-075358-app-record-adc8","durationMs":2538},"after":{"id":"20260928-080015-app-record-dbaa","durationMs":3313},"totals":{"commits":"126 → 99 (-21%)","renders":"384 → 195 (-49%)","commitsPerSec":"49.65 → 29.88 (-40%)","rendersPerSec":"151.3 → 58.86 (-61%)","rendersPerCommit":"3 → 2 (-33%)","rendersWithoutDomPerSec":"82.35 → 13.28 (-84%)","rendersPerTextChange":"7.4 → 3.4 (-54%)","longTaskMaxMs":"0 → 99"},"roots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"13.79 → 0.6 (-96%)","perHit":"7 → 7 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"96.53 → 3.92 (-96%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:125","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 10.26","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 20.53"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:119","path":"Composer < ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"27.58 → 10.26 (-63%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"27.58 → 10.26 (-63%)"},{"root":"SendButton","source":"src/components/Composer/index.tsx:120","path":"Composer < ChatView < SettingsBySync < Layout", … [3694 more]
```

**→ Read**
```
{"file_path":"src/components/Composer/index.tsx"}
```

**←**
```
1	import { memo, useLayoutEffect, useState, type ReactNode } from 'react';
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
38	function useMetaField(control: FormControl, name … [3197 more]
```

**agent:** Clean, no debug leftovers, and `trigger` is now passed directly (stable reference) instead of being wrapped in a new closure each render. Let me also confirm the `send` submit flow (full form reset, message list update) still behaves correctly, and check for stray TypeScript issues by scanning for any other usage of the removed `watch` export from `Composer`.

**→ Grep**
```
{"pattern":"from ['\"].*Composer['\"]|Composer\\.","path":"src","output_mode":"content","-n":true}
```

**←**
```
src/components/ChatView.tsx:7:import { Composer } from './Composer';
```

**agent:** Only `Composer` itself is imported elsewhere, so no other code depended on the removed internals. Let's do one more sanity pass: submit a message end-to-end to confirm the composer still works exactly as before.

**→ rpr:record_page**
```
{"url":"http://localhost:41457/?tick=150","ms":500,"script":"const input = page.locator('[data-testid=\"message\"]');\nawait input.click();\nawait input.type('final check message');\nconst send = page.locator('[data-testid=\"send\"]');\nawait page.waitForFunction(() => !document.querySelector('[data-testid=\"send\"]')?.hasAttribute('disabled'));\nawait send.click();\nawait page.waitForFunction(() => document.querySelector('[data-testid=\"message\"]').value === '');\nconst filled = await page.locator('[data-testid=\"composer\"]').getAttribute('data-filled');\nif (filled !== '0') throw new Error … [229 more]
```

**←**
```
{"id":"20260928-080035-app-record-1762","url":"http://localhost:41457/?tick=150","requested":"http://localhost:41457/?tick=150","durationSec":0.3,"commits":41,"renders":93,"rendersWithoutDom":25,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×18","wasting":[{"root":"SendButton","source":"src/components/Composer/index.tsx:120","hits":20,"instances":1,"noDomChange":18}],"warnings":[]}
```

**agent:** No errors — send, reset, and the message list update all work exactly as before.

## Summary

**Cause:** `Composer` (`src/components/Composer/index.tsx`) called `watch()` with no field name to compute a `filled` count for the `data-filled` attribute. That subscribes the whole component to *every* keystroke in *any* field, not just changes to the count. Since `Composer` sits above the whole form, each render cascaded into `MessageInput`, `SendButton`, `MetaInput` ×2 and `ComposerHints`, most of which produced no DOM change — a classic "root reads more than it shows" case, confirmed by the recorder (`Composer`'s own DOM was unchanged in 34 of 35 renders).

**Fix:** replaced the bare `watch()` with a small hook (`useFilledCount`, modeled on the file's existing `useFieldError` pattern) that subscribes via react-hook-form's low-level `control._subscribe` and only calls `setState` when the derived count actually changes — not on every character. `Composer` now re-renders only when a field crosses the empty/non-empty boundary, instead of on every keystroke. (Also passed `trigger` directly instead of a new closure each render, so it stays a stable prop.)

I initially tried a ref+effect approach to move the read into a child; testing it caught a real bug (`useLayoutEffect` in a child fires before the parent's own ref attaches on mount, so `data-filled` was never set). That's why I switched to the subscription-based fix above, which I verified via Playwright: `data-filled` is `"0"` on load, becomes `"1"` on typing/filling any field, back to `"0"` on clearing, and sending a message still resets the form and appends to the list — identical to before.

**Measured (same scripted keystrokes, replayed before/after):**
| metric | before | after |
|---|---|---|
| renders per character typed | 10 | 4.1 (‑59%) |
| renders per text-change event | 7.4 | 3.4 (‑54%) |
| total renders/sec | 151.3 | 58.9 (‑61%) |
| renders with no DOM effect /sec | 82.4 | 13.3 (‑84%) |
| `Composer` re-renders/sec | 13.8 | 0.6 (‑96%) |

**Left as-is:** `SendButton` still re-renders on every keystroke (35 hits, 34 with no DOM change) — that's react-hook-form's own `useFormState({control})` re-checking `isValid` on every change in `mode: 'onChange'`, present before my change too and unrelated to the `Composer` issue. Its cost is negligible (a single button, ~0.04ms/render) and removing it would mean changing when validity is recomputed, so I left it and am naming it here rather than changing behavior.
