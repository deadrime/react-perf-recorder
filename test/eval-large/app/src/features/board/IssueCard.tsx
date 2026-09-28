import { memo } from 'react';
import type { Issue } from '../../api/types';
import { Avatar, AvatarStack } from '../../components/ui/Avatar';
import { LabelChips, PriorityIcon } from '../../components/ui/Badges';
import { Icon } from '../../components/ui/Icon';
import { Tooltip } from '../../components/ui/Tooltip';
import { cx } from '../../lib/cx';
import { dueLabel } from '../../lib/time';
import { useMembersById } from '../../queries/members';
import { useAppStore } from '../../store/app';
import { useViewers } from '../../store/presence';

interface Props {
  issue: Issue;
  onOpen(key: string): void;
}

export const IssueCard = memo(function IssueCard({ issue, onOpen }: Props) {
  const viewers = useViewers(issue.key);
  const members = useMembersById();
  const showEstimates = useAppStore((s) => s.showEstimates);
  const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;
  const names = viewers.map((id) => members?.get(id)?.name.split(' ')[0]).join(', ');

  return (
    <Tooltip label={`${names} viewing`} disabled={!viewers.length}>
      <article
        className={cx('card', viewers.length > 0 && 'card-live')}
        draggable
        data-testid="card"
        data-key={issue.key}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/issue-id', issue.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onOpen(issue.key)}
      >
        <div className="row gap-sm">
          <span className="muted small">{issue.key}</span>
          <div className="grow" />
          {viewers.length > 0 && <AvatarStack ids={viewers} max={3} />}
          <Avatar id={issue.assigneeId} size="xs" />
        </div>
        <p className="card-title">{issue.title}</p>
        <div className="row gap-sm wrap">
          <PriorityIcon priority={issue.priority} />
          <LabelChips ids={issue.labelIds} max={2} />
          {due && <span className={cx('due', `due-${due.tone}`)}>{due.text}</span>}
          <div className="grow" />
          {issue.commentCount > 0 && (
            <span className="muted small">
              <Icon name="comment" size={12} /> {issue.commentCount}
            </span>
          )}
          {showEstimates && issue.estimate !== null && <span className="estimate">{issue.estimate}</span>}
        </div>
      </article>
    </Tooltip>
  );
});
