import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { BoardPage } from './features/board/BoardPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { InboxPage } from './features/inbox/InboxPage';
import { IssueDrawer } from './features/issues/IssueDrawer';
import { IssuesPage } from './features/issues/IssuesPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { SettingsPage } from './features/settings/SettingsPage';

// A hash router: the demo is served from any folder, with no server rewrites.
export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/issues" replace /> },
      { path: 'issues', element: <IssuesPage />, children: [{ path: ':key', element: <IssueDrawer /> }] },
      { path: 'board', element: <BoardPage />, children: [{ path: ':key', element: <IssueDrawer /> }] },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'settings/:tab?', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/issues" replace /> },
    ],
  },
]);
