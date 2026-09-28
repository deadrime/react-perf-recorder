import { NavLink } from 'react-router-dom';
import type { Project } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { cx } from '../../lib/cx';
import { useProjects } from '../../queries/workspace';
import { useAppSelector } from '../../store';
import { useAppStore } from '../../store/app';
import { selectMyOpenCount, selectOpenCountByProject, selectUnreadCount } from '../../store/selectors';
import { Count } from '../ui/Badges';
import { Icon, type IconName } from '../ui/Icon';

function NavItem({ to, icon, label, count, collapsed }: { to: string; icon: IconName; label: string; count?: number; collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cx('nav-item', isActive && 'nav-item-on')}
      title={collapsed ? label : undefined}
      data-testid={`nav-${to.slice(1)}`}
    >
      <Icon name={icon} />
      {!collapsed && <span className="grow">{label}</span>}
      {!collapsed && count !== undefined && <Count n={count} />}
    </NavLink>
  );
}

function ProjectLink({ project, collapsed }: { project: Project; collapsed: boolean }) {
  const open = useAppSelector((s) => selectOpenCountByProject(s)[project.id] ?? 0);
  return (
    <NavLink to={`/board?project=${project.id}`} className="nav-item" title={project.name}>
      <span className="dot" style={{ background: project.color }} />
      {!collapsed && <span className="grow">{project.name}</span>}
      {!collapsed && <span className="muted small">{open}</span>}
    </NavLink>
  );
}

function ProjectLinks({ collapsed }: { collapsed: boolean }) {
  const { data: projects = [] } = useProjects();
  return (
    <div className="nav-group">
      {!collapsed && <div className="nav-heading">Projects</div>}
      {projects.map((p) => (
        <ProjectLink key={p.id} project={p} collapsed={collapsed} />
      ))}
    </div>
  );
}

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const { user } = useAuth();
  const mine = useAppSelector((s) => selectMyOpenCount(s, user?.id));
  const unread = useAppSelector(selectUnreadCount);
  return (
    <aside className={cx('sidebar', collapsed && 'sidebar-collapsed')} data-testid="sidebar">
      <div className="sidebar-head">
        {!collapsed && <strong className="logo">Orbit</strong>}
        <button className="icon-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
          <Icon name="sidebar" />
        </button>
      </div>
      <nav className="nav-group">
        <NavItem to="/inbox" icon="inbox" label="Inbox" count={unread} collapsed={collapsed} />
        <NavItem to="/issues" icon="issues" label="Issues" count={mine} collapsed={collapsed} />
        <NavItem to="/board" icon="board" label="Board" collapsed={collapsed} />
        <NavItem to="/dashboard" icon="dashboard" label="Dashboard" collapsed={collapsed} />
        <NavItem to="/projects" icon="projects" label="Projects" collapsed={collapsed} />
      </nav>
      <ProjectLinks collapsed={collapsed} />
      <div className="grow" />
      <NavItem to="/settings" icon="settings" label="Settings" collapsed={collapsed} />
    </aside>
  );
}
