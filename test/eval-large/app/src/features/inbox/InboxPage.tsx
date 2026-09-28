import { useState } from 'react';
import { NotificationLine } from '../../components/layout/NotificationBell';
import { Button } from '../../components/ui/Button';
import { EmptyState, Tabs } from '../../components/ui/Misc';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAppDispatch, useAppSelector } from '../../store';
import { markAllRead } from '../../store/notifications';
import { selectNotifications, selectUnreadCount } from '../../store/selectors';

type Show = 'unread' | 'all';

export function InboxPage() {
  const [show, setShow] = useState<Show>('unread');
  const notifications = useAppSelector(selectNotifications);
  const unread = useAppSelector(selectUnreadCount);
  const dispatch = useAppDispatch();
  useDocumentTitle(unread ? `Inbox (${unread})` : 'Inbox');
  const shown = show === 'unread' ? notifications.filter((n) => !n.readAt) : notifications;
  return (
    <div className="page page-inbox" data-testid="inbox-page">
      <div className="toolbar">
        <Tabs<Show>
          value={show}
          onChange={setShow}
          options={[
            { value: 'unread', label: `Unread · ${unread}` },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="grow" />
        <Button size="sm" variant="ghost" icon="check" disabled={!unread} onClick={() => dispatch(markAllRead())}>
          Mark all read
        </Button>
      </div>
      <div className="panel inbox-list">
        {shown.length ? shown.map((n) => <NotificationLine key={n.id} n={n} />) : <EmptyState title="You are all caught up" />}
      </div>
    </div>
  );
}
