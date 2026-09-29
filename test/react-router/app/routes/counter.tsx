import { memo, useState } from 'react';
import { useClicks } from '../store';

const Label = memo(({ n }: { n: number }) => <span data-testid="label">clicked {n}</span>);

function Clicks() {
  const clicks = useClicks((s) => s.clicks);
  return <span data-testid="clicks">{clicks}</span>;
}

export default function Counter() {
  const [n, setN] = useState(0);
  const click = useClicks((s) => s.click);
  return (
    <main>
      <button
        data-testid="more"
        onClick={() => {
          setN(n + 1);
          click();
        }}
      >
        more
      </button>
      <Label n={n} />
      <Clicks />
    </main>
  );
}
