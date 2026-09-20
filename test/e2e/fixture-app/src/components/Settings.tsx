import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { bug } from '../bugs';

interface Settings {
  dense: boolean;
  currency: string;
}

const SettingsContext = createContext<Settings>({ dense: false, currency: 'USD' });

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ dense, children }: { dense: boolean; children: ReactNode }) => {
  const stable = useMemo(() => ({ dense, currency: 'USD' }), [dense]);
  return <SettingsContext.Provider value={bug('inline-context') ? { dense, currency: 'USD' } : stable}>{children}</SettingsContext.Provider>;
};

export const CurrencyBadge = () => {
  const { currency } = useSettings();
  return <span data-testid="currency">{currency}</span>;
};
