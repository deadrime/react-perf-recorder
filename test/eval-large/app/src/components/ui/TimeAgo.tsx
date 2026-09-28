import { useNow } from '../../hooks/useNow';
import { formatDateTime, timeAgo } from '../../lib/time';

export function TimeAgo({ at, prefix = '' }: { at: number; prefix?: string }) {
  const now = useNow(30_000);
  return (
    <time dateTime={new Date(at).toISOString()} title={formatDateTime(at)}>
      {prefix}
      {timeAgo(at, now)}
    </time>
  );
}
