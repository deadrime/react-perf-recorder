import { useAppStore } from '../../store/app';
import { cx } from '../../lib/cx';
import { Icon } from '../ui/Icon';

export function SyncStatus() {
  const connection = useAppStore((s) => s.connection);
  const label =
    connection.status === 'live' ? `Live · ${connection.latencyMs} ms` : connection.status === 'connecting' ? 'Connecting…' : 'Reconnecting…';
  return (
    <span className={cx('sync', `sync-${connection.status}`)} data-testid="sync">
      <Icon name="wifi" size={14} />
      {label}
    </span>
  );
}
