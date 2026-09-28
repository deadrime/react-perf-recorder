import { memo } from 'react';
import { useMember } from '../../queries/members';
import { usePresenceStore } from '../../store/presence';
import { cx } from '../../lib/cx';

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

interface Props {
  id: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showPresence?: boolean;
}

export const Avatar = memo(function Avatar({ id, size = 'sm', showPresence = false }: Props) {
  const member = useMember(id);
  const online = usePresenceStore((s) => showPresence && !!id && s.online.includes(id));
  if (!id) return <span className={cx('avatar', `avatar-${size}`, 'avatar-empty')} title="Unassigned" />;
  return (
    <span className={cx('avatar', `avatar-${size}`)} style={{ background: member?.color ?? '#555' }} title={member?.name}>
      {member ? initials(member.name) : ''}
      {showPresence && online && <span className="avatar-dot" aria-label="online" />}
    </span>
  );
});

export function AvatarStack({ ids, max = 4, size = 'xs' }: { ids: string[]; max?: number; size?: Props['size'] }) {
  const shown = ids.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((id) => (
        <Avatar key={id} id={id} size={size} />
      ))}
      {ids.length > max && <span className={cx('avatar', `avatar-${size}`, 'avatar-more')}>+{ids.length - max}</span>}
    </span>
  );
}
