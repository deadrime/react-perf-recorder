import { memo } from 'react';
import type { Issue } from '../../api/types';
import { Avatar } from '../../components/ui/Avatar';
import { LabelChips, PriorityIcon, StatusIcon } from '../../components/ui/Badges';
import { Icon } from '../../components/ui/Icon';
import { TimeAgo } from '../../components/ui/TimeAgo';
import { cx } from '../../lib/cx';
import { dueLabel } from '../../lib/time';
import { useAppStore } from '../../store/app';

interface Props {
  issue: Issue;
  selected: boolean;
  active: boolean;
  onToggle(id: string): void;
  onOpen(key: string): void;
}

export const IssueRow = memo(function IssueRow({ issue, selected, active, onToggle, onOpen }: Props) {
  const showEstimates = useAppStore((s) => s.showEstimates);
  const due = issue.dueDate && issue.status !== 'done' ? dueLabel(issue.dueDate) : null;
  return (
    <div
      className={cx('row-issue', selected && 'row-selected', active && 'row-active')}
      role="row"
      data-testid="issue-row"
      data-key={issue.key}
      onClick={() => onOpen(issue.key)}
    >
      <span className="cell-check" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={() => onToggle(issue.id)} aria-label={`Select ${issue.key}`} />
      </span>
      <PriorityIcon priority={issue.priority} />
      <span className="cell-key muted">{issue.key}</span>
      <StatusIcon status={issue.status} />
      <span className="cell-title ellipsis">{issue.title}</span>
      <LabelChips ids={issue.labelIds} max={2} />
      {due && <span className={cx('due', `due-${due.tone}`)}>{due.text}</span>}
      {showEstimates && issue.estimate !== null && <span className="estimate">{issue.estimate}</span>}
      {issue.commentCount > 0 && (
        <span className="cell-comments muted">
          <Icon name="comment" size={13} /> {issue.commentCount}
        </span>
      )}
      <span className="cell-updated muted small">
        <TimeAgo at={issue.updatedAt} />
      </span>
      <Avatar id={issue.assigneeId} showPresence />
      <span className="row-actions">
        <button
          className="icon-btn"
          aria-label="Copy link"
          onClick={(e) => (e.stopPropagation(), navigator.clipboard?.writeText(`${location.origin}/#/issues/${issue.key}`))}
        >
          <Icon name="link" size={14} />
        </button>
      </span>
    </div>
  );
});
