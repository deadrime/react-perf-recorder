import { memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClicks } from './store';
import { useTicker } from './useTicker';

const Label = memo(({ n }: { n: number }) => <span data-testid="clicks">{n}</span>);

function Row({ text }: { text: string }) {
  return <li>{text}</li>;
}

const tickMs = Number(new URLSearchParams(location.search).get('tick')) || 10_000;

export function Counter() {
  const clicks = useClicks((s) => s.clicks);
  const more = useClicks((s) => s.more);
  const [local, setLocal] = useState(0);
  const tick = useTicker(tickMs);
  const { data } = useQuery({ queryKey: ['online'], queryFn: () => Promise.resolve(3) });
  return (
    <div>
      <button
        data-testid="more"
        onClick={() => {
          more();
          setLocal(local + 1);
        }}
      >
        more
      </button>
      <Label n={clicks} />
      <p>{data ?? '…'} online</p>
      <ul>
        {[1, 2, 3].map((i) => (
          <Row key={i} text={`row ${i} ${tick}`} />
        ))}
      </ul>
    </div>
  );
}
