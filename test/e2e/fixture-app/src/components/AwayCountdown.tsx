import { useEffect, useState } from 'react';

const useCountdown = (periodMs: number) => {
  const [left, setLeft] = useState(periodMs);
  useEffect(() => {
    const id = setInterval(() => setLeft((ms) => (ms > 250 ? ms - 250 : periodMs)), 250);
    return () => clearInterval(id);
  }, [periodMs]);
  return left;
};

export const AwayCountdown = () => {
  const left = useCountdown(8000);
  return (
    <p className="side-line" data-testid="away">
      away in <b>{(left / 1000).toFixed(2)}s</b>
    </p>
  );
};
