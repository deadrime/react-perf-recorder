import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { bug } from '../bugs';

interface Settings {
  dense: boolean;
  timezone: string;
}

const SettingsContext = createContext<Settings>({ dense: false, timezone: 'UTC' });

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ dense, children }: { dense: boolean; children: ReactNode }) => {
  const stable = useMemo(() => ({ dense, timezone: 'UTC' }), [dense]);
  return <SettingsContext.Provider value={bug('inline-context') ? { dense, timezone: 'UTC' } : stable}>{children}</SettingsContext.Provider>;
};

export const TimezoneBadge = () => {
  const { timezone } = useSettings();
  return (
    <span className="badge muted" data-testid="timezone">
      {timezone}
    </span>
  );
};
