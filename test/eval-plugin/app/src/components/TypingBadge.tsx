import { useEffect, useState } from 'react';

const QUIET_AT = Date.now() + 60 * 60_000;

function useQuietSoon() {
  const [soon, setSoon] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setSoon(QUIET_AT - Date.now() < 60_000), 250);
    return () => clearInterval(id);
  }, []);
  return soon;
}

export const TypingBadge = () => {
  const quiet = useQuietSoon();
  return (
    <span className="badge muted" data-testid="typing-badge">
      {quiet ? 'quiet hours soon' : 'everyone is around'}
    </span>
  );
};
