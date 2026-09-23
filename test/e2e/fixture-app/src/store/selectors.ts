import { memoize, memoizeWithArgs } from 'proxy-memoize';
import type { Chat } from './chat';

export const selectWorkspace = (s: Chat) => s.workspace;
export const selectUnread = (s: Chat) => s.workspace.unread;

export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));

export const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });

/**
 * A yes or no of its own, not a field of the row's object: `unread` moves with every message, and an object that
 * read it would be new for every row each time — the same `seen` inside, a render of every row for nothing.
 */
export const selectSeen = (s: Chat) => s.workspace.unread < 13;

/**
 * One cache for every row, a ring of `size` answers (one by default): rows that call it with their own ids evict
 * each other. A bigger ring only puts it off — every recompute takes a slot, and once a row's answer is the oldest
 * it goes, however many rows there are — so the clean chat keeps a memoized selector per row instead.
 */
export const selectMessageInfo = memoizeWithArgs(messageInfo);
