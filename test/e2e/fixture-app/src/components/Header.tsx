import { bug } from '../bugs';
import { selectAccount, selectBalance, selectHealth } from '../store/selectors';
import { useTerminalStore } from '../store/terminal';
import { FundingBadge } from './FundingBadge';
import { CurrencyBadge } from './Settings';

// Flags are fixed for the page's life, so picking a hook by flag keeps the hook order stable.
function useWholeAccountBalance() {
  return useTerminalStore(selectAccount).balance;
}

function useBalance() {
  return useTerminalStore(selectBalance);
}

const useAccountBalance = bug('whole-object') ? useWholeAccountBalance : useBalance;

const Balance = () => {
  const balance = useAccountBalance();
  return <b data-testid="balance">{balance.toFixed(2)}</b>;
};

/** The bar moves in steps of 10%: subscribing to the exact health renders it on every tick for the same width. */
function useExactHealth() {
  return Math.round(useTerminalStore(selectHealth) / 10) * 10;
}

function useHealthStep() {
  return useTerminalStore((s) => Math.round(selectHealth(s) / 10) * 10);
}

export const HealthBar = () => {
  const step = (bug('exact-value') ? useExactHealth : useHealthStep)();
  return (
    <div data-testid="health" style={{ width: 120, height: 6, background: '#eee' }}>
      <div style={{ width: `${step}%`, height: 6, background: 'green' }} />
    </div>
  );
};

export const Header = () => (
  <header data-testid="header" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <strong>Terminal</strong>
    <Balance />
    <CurrencyBadge />
    <HealthBar />
    <FundingBadge />
  </header>
);
