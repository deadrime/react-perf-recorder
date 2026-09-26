import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

export type Person = 'Anna' | 'Boris' | 'Chen';

export interface Message {
  id: string;
  from: Person;
  text: string;
  sentAt: number;
}

/** The chat runs on a compressed clock: a message every 40 ticks, a reaction every 5, typing three ticks ahead. */
export const ARRIVAL_EVERY = 40;
export const TYPING_LEAD = 3;
const REACTION_EVERY = 5;

const PEOPLE: Person[] = ['Anna', 'Boris', 'Chen'];
const ARRIVALS = [
  'One more thing before I forget — the picker keeps the scroll now',
  'Anyone else seeing the countdown flicker?',
  'Merged. The release notes are in the channel topic',
  'I moved the standup to 10:30 tomorrow',
];

export const senderAt = (step: number): Person => PEOPLE[Math.floor(step / ARRIVAL_EVERY) % PEOPLE.length];

interface FeedSlice {
  reactionsById: Record<string, number>;
  tick(step: number): void;
}

interface WorkspaceSlice {
  workspace: { id: string; name: string; unread: number; lastEventAt: number };
  markRead(): void;
}

interface MessagesSlice {
  messageById: Record<string, Message>;
  removeMessage(id: string): void;
  send(text: string): void;
}

export type Chat = FeedSlice & WorkspaceSlice & MessagesSlice;
type Slice<T> = StateCreator<Chat, [['zustand/devtools', never]], [], T>;

const minutes = (n: number) => Date.now() - n * 60_000;

/** Only the latest messages are kept. */
export const MAX_MESSAGES = 24;
let lastId = 3; // after the three the chat starts with
const newId = () => `m${++lastId}`;
const withMessage = (all: Record<string, Message>, message: Message) =>
  Object.fromEntries([...Object.entries(all), [message.id, message] as const].slice(-MAX_MESSAGES));

const feed: Slice<FeedSlice> = (set) => ({
  reactionsById: { m1: 2, m2: 0, m3: 5 },
  tick: (step) =>
    set(
      (s) => {
        const next: Partial<Chat> = { workspace: { ...s.workspace, lastEventAt: step } };
        // A reaction lands on one message at a time, not on all of them at once.
        if (step % REACTION_EVERY === 0) {
          const ids = Object.keys(s.messageById);
          const id = ids[Math.floor(step / REACTION_EVERY) % ids.length];
          next.reactionsById = { ...s.reactionsById, [id]: (s.reactionsById[id] ?? 0) + 1 };
        }
        if (step % ARRIVAL_EVERY === 0) {
          const id = newId();
          const text = ARRIVALS[Math.floor(step / ARRIVAL_EVERY - 1) % ARRIVALS.length];
          next.messageById = withMessage(s.messageById, { id, from: senderAt(step), text, sentAt: Date.now() });
          next.workspace = { ...next.workspace!, unread: s.workspace.unread + 1 };
        }
        return next;
      },
      false,
      step % ARRIVAL_EVERY === 0 ? 'feed/message' : 'feed/tick'
    ),
});

const workspace: Slice<WorkspaceSlice> = (set) => ({
  workspace: { id: 'demo', name: 'Design team', unread: 12, lastEventAt: 0 },
  markRead: () => set((s) => ({ workspace: { ...s.workspace, unread: 0 } }), false, 'workspace/markRead'),
});

const START: Array<Omit<Message, 'id'>> = [
  { from: 'Anna', text: 'The picker opens on the item you clicked now', sentAt: minutes(4) },
  { from: 'Boris', text: 'Ship it — the tree is finally readable', sentAt: minutes(2) },
  { from: 'Chen', text: 'The new onboarding flow is on staging', sentAt: minutes(1) },
];

const messages: Slice<MessagesSlice> = (set) => ({
  messageById: Object.fromEntries(START.map((m, i) => [`m${i + 1}`, { id: `m${i + 1}`, ...m }])),
  removeMessage: (id) =>
    set(
      (s) => {
        const { [id]: _, ...rest } = s.messageById;
        return { messageById: rest };
      },
      false,
      'messages/remove'
    ),
  send: (text) =>
    set(
      (s) => {
        const id = newId();
        return { messageById: withMessage(s.messageById, { id, from: 'Anna', text, sentAt: Date.now() }) };
      },
      false,
      'messages/send'
    ),
});

export const useChatStore = create<Chat>()(devtools((...a) => ({ ...feed(...a), ...workspace(...a), ...messages(...a) }), { name: 'chat' }));

/** Who is typing right now. */
export const presenceStore = createStore(() => ({ typing: [] as Person[] }));
