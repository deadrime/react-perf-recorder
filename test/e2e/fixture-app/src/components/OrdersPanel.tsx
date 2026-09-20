import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bug } from '../bugs';
import { OrdersTable, PositionTable } from './Positions';

export const useActiveTab = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'orders' ? 'orders' : 'positions';
  return [tab, (next: string) => setParams((p) => ({ ...Object.fromEntries(p), tab: next }))] as const;
};

/** The shown tab copied into state by an effect: one more commit after every switch. */
function useShownTabFromEffect(tab: string) {
  const [shown, setShown] = useState(tab);
  useEffect(() => setShown(tab), [tab]);
  return shown;
}

function useShownTab(tab: string) {
  return tab;
}

const useShown = bug('effect-derived-state') ? useShownTabFromEffect : useShownTab;

export const OrdersPanel = () => {
  const [active, setTab] = useActiveTab();
  const tab = useShown(active);
  return (
    <section data-testid="orders-panel">
      <div role="tablist">
        {['positions', 'orders'].map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} data-testid={`tab-${name}`} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </div>
      {tab === 'positions' ? <PositionTable /> : <OrdersTable />}
    </section>
  );
};
