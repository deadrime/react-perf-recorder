import { useEffect, useState } from 'react';

const useCountdown = (periodMs: number) => {
  const [left, setLeft] = useState(periodMs);
  useEffect(() => {
    const id = setInterval(() => setLeft((ms) => (ms > 250 ? ms - 250 : periodMs)), 250);
    return () => clearInterval(id);
  }, [periodMs]);
  return left;
};

export const FundingCountdown = () => {
  const left = useCountdown(8000);
  return <span data-testid="funding">funding in {(left / 1000).toFixed(2)}s</span>;
};
