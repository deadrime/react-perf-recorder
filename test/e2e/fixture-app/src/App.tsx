import { useQuery } from '@tanstack/react-query';
import { memo, useState } from 'react';
import { selectCount, selectRow, useCounterStore } from './store';

const useCount = () => useCounterStore(selectCount);

export const Counter = () => {
  const count = useCount();
  return (
    <button type="button" data-testid="increment" onClick={() => useCounterStore.getState().increment()}>
      count {count}
    </button>
  );
};

export const Row = memo(({ id, style }: { id: string; style: object }) => {
  const row = useCounterStore((s) => selectRow(s, id));
  return (
    <li style={style} data-testid={`row-${id}`}>
      {row.id}: {row.price}
    </li>
  );
});

export const Rows = () => (
  <ul data-testid="rows">
    {['a', 'b', 'c'].map((id) => (
      <Row key={id} id={id} style={{ color: 'black' }} />
    ))}
  </ul>
);

export const AmountForm = () => {
  const [amount, setAmount] = useState('');
  return (
    <form data-testid="form" onSubmit={(e) => e.preventDefault()}>
      <input name="amount" data-testid="amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
      <input name="password" type="password" data-testid="password" defaultValue="" />
      <span>{amount.length}</span>
    </form>
  );
};

const Status = () => {
  const query = useQuery({ queryKey: ['status'], queryFn: async () => ({ ok: true }) });
  return <p data-testid="status">{query.data?.ok ? 'ok' : 'loading'}</p>;
};

export const Panel = () => (
  <section data-testid="panel">
    <Counter />
    <Rows />
  </section>
);

export const App = () => (
  <main>
    <Panel />
    <AmountForm />
    <Status />
    <button type="button" data-testid="tick" onClick={() => useCounterStore.getState().tick()}>
      tick
    </button>
  </main>
);
