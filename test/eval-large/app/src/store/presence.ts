import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

interface PresenceState {
  /** Member ids with the app open. */
  online: string[];
  /** Which issue each member has open, by member id. */
  viewing: Record<string, string | null>;
  /** Who is writing a comment, by issue key. */
  typing: Record<string, string[]>;
  setOnline(online: string[]): void;
  setViewing(memberId: string, issueKey: string | null): void;
  setTyping(issueKey: string, memberIds: string[]): void;
}

export const usePresenceStore = create<PresenceState>()(
  devtools(
    (set) => ({
      online: [],
      viewing: {},
      typing: {},
      setOnline: (online) => set({ online }, false, 'presence/online'),
      setViewing: (memberId, issueKey) => set((s) => ({ viewing: { ...s.viewing, [memberId]: issueKey } }), false, 'presence/viewing'),
      setTyping: (issueKey, memberIds) => set((s) => ({ typing: { ...s.typing, [issueKey]: memberIds } }), false, 'presence/typing'),
    }),
    { name: 'presence' }
  )
);

/** Members looking at an issue right now. */
export const useViewers = (issueKey: string) =>
  usePresenceStore(useShallow((s) => Object.keys(s.viewing).filter((id) => s.viewing[id] === issueKey)));

const NOBODY: string[] = [];
export const useTyping = (issueKey: string) => usePresenceStore((s) => s.typing[issueKey] ?? NOBODY);
