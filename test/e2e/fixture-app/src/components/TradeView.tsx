import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bug } from '../bugs';
import { useTerminalStore } from '../store/terminal';
import { ApiKeyForm } from './ApiKeyForm';
import { FundingCountdown } from './FundingCountdown';
import { Header } from './Header';
import { MarketStats } from './MarketStats';
import { OrderForm } from './OrderForm';
import { OrdersPanel } from './OrdersPanel';
import { SettingsProvider } from './Settings';

function useLayoutWithParams() {
  useSearchParams();
  return { columns: 2 };
}

function useLayout() {
  return { columns: 2 };
}

/** A layout hook that also read the URL made the whole page render on every tab switch. */
const useTradeLayout = bug('router-in-layout') ? useLayoutWithParams : useLayout;

const ConnectionStatus = () => {
  const block = useTerminalStore((s) => s.blockTimestamp);
  return <small data-testid="block">block {block}</small>;
};

export const TradeView = () => {
  const { columns } = useTradeLayout();
  return (
    <main style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16 }}>
      <div>
        <OrdersPanel />
        <MarketStats />
        <FundingCountdown />
      </div>
      <aside data-testid="exchange-panel">
        <OrderForm />
        <ApiKeyForm />
      </aside>
    </main>
  );
};

/** Renders on every block; the page below comes as children and skips, unless the settings object is new. */
const SettingsByBlock = ({ children }: { children: ReactNode }) => {
  const block = useTerminalStore((s) => s.blockTimestamp);
  return <SettingsProvider dense={block < 0}>{children}</SettingsProvider>;
};

export const Layout = () => (
  <SettingsByBlock>
    <Header />
    <ConnectionStatus />
    <TradeView />
  </SettingsByBlock>
);
