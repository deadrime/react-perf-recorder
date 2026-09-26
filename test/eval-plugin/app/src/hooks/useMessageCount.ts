import { useChannel } from '../lib/channel';

const countOf = (byId: Record<string, unknown>) => Object.keys(byId).length;

export function useMessageCount() {
  return useChannel((chat) => countOf(chat.messageById));
}
