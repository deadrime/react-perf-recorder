import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { ActivityEvent } from '../../api/types';
import { Avatar } from '../../components/ui/Avatar';
import { TimeAgo } from '../../components/ui/TimeAgo';
import { PRIORITY_LABEL, STATUS_LABEL } from '../../lib/meta';
import { useMember } from '../../queries/members';
import { useAppSelector } from '../../store';
import { selectIssueById, selectRecentActivity } from '../../store/selectors';
import type { IssueStatus, Priority } from '../../api/types';

function describe(e: ActivityEvent) {
  switch (e.kind) {
    case 'status':
      return e.to ? `moved to ${STATUS_LABEL[e.to as IssueStatus]}` : 'changed the status of';
    case 'priority':
      return e.to !== undefined ? `set priority ${PRIORITY_LABEL[e.to as Priority]} on` : 'changed the priority of';
    case 'assignee':
      return 'reassigned';
    case 'estimate':
      return e.to ? `estimated ${e.to} points` : 'estimated';
    case 'comment':
      return 'commented on';
    case 'created':
      return 'created';
  }
}

const ActivityItem = memo(function ActivityItem({ event }: { event: ActivityEvent }) {
  const actor = useMember(event.actorId);
  const issue = useAppSelector((s) => selectIssueById(s, event.issueId));
  return (
    <li className="activity">
      <Avatar id={event.actorId} size="xs" />
      <span className="grow ellipsis">
        <b>{actor?.name.split(' ')[0]}</b> {describe(event)} {issue && <Link to={`/issues/${issue.key}`}>{issue.key}</Link>}
      </span>
      <span className="muted small">
        <TimeAgo at={event.at} />
      </span>
    </li>
  );
});

export function ActivityFeed({ limit = 15 }: { limit?: number }) {
  const events = useAppSelector(selectRecentActivity);
  return (
    <section className="panel" data-testid="activity">
      <h3>Recent activity</h3>
      <ul className="activity-list">
        {events.slice(0, limit).map((e) => (
          <ActivityItem key={e.id} event={e} />
        ))}
      </ul>
    </section>
  );
}
