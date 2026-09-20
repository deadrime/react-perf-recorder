import { useEffect, useState } from 'react';
import { bug } from '../bugs';

const FUNDING_AT = Date.now() + 60 * 60_000;

function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Keeps the whole clock in state: the badge renders on every tick though the answer stays `false`. */
function useFundingSoonByClock() {
  return FUNDING_AT - useNow(250) < 60_000;
}

function useFundingSoon() {
  const [soon, setSoon] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setSoon(FUNDING_AT - Date.now() < 60_000), 250);
    return () => clearInterval(id);
  }, []);
  return soon;
}

const useSoon = bug('hidden-hook-state') ? useFundingSoonByClock : useFundingSoon;

export const FundingBadge = () => {
  const soon = useSoon();
  return <span data-testid="funding-badge">{soon ? 'funding soon' : 'funding later'}</span>;
};
