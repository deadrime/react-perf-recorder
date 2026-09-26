import { useChatStore } from '../store/chat';
import { selectUnread } from '../store/selectors';
import { TimezoneBadge } from './Settings';
import { TypingBadge } from './TypingBadge';
import Workspace from './Workspace';

const Unread = () => {
  const unread = useChatStore(selectUnread);
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
