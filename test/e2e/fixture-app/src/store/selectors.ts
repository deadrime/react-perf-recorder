import { memoize, memoizeWithArgs } from 'proxy-memoize';
import { bug } from '../bugs';
import type { Chat } from './chat';

export const selectWorkspace = (s: Chat) => s.workspace;
export const selectUnread = (s: Chat) => s.workspace.unread;
export const selectSynced = (s: Chat) => s.workspace.synced;

export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));

/** One cache slot by default: rows that call it with their own ids evict each other on every tick. */
export const selectMessageInfo = memoizeWithArgs(
  (s: Chat, id: string) => {
    const message = s.messageById[id];
    return { ...message, reactions: s.reactionsById[id] ?? 0, seen: message.sentAgo > 1 };
  },
  bug('memo-cache-slot') ? undefined : { size: 32 }
);
