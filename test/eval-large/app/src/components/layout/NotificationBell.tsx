import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Notification } from '../../api/types';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useAppDispatch, useAppSelector } from '../../store';
import { markAllRead, markRead } from '../../store/notifications';
import { selectIssueById, selectNotifications, selectUnreadCount } from '../../store/selectors';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { TimeAgo } from '../ui/TimeAgo';
import { useMember } from '../../queries/members';

export const VERB: Record<Notification['kind'], string> = {
  assigned: 'assigned you',
  mentioned: 'mentioned you in',
  commented: 'commented on',
  status_changed: 'changed the status of',
  due_soon: 'reminds you about',
};

export function NotificationLine({ n, onOpen }: { n: Notification; onOpen?(): void }) {
  const issue = useAppSelector((s) => selectIssueById(s, n.issueId));
  const actor = useMember(n.actorId);
  const dispatch = useAppDispatch();
  return (
    <Link
      to={issue ? `/issues/${issue.key}` : '/inbox'}
      className={n.readAt ? 'notif' : 'notif notif-unread'}
      onClick={() => {
        dispatch(markRead(n.id));
        onOpen?.();
      }}
    >
      <Avatar id={n.actorId} />
      <span className="grow">
        <b>{actor?.name.split(' ')[0] ?? 'Someone'}</b> {VERB[n.kind]} <b>{issue?.key}</b> <span className="muted">{issue?.title}</span>
      </span>
      <span className="muted small">
        <TimeAgo at={n.createdAt} />
      </span>
    </Link>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useAppSelector(selectUnreadCount);
  const root = useRef<HTMLDivElement>(null);
  useClickOutside(root, () => setOpen(false), open);
  return (
    <div className="bell" ref={root} data-testid="bell">
      <button className="icon-btn" aria-label={`${unread} unread notifications`} onClick={() => setOpen(!open)}>
        <Icon name="bell" />
        {unread > 0 && <span className="bell-badge">{unread}</span>}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}

function NotificationPanel({ onClose }: { onClose(): void }) {
  const notifications = useAppSelector(selectNotifications);
  const dispatch = useAppDispatch();
  return (
    <div className="menu menu-right notif-panel">
      <div className="row between pad-sm">
        <strong>Notifications</strong>
        <button className="link-btn" onClick={() => dispatch(markAllRead())}>
          Mark all read
        </button>
      </div>
      {notifications.slice(0, 8).map((n) => (
        <NotificationLine key={n.id} n={n} onOpen={onClose} />
      ))}
      <Link to="/inbox" className="notif-all" onClick={onClose}>
        See all in Inbox
      </Link>
    </div>
  );
}
