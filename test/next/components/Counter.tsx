'use client';

import { memo, useState } from 'react';
import { useClicks } from './store';
import { useTicker } from './useTicker';

const Label = memo(({ n }: { n: number }) => <span data-testid="clicks">{n}</span>);

function Row({ text }: { text: string }) {
  return <li>{text}</li>;
}

export function Counter({ tickMs = 10_000 }: { tickMs?: number }) {
  const clicks = useClicks((s) => s.clicks);
  const more = useClicks((s) => s.more);
  const [local, setLocal] = useState(0);
  const tick = useTicker(tickMs);
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
      <ul>
        {[1, 2, 3].map((i) => (
          <Row key={i} text={`row ${i} ${tick}`} />
        ))}
      </ul>
    </div>
  );
}
