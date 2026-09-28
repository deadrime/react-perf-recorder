import { Navigate, NavLink, useParams } from 'react-router-dom';
import { withPermission } from '../../components/withPermission';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cx } from '../../lib/cx';
import { AppearanceSettings } from './AppearanceSettings';
import { NotificationSettingsForm } from './NotificationSettingsForm';
import { ProfileForm } from './ProfileForm';

const NoAccess = () => <p className="muted">Ask a workspace admin to change these settings.</p>;
const GuardedProfile = withPermission(ProfileForm, 'settings:edit', NoAccess);

const TABS = [
  { id: 'profile', label: 'Profile', Component: GuardedProfile },
  { id: 'notifications', label: 'Notifications', Component: NotificationSettingsForm },
  { id: 'appearance', label: 'Appearance', Component: AppearanceSettings },
];

export function SettingsPage() {
  const { tab } = useParams();
  const current = TABS.find((t) => t.id === tab);
  useDocumentTitle('Settings');
  if (!current) return <Navigate to="/settings/profile" replace />;
  return (
    <div className="page page-settings" data-testid="settings-page">
      <nav className="settings-nav">
        {TABS.map((t) => (
          <NavLink key={t.id} to={`/settings/${t.id}`} className={({ isActive }) => cx('nav-item', isActive && 'nav-item-on')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <section className="settings-body">
        <h2>{current.label}</h2>
        <current.Component />
      </section>
    </div>
  );
}
