import { memo } from 'react';
import { bug } from '../bugs';
import { selectPositionIds, selectPositionInfo } from '../store/selectors';
import { useTerminalStore, type Terminal } from '../store/terminal';
import { useSettings } from './Settings';

const usePositionInfo = (id: string) => useTerminalStore((s) => selectPositionInfo(s, id));

const selectFreshIds = (s: Terminal) => Object.keys(s.positionById);

function usePositionIds() {
  return useTerminalStore(bug('new-array-selector') ? selectFreshIds : selectPositionIds);
}

const Pnl = ({ value }: { value: number }) => <td style={{ color: value < 0 ? 'red' : 'green' }}>{value}</td>;

export const PositionRow = memo(({ id }: { id: string }) => {
  const info = usePositionInfo(id);
  const { dense } = useSettings();
  // A new component type on every render: React unmounts the old cell and mounts a new one.
  const NestedPnl = () => <Pnl value={info.pnl} />;
  return (
    <tr data-testid={`position-${id}`} style={{ height: dense ? 18 : 24 }}>
      <td>{info.ticker}</td>
      <td>{info.size}</td>
      <td>{info.price}</td>
      {bug('nested-component') ? <NestedPnl /> : <Pnl value={info.pnl} />}
      <td>
        <button type="button" data-testid={`close-${id}`} onClick={() => useTerminalStore.getState().closePosition(id)}>
          close
        </button>
      </td>
    </tr>
  );
});

export const PositionTable = () => {
  const ids = usePositionIds();
  return (
    <table data-testid="positions">
      <tbody>
        {ids.map((id) => (
          <PositionRow key={id} id={id} />
        ))}
      </tbody>
    </table>
  );
};

export const OrdersTable = () => (
  <p data-testid="orders" style={{ margin: 0 }}>
    No orders
  </p>
);
