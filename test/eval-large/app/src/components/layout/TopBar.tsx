import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAppStore } from '../../store/app';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { Kbd } from '../ui/Misc';
import { NotificationBell } from './NotificationBell';
import { PresenceStack } from './PresenceStack';
import { SyncStatus } from './SyncStatus';

const TITLES: Record<string, string> = {
  inbox: 'Inbox',
  issues: 'Issues',
  board: 'Board',
  dashboard: 'Dashboard',
  projects: 'Projects',
  settings: 'Settings',
};

function Breadcrumb() {
  const { pathname } = useLocation();
  const [section, detail] = pathname.split('/').filter(Boolean);
  return (
    <div className="crumbs">
      <span>{TITLES[section] ?? 'Orbit'}</span>
      {detail && (
        <>
          <Icon name="chevron" size={12} />
          <span className="muted">{detail}</span>
        </>
      )}
    </div>
  );
}

export function TopBar() {
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const { user } = useAuth();
  return (
    <header className="topbar" data-testid="topbar">
      <Breadcrumb />
      <button className="search-btn" onClick={() => setCommandOpen(true)} data-testid="open-palette">
        <Icon name="search" size={14} />
        <span className="grow">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div className="grow" />
      <PresenceStack />
      <SyncStatus />
      <NotificationBell />
      <Avatar id={user?.id} size="md" />
    </header>
  );
}
