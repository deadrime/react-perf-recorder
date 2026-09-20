import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

export type Person = 'Anna' | 'Boris' | 'Chen';

export interface Message {
  id: string;
  from: Person;
  text: string;
  /** Reactions arrive from other people all the time, like any live counter in a chat. */
  reactions: number;
  sentAgo: number;
}

interface FeedSlice {
  reactionsById: Record<string, number>;
  /** Grows on every tick from the feed: whoever holds the whole object re-renders with it. */
  syncedAt: number;
  tick(step: number): void;
}

interface WorkspaceSlice {
  workspace: { id: string; name: string; unread: number; synced: number };
  markRead(): void;
}

interface MessagesSlice {
  messageById: Record<string, Message>;
  removeMessage(id: string): void;
  send(text: string): void;
}

export type Chat = FeedSlice & WorkspaceSlice & MessagesSlice;
type Slice<T> = StateCreator<Chat, [['zustand/devtools', never]], [], T>;

/**
 * The feed ticks reactions and read receipts, and never adds a message on its own: a message appears only when
 * someone sends one, so a recording of a quiet page has no mounts in it and stays comparable between runs.
 */
const feed: Slice<FeedSlice> = (set) => ({
  reactionsById: { m1: 2, m2: 0, m3: 5 },
  syncedAt: 0,
  tick: (step) =>
    set(
      (s) => {
        const reactionsById = {
          ...s.reactionsById,
          m1: 2 + (Math.sin(step) > 0 ? 1 : 0),
          m2: Math.abs(Math.round(Math.cos(step))),
        };
        // Drifts a little on every tick, like a sync that is never quite finished.
        const synced = 92 + Math.sin(step / 3) * 2;
        return { reactionsById, syncedAt: s.syncedAt + 1, workspace: { ...s.workspace, synced } };
      },
      false,
      'feed/tick'
    ),
});

const workspace: Slice<WorkspaceSlice> = (set) => ({
  workspace: { id: 'demo', name: 'Design team', unread: 12, synced: 96 },
  markRead: () => set((s) => ({ workspace: { ...s.workspace, unread: 0 } }), false, 'workspace/markRead'),
});

const texts: Record<string, { from: Person; text: string; sentAgo: number }> = {
  m1: { from: 'Anna', text: 'The picker opens on the component you clicked now', sentAgo: 4 },
  m2: { from: 'Boris', text: 'Ship it — the tree is finally readable', sentAgo: 2 },
  m3: { from: 'Chen', text: 'Recording the page load found two more cascades', sentAgo: 1 },
};

const messages: Slice<MessagesSlice> = (set) => ({
  messageById: Object.fromEntries(Object.entries(texts).map(([id, m]) => [id, { id, reactions: 0, ...m }])),
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
        const id = `m${Object.keys(s.messageById).length + 1}`;
        return { messageById: { ...s.messageById, [id]: { id, from: 'Anna', text, reactions: 0, sentAgo: 0 } } };
      },
      false,
      'messages/send'
    ),
});

export const useChatStore = create<Chat>()(
  devtools((...a) => ({ ...feed(...a), ...workspace(...a), ...messages(...a) }), { name: 'chat' })
);

/** Who is typing right now, in a store without devtools: its updates show up as `presenceStore.setState`. */
export const presenceStore = createStore(() => ({ typing: 'Anna' as Person | null }));
