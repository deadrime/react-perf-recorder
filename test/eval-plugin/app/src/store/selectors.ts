import { memoize } from 'proxy-memoize';
import type { Chat } from './chat';

export const selectWorkspace = (s: Chat) => s.workspace;
export const selectUnread = (s: Chat) => s.workspace.unread;

export const selectMessageIds = memoize((s: Chat) => Object.keys(s.messageById));

export const messageInfo = (s: Chat, id: string) => ({ ...s.messageById[id], reactions: s.reactionsById[id] ?? 0 });

export const selectSeen = (s: Chat) => s.workspace.unread < 13;
