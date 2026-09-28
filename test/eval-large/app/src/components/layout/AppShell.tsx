import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useRealtime } from '../../realtime/socket';
import { useAppDispatch } from '../../store';
import { fetchActivity } from '../../store/activity';
import { fetchIssues } from '../../store/issues';
import { fetchNotifications } from '../../store/notifications';
import { useAppStore } from '../../store/app';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { Toaster } from './Toaster';
import { TopBar } from './TopBar';

export function AppShell() {
  const dispatch = useAppDispatch();
  const density = useAppStore((s) => s.density);
  useRealtime();
  useEffect(() => {
    dispatch(fetchIssues());
    dispatch(fetchNotifications());
    dispatch(fetchActivity());
  }, [dispatch]);
  return (
    <div className={`shell density-${density}`} data-testid="shell">
      <Sidebar />
      <div className="main">
        <TopBar />
        <main className="content">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <Toaster />
    </div>
  );
}
