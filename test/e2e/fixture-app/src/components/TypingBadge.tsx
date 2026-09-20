import { useEffect, useState } from 'react';
import { bug } from '../bugs';

const QUIET_AT = Date.now() + 60 * 60_000;

function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Keeps the whole clock in state: the badge renders on every tick though the answer stays `false`. */
function useTypingByClock() {
  return QUIET_AT - useNow(250) < 60_000;
}

function useTypingSoon() {
  const [soon, setSoon] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setSoon(QUIET_AT - Date.now() < 60_000), 250);
    return () => clearInterval(id);
  }, []);
  return soon;
}

const useQuietSoon = bug('hidden-hook-state') ? useTypingByClock : useTypingSoon;

export const TypingBadge = () => {
  const quiet = useQuietSoon();
  return (
    <span className="badge muted" data-testid="typing-badge">
      {quiet ? 'quiet hours soon' : 'everyone is around'}
    </span>
  );
};
