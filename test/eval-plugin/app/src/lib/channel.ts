import { useChatStore, type Chat } from '../store/chat';

/** The channel's state as components read it: through a selector, so each reads only its part. */
export function useChannel<T>(select: (chat: Chat) => T): T {
  return useChatStore(select);
}
