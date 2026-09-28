# form-watch, with the plugin, run 2

fixed (waste 0); checks 5 of 5; $0.40, 193 s, 2 turns

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

> Investigation done — the fix is applied in `src/components/Composer/index.tsx`.
> 
> **Root cause:** `Composer` called react-hook-form's `watch()` with no arguments directly in its render body (to compute a "filled fields" count). That subscribes the *entire* component to every field on every change, so every keystroke in the message box re-rendered `Composer` — the top-level `<form>` — even though its own markup never changed. That cascade also made `MessageInput` render twice per keystroke instead of once.
> 
> **Fix:** extracted the field-count logic into a new leaf component, `FilledTracker` (index.tsx:87-93), which subscribes via `useWatch` itself and writes the count onto the form's `data-filled` attribute imperatively via a ref in `useEffect`, then renders `null`. `Composer` no longer touches per-keystroke form state, so it stops re-rendering. Nothing the page shows or does changed — same `data-filled` value, same validation, same DOM structure.
> 
> **Before/after** (scripted: type 24 chars at 60ms/keystroke, no throttling):
> 
> | metric | before | after |
> |---|---|---|
> | commits | 83 | 59 (−29%) |
> | total renders | 252 | 136 (−46%) |
> | renders with no DOM change | 137 | 45 (−66%) |
> | `Composer` cascades | 23 (every keystroke) | 0 |
> | `MessageInput` renders | 46 (2×/keystroke) | 23 (1×/keystroke) |
> 
> One related-but-separate issue was found and left alone: `MessageInput`'s `onChange` calls `trigger()` with no field name, revalidating the whole form (including unrelated fields) on every keystroke — fixing that would change validation behavior, so it wasn't touched per the "don't change what the page shows" constraint.

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
@@ -81,25 +81,38 @@
   );
 };
 
+// Tracks how many of the fields are filled in, for the form's own `data-filled` attribute.
+// This is the only thing in the form that needs the value of every field on every keystroke,
+// so it reads them itself instead of making the whole form re-render to compute it.
+const FilledTracker = ({ control, formRef }: { control: FormControl; formRef: RefObject<HTMLFormElement | null> }) => {
+  const values = useWatch({ control });
+  useEffect(() => {
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
         reset();
       })}
     >
+      <FilledTracker control={control} formRef={formRef} />
       <div className="row">
-        <MessageInput control={control} trigger={() => trigger()} />
+        <MessageInput control={control} trigger={trigger} />
         <SendButton control={control} />
       </div>
       <div className="row meta">
```

## The steps

**agent:** I'll use the perf-recorder agent, which is purpose-built for finding wasted re-renders and proving fixes with numbers.

**→ Agent**
```
{"description":"Diagnose and fix message box lag","subagent_type":"react-perf-recorder:perf-recorder","prompt":"This is a React app located in the current working directory, source in ./src. Its dev server is already running at the URL contained in ./dev-url.txt (read that file to get the URL).\n\nUser complaint: typing a message into the message box on the page lags/feels slow.\n\nTask:\n1. Record/observe the page while typing into the message input to find out whether anything on the page re-renders unnecessarily (i.e., components re-rendering on every keystroke without their output actually … [1138 more]
```

**←**
```
Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a6245daee7bc0cfc5 (internal ID - do not mention to user. Use SendMessage with to: 'a6245daee7bc0cfc5', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes. You know nothing about its results until that notification arrives — do not report, assume, or predict them; continue other work or respond to the user in the meantime.
Do not duplicate this agent's work — avoid working with the same files or topics it is using.
output_file: /tmp/claude-eval-UuMGkf/tmp/claude-0/-tmp-claude-eval-UuMGkf-home-cwd/1bedb19f-6ea1-4a2c-b3eb-85f05e04b2c6/tasks/a6245daee7bc0cfc5.output
Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification.
```

**agent:** I've kicked off the perf-recorder agent to investigate the typing lag — it'll record the page, trace any wasted re-renders back to their component/hook/file:line, apply a targeted fix if warranted, and capture before/after render numbers. I'll report back once it finishes.

> **→ Read**
> ```
> {"file_path":"dev-url.txt"}
> ```

> **←**
> ```
> 1	http://localhost:37739/?tick=150
> 2	
> ```

> **→ Glob**
> ```
> {"pattern":"**/*.{tsx,jsx,ts,js}","path":"src"}
> ```

> **←**
> ```
> src/components/TypingLine.tsx
> src/components/ActivityLog.tsx
> src/components/PrefsLine.tsx
> src/components/ChannelStats.tsx
> src/components/Composer/useFieldError.ts
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
> src/components/Composer/index.tsx
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
> {"file_path":"src/store/draft.ts"}
> ```

> **←**
> ```
> 1	import { createStore } from 'zustand/vanilla';
> 2	
> 3	/** Whether the message box holds unsent text. */
> 4	export const draftStore = createStore(() => ({ hasDraft: false }));
> 5	
> ```

> **→ Read**
> ```
> {"file_path":"src/store/chat.ts"}
> ```

> **←**
> ```
> 1	import { create, type StateCreator } from 'zustand';
> 2	import { devtools } from 'zustand/middleware';
> 3	import { createStore } from 'zustand/vanilla';
> 4	
> 5	export type Person = 'Anna' | 'Boris' | 'Chen';
> 6	
> 7	export interface Message {
> 8	  id: string;
> 9	  from: Person;
> 10	  text: string;
> 11	  sentAt: number;
> 12	}
> 13	
> 14	/** The chat runs on a compressed clock: a message every 40 ticks, a reaction every 5, typing three ticks ahead. */
> 15	export const ARRIVAL_EVERY = 40;
> 16	export const TYPING_LEAD = 3;
> 17	const REACTION_EVERY = 5;
> 18	
> 19	const PEOPLE: Person[] = ['Anna', 'Boris', 'Chen'];
> 20	const ARRIVALS = [
> 21	  'One more thing before I forget — the picker keeps the scroll now',
> 22	  'Anyone else seeing the countdown flicker?',
> 23	  'Merged. The release notes are in the channel topic',
> 24	  'I moved the standup to 10:30 tomorrow',
> 25	];
> 26	
> 27	export const senderAt = (step: number): Person => PEOPLE[Math.floor(step / ARRIVAL_EVERY) % PEOPLE.length];
> 28	
> 29	interface FeedSlice {
> 30	  reactionsById: Record<string, number>;
> 31	  tick(step: number): void;
> 32	}
> 33	
> 34	export interface Prefs {
> 35	  timeFormat: '12h' | '24h';
> 36	  compact: boolean;
> 37	}
> 38	
> 39	export const DEFAULT_PREFS: Prefs = { timeFormat: '24h', compact: false };
> 40	
> 41	interface WorkspaceSlice {
> 42	  workspace: { id: string; name: string; unread: number; lastEventAt: number };
> 43	  prefs: Prefs;
> 44	  markRead(): void;
> 45	}
> 46	
> 47	interface MessagesSlice {
> 48	  messageById: Record<string, Message>;
> 49	  /**  … [3483 more]
> ```

> **→ Grep**
> ```
> {"pattern":"draftStore|presenceStore|useChatStore","path":"src","output_mode":"content","-n":true}
> ```

> **←**
> ```
> src/lib/channel.ts:1:import { useChatStore, type Chat } from '../store/chat';
> src/lib/channel.ts:5:  return useChatStore(select);
> src/feed.ts:3:import { ARRIVAL_EVERY, TYPING_LEAD, presenceStore, senderAt, useChatStore, type Person } from './store/chat';
> src/feed.ts:30:    useChatStore.getState().tick(step);
> src/feed.ts:34:    if (typing.join() !== presenceStore.getState().typing.join()) presenceStore.setState({ typing });
> src/components/ChatView.tsx:4:import { useChatStore } from '../store/chat';
> src/components/ChatView.tsx:44:  const at = useChatStore((s) => s.workspace.lastEventAt);
> src/components/Messages.tsx:4:import { useChatStore, type Chat } from '../store/chat';
> src/components/Messages.tsx:10:  return useChatStore(select);
> src/components/Messages.tsx:15:  const seen = useChatStore(selectSeen);
> src/components/Messages.tsx:26:  const files = useChatStore((s) => s.attachmentsById[id] ?? NO_FILES);
> src/components/Messages.tsx:31:  const message = useChatStore((s) => s.messageById[id]);
> src/components/Messages.tsx:45:      <button type="button" className="delete" title="Delete" data-testid={`delete-${id}`} onClick={() => useChatStore.getState().removeMessage(id)}>
> src/components/Messages.tsx:53:  const ids = useChatStore(selectMessageIds);
> src/components/Header.tsx:2:import { useChatStore } from '../store/chat';
> src/components/Header.tsx:3:import { draftStore } from '../store/draft';
> src/components/Header.tsx:11:  const unread = useChatStore(selectUnread);
> src/components/ … [1368 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/ChatPanel.tsx"}
> ```

> **←**
> ```
> 1	import { memo, useCallback } from 'react';
> 2	import { useSearchParams } from 'react-router-dom';
> 3	import { MessageList, PeopleList } from './Messages';
> 4	
> 5	export const useActiveTab = () => {
> 6	  const [params, setParams] = useSearchParams();
> 7	  const tab = params.get('tab') === 'people' ? 'people' : 'chat';
> 8	  const select = useCallback((next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next })), [setParams]);
> 9	  return [tab, select] as const;
> 10	};
> 11	
> 12	const Tab = memo(({ name, active, onPick }: { name: string; active: boolean; onPick: (name: string) => void }) => (
> 13	  <button type="button" role="tab" aria-selected={active} data-testid={`tab-${name}`} onClick={() => onPick(name)}>
> 14	    {name}
> 15	  </button>
> 16	));
> 17	
> 18	export const ChatPanel = () => {
> 19	  const [tab, setTab] = useActiveTab();
> 20	  return (
> 21	    <section className="panel" data-testid="chat-panel">
> 22	      <div className="tabs" role="tablist">
> 23	        {['chat', 'people'].map((name) => (
> 24	          <Tab key={name} name={name} active={tab === name} onPick={setTab} />
> 25	        ))}
> 26	      </div>
> 27	      {tab === 'chat' ? <MessageList /> : <PeopleList />}
> 28	    </section>
> 29	  );
> 30	};
> 31	
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Header.tsx"}
> ```

> **←**
> ```
> 1	import { useStore } from 'zustand';
> 2	import { useChatStore } from '../store/chat';
> 3	import { draftStore } from '../store/draft';
> 4	import { selectUnread } from '../store/selectors';
> 5	import { ChannelTopic } from './ChannelTopic';
> 6	import { TimezoneBadge } from './Settings';
> 7	import { TypingBadge } from './TypingBadge';
> 8	import Workspace from './Workspace';
> 9	
> 10	const Unread = () => {
> 11	  const unread = useChatStore(selectUnread);
> 12	  return (
> 13	    <span className="badge" data-testid="unread">
> 14	      {unread} unread
> 15	    </span>
> 16	  );
> 17	};
> 18	
> 19	const DraftBadge = () => {
> 20	  const hasDraft = useStore(draftStore, (s) => s.hasDraft);
> 21	  return hasDraft ? (
> 22	    <span className="badge muted" data-testid="draft">
> 23	      draft
> 24	    </span>
> 25	  ) : null;
> 26	};
> 27	
> 28	export const Header = () => (
> 29	  <header className="head" data-testid="header">
> 30	    <Workspace />
> 31	    <ChannelTopic />
> 32	    <Unread />
> 33	    <TimezoneBadge />
> 34	    <TypingBadge />
> 35	    <DraftBadge />
> 36	  </header>
> 37	);
> 38	
> ```

> **agent:** That's fine and scoped correctly. Now let's record the page while typing to confirm the theory.

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:37739/?tick=150","label":"before","script":"const input = page.locator('[data-testid=\"message\"]');\nawait input.click();\nawait input.pressSequentially('Hello world typing test', { delay: 60 });\n"}
> ```

> **←**
> ```
> {"id":"20260928-075405-app-record-5224","url":"http://localhost:37739/?tick=150","requested":"http://localhost:37739/?tick=150","durationSec":1.7,"commits":83,"renders":252,"rendersWithoutDom":137,"rendersPerCommit":3,"topRoot":"Composer ×23","wasting":[{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","hits":46,"instances":1,"noDomChange":46},{"root":"Composer","source":"src/components/ChatView.tsx:26","hits":23,"instances":1,"noDomChange":0,"ownDomUnchanged":22},{"root":"SendButton","source":"src/components/Composer/index.tsx:103","hits":23,"instances":1,"noDomChange":22}],"warnings":[]}
> ```

> **→ rpr:get_recording**
> ```
> {"id":"latest"}
> ```

> **←**
> ```
> {"warning":"\"latest\" is 20260928-075405-app-record-5224 on localhost:37739; localhost:42317, localhost:41457, localhost:43003 were recorded in the same ten minutes — someone else may record into this folder: pass the id record_page returned","id":"20260928-075405-app-record-5224","status":"done","dir":"/tmp/tmp.jZKe2ZEf35/20260928-075405-app-record-5224","summary":{"id":"20260928-075405-app-record-5224","status":"done","createdAt":"2026-09-28T07:54:07.346Z","label":"before","source":"script:record","url":"http://localhost:37739/?tick=150","viewport":"1280×720","durationSec":1.7,"scope":null,"totals":{"commits":83,"commitsPerSec":49.38,"commitsInScope":83,"renders":252,"rendersPerScopeCommit":3,"rendersFromOutside":0,"rendersWithoutDom":137,"domTextChanges":33,"rendersPerTextChange":7.6},"topRoots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","hits":23,"hitsPerSec":13.68,"instances":1,"perHit":7,"noDomChange":0,"ownDomUnchanged":22,"renderMsPerHit":0.66,"reasons":["23× state #2 · [react-hook-form] useForm › State @ src/components/Composer/index.tsx:85 const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({"],"causes":["23× zustand:draftStore.setState","23× core:input input"],"lanes":"Sync:23"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:102","path":"Composer < ChatView < SettingsBySync < Layout","hits":46,"hitsPerSec":27.36,"instances":1,"perHit":1,"noDomChange":46, … [7308 more]
> ```

> **→ Grep**
> ```
> {"pattern":"data-filled|filled","path":".","output_mode":"files_with_matches"}
> ```

> **←**
> ```
> Found 1 file
> src/components/Composer/index.tsx
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"import { memo, type ReactNode } from 'react';","new_string":"import { memo, useEffect, useRef, type ReactNode, type RefObject } from 'react';"}
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ Edit**
> ```
> {"replace_all":false,"file_path":"src/components/Composer/index.tsx","old_string":"export const Composer = () => {\n  const { control, handleSubmit, trigger, watch, reset } = useForm<ComposerValues>({\n    mode: 'onChange',\n    defaultValues: { text: '', replyTo: '', remindIn: '' },\n  });\n  const filled = Object.values(watch()).filter(Boolean).length;\n  return (\n    <form\n      className=\"composer\"\n      data-testid=\"composer\"\n      data-filled={filled}\n      onSubmit={handleSubmit((values) => {\n        useChatStore.getState().send(values.text);\n … [2094 more]
> ```

> **←**
> ```
> The file src/components/Composer/index.tsx has been updated successfully. (file state is current in your context — no need to Read it back)
> ```

> **→ rpr:record_page**
> ```
> {"url":"http://localhost:37739/?tick=150","label":"after","script":"const input = page.locator('[data-testid=\"message\"]');\nawait input.click();\nawait input.pressSequentially('Hello world typing test', { delay: 60 });\n"}
> ```

> **←**
> ```
> {"id":"20260928-075546-app-record-3a29","url":"http://localhost:37739/?tick=150","requested":"http://localhost:37739/?tick=150","durationSec":1.6,"commits":59,"renders":136,"rendersWithoutDom":45,"rendersPerCommit":2.3,"topRoot":"ComposerHints ×23","wasting":[{"root":"FilledTracker","source":"src/components/Composer/index.tsx:113","hits":23,"instances":1,"noDomChange":23},{"root":"SendButton","source":"src/components/Composer/index.tsx:116","hits":23,"instances":1,"noDomChange":22}],"warnings":[]}
> ```

> **→ rpr:compare_recordings**
> ```
> {"before":"20260928-075405-app-record-5224","after":"20260928-075546-app-record-3a29"}
> ```

> **←**
> ```
> {"comparable":true,"warnings":[],"before":{"id":"20260928-075405-app-record-5224","durationMs":1681},"after":{"id":"20260928-075546-app-record-3a29","durationMs":1618},"totals":{"commits":"83 → 59 (-29%)","renders":"252 → 136 (-46%)","commitsPerSec":"49.38 → 36.46 (-26%)","rendersPerSec":"149.91 → 84.05 (-44%)","rendersPerCommit":"3 → 2.3 (-23%)","rendersWithoutDomPerSec":"81.5 → 27.81 (-66%)","rendersPerTextChange":"7.6 → 4.1 (-46%)","longTaskMaxMs":"0 → 0"},"roots":[{"root":"Composer","source":"src/components/ChatView.tsx:26","path":"ChatView < SettingsBySync < Layout","status":"gone","hitsPerSec":"13.68 → –","perHit":"7 → –","instances":"1 → –","cascadePerSec":"95.78 → 0 (-100%)"},{"root":"ComposerHints","source":"src/components/Composer/index.tsx:121","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 14.22","perHit":"– → 2","instances":"– → 1","cascadePerSec":"0 → 28.43"},{"root":"FilledTracker","source":"src/components/Composer/index.tsx:113","path":"Composer < ChatView < SettingsBySync < Layout","status":"new","hitsPerSec":"– → 14.22","perHit":"– → 1","instances":"– → 1","cascadePerSec":"0 → 14.22"},{"root":"MessageInput","source":"src/components/Composer/index.tsx:115","path":"Composer < ChatView < SettingsBySync < Layout","status":"changed","hitsPerSec":"27.36 → 14.22 (-48%)","perHit":"1 → 1 (0%)","instances":"1 → 1 (0%)","cascadePerSec":"27.36 → 14.22 (-48%)"},{"root":"SendButton","source":"src/components/Composer/index.tsx:116", … [3455 more]
> ```

> **→ Read**
> ```
> {"file_path":"src/components/Composer/index.tsx"}
> ```

> **←**
> ```
> 1	import { memo, useEffect, useRef, type ReactNode, type RefObject } from 'react';
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
> 38	function useMetaField(control: FormContr … [3332 more]
> ```

> **agent:** Root cause found and fixed. Report below.
> 
> ## Root cause
> 
> **Component:** `Composer` — `src/components/Composer/index.tsx` (was line 89 in the original file: `const filled = Object.values(watch()).filter(Boolean).length;`, inside `useForm(...)` at line 85).
> 
> **Hook:** react-hook-form's `watch()` called with no arguments, directly in the render body of `Composer`. Per react-hook-form's own docs this subscribes the *whole component* to every field's value on every change (it's the documented pitfall that `useWatch`/scoped selectors exist to avoid). Every keystroke in the message box (`onChange` at `src/components/Composer/index.tsx:23-28`) updates the shared RHF form state, which re-ran `watch()` and re-rendered `Composer` itself — the top-level form element — even though the form's own markup (`<form>`, the two `<div className="row">` wrappers) never actually changed; only the nested `MessageInput` text and `SendButton`/`ComposerHints` needed to update.
> 
> Confirmed by recording (`http://localhost:37739/?tick=150`, viewport 1280×720, no CPU throttle, scripted typing of "Hello world typing test" at 60 ms/char):
> 
> - `Composer` was the top cascade root: 23 hits (one per keystroke), `ownDomUnchanged: 22/23` — its own DOM was unchanged in 22 of 23 renders.
> - Reason line: `state #2 · [react-hook-form] useForm › State @ src/components/Composer/index.tsx:85`, caused by `zustand:draftStore.setState` + `core:input input` on every keystroke.
> - Side effect: because `Composer` re-created the whole child element tree each keystroke, `MessageInput` itself rendered **twice** per keystroke (46 hits for 23 chars) instead of once.
> 
> ## Fix
> 
> Moved the "how many fields are filled" read out of `Composer`'s render body into a tiny leaf component, `FilledTracker` (`src/components/Composer/index.tsx:84-93`), that:
> - subscribes to all fields itself via `useWatch({ control })` (so *it* re-renders every keystroke, not the form),
> - writes the count onto the `<form>` node's `data-filled` attribute imperatively in a `useEffect`, via a `ref` (`src/components/Composer/index.tsx:100-113`), and
> - renders `null`, so it has no children to cascade into.
> 
> Also removed the now-unneeded inline `trigger={() => trigger()}` wrapper on `MessageInput`, passing the stable `trigger` function directly (`src/components/Composer/index.tsx:115`) — a minor extra reduction in per-render allocation, no behavior change.
> 
> Nothing about what the page shows or does changed: `data-filled` ends up holding the same value, `data-testid`s, the submit/reset flow, and validation (`mode: 'onChange'`, per-field rules) are untouched.
> 
> ## Before/after (same script: click + type 24 chars at 60 ms/char, no throttle, 1280×720)
> 
> | metric | before | after | change |
> |---|---|---|---|
> | commits | 83 | 59 | −29% |
> | renders | 252 | 136 | −46% |
> | renders without DOM change | 137 (81.5/s) | 45 (27.8/s) | −66% |
> | renders per text change | 7.6 | 4.1 | −46% |
> | `Composer` cascade | 23 hits/23 keystrokes, 95.78 cascades/s | **gone** (0) | −100% |
> | `MessageInput` renders | 46 (2×/keystroke) | 23 (1×/keystroke) | −50% |
> | typing action, renders/char | 10 | 5 | −50% |
> 
> Recording ids: before `20260928-075405-app-record-5224`, after `20260928-075546-app-record-3a29`.
> 
> ## What still renders "for nothing" after the fix
> 
> - `FilledTracker` (`src/components/Composer/index.tsx:87`): 23 hits, `noDomChange: 23/23` — expected and by design; it renders `null` and does its real work (the `data-filled` attribute) imperatively in an effect, so it costs almost nothing and doesn't cascade.
> - `SendButton` (`src/components/Composer/index.tsx:75-82`): 23 hits, `noDomChange: 22/23`, reason `[react-hook-form] useFormState › State`. This is unrelated to the `watch()` bug — it's already correctly scoped to `isValid` via `useFormState({ control })`. It re-renders because `MessageInput`'s `onChange` calls `trigger()` with **no field name** (`src/components/Composer/index.tsx:27`, comment: "The other fields are validated against the text"), which revalidates the *entire* form on every keystroke, including fields whose rules don't reference the text value. Fixing this would change validation behavior (whether `replyTo`/`remindIn` get revalidated as you type the message), so it's left for the person to decide rather than changed here.
> 
> ## Conditions
> 
> - Page: `http://localhost:37739/?tick=150`, viewport 1280×720, no CPU throttling.
> - Scenario: click the message input, type "Hello world typing test" at 60 ms/keystroke (scripted via Playwright, not a person's own recording since none was available).
> - Both before/after runs ~1.6–1.7 s, same script, same page state.
> 
> ## Not checked
> 
> - `MetaInput` (`replyTo`/`remindIn` fields, `src/components/Composer/index.tsx:45-54`) render counts specifically — they never appeared in either run's "wasting" list, so assumed unaffected, but not individually verified.
> - Behavior/perf under CPU throttling or on a loaded page (only the default, untouched dev-server speed was measured).
> - Whether a real person's own typing pace/recording would show the same ratios (this was a scripted reproduction, per the task's URL and no person-recorded session being available).

**→ Read**
```
{"file_path":"src/components/Composer/index.tsx"}
```

**←**
```
1	import { memo, useEffect, useRef, type ReactNode, type RefObject } from 'react';
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
38	function useMetaField(control: FormContr … [3332 more]
```

**agent:** Investigation done — the fix is applied in `src/components/Composer/index.tsx`.

**Root cause:** `Composer` called react-hook-form's `watch()` with no arguments directly in its render body (to compute a "filled fields" count). That subscribes the *entire* component to every field on every change, so every keystroke in the message box re-rendered `Composer` — the top-level `<form>` — even though its own markup never changed. That cascade also made `MessageInput` render twice per keystroke instead of once.

**Fix:** extracted the field-count logic into a new leaf component, `FilledTracker` (index.tsx:87-93), which subscribes via `useWatch` itself and writes the count onto the form's `data-filled` attribute imperatively via a ref in `useEffect`, then renders `null`. `Composer` no longer touches per-keystroke form state, so it stops re-rendering. Nothing the page shows or does changed — same `data-filled` value, same validation, same DOM structure.

**Before/after** (scripted: type 24 chars at 60ms/keystroke, no throttling):

| metric | before | after |
|---|---|---|
| commits | 83 | 59 (−29%) |
| total renders | 252 | 136 (−46%) |
| renders with no DOM change | 137 | 45 (−66%) |
| `Composer` cascades | 23 (every keystroke) | 0 |
| `MessageInput` renders | 46 (2×/keystroke) | 23 (1×/keystroke) |

One related-but-separate issue was found and left alone: `MessageInput`'s `onChange` calls `trigger()` with no field name, revalidating the whole form (including unrelated fields) on every keystroke — fixing that would change validation behavior, so it wasn't touched per the "don't change what the page shows" constraint.
