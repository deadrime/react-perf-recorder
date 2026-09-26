import { useStore } from 'zustand';
import { useChatStore } from '../store/chat';
import { draftStore } from '../store/draft';
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

const DraftBadge = () => {
  const hasDraft = useStore(draftStore, (s) => s.hasDraft);
  return hasDraft ? (
    <span className="badge muted" data-testid="draft">
      draft
    </span>
  ) : null;
};

export const Header = () => (
  <header className="head" data-testid="header">
    <Workspace />
    <Unread />
    <TimezoneBadge />
    <TypingBadge />
    <DraftBadge />
  </header>
);
