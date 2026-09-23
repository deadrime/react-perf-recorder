import { bug } from '../bugs';
import { useChatStore } from '../store/chat';
import { selectUnread, selectWorkspace } from '../store/selectors';
import { TimezoneBadge } from './Settings';
import { TypingBadge } from './TypingBadge';
import Workspace from './Workspace';

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

export const Header = () => (
  <header className="head" data-testid="header">
    <Workspace />
    <Unread />
    <TimezoneBadge />
    <TypingBadge />
  </header>
);
