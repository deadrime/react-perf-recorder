import { bug } from '../bugs';
import { useChatStore } from '../store/chat';
import { selectSynced, selectUnread, selectWorkspace } from '../store/selectors';
import { TimezoneBadge } from './Settings';
import { TypingBadge } from './TypingBadge';

// Flags are fixed for the page's life, so picking a hook by flag keeps the hook order stable.
function useWholeWorkspaceUnread() {
  return useChatStore(selectWorkspace).unread;
}

function useUnread() {
  return useChatStore(selectUnread);
}

const useUnreadCount = bug('whole-object') ? useWholeWorkspaceUnread : useUnread;

const Unread = () => {
  const unread = useUnreadCount();
  return (
    <span className="badge" data-testid="unread">
      {unread} unread
    </span>
  );
};

/** The bar moves in steps of 10%: subscribing to the exact number renders it on every tick for the same width. */
function useExactSynced() {
  return Math.round(useChatStore(selectSynced) / 10) * 10;
}

function useSyncedStep() {
  return useChatStore((s) => Math.round(selectSynced(s) / 10) * 10);
}

export const SyncBar = () => {
  const step = (bug('exact-value') ? useExactSynced : useSyncedStep)();
  return (
    <span className="sync" data-testid="synced" title={`history synced ${step}%`}>
      <span className="sync-fill" style={{ width: `${step}%` }} />
    </span>
  );
};

export const Header = () => (
  <header className="head" data-testid="header">
    <strong className="workspace">Design team</strong>
    <Unread />
    <TimezoneBadge />
    <SyncBar />
    <TypingBadge />
  </header>
);
