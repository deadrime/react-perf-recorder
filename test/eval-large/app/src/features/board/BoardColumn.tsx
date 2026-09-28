import { memo, useState } from 'react';
import { shallowEqual } from 'react-redux';
import type { IssueStatus } from '../../api/types';
import { StatusIcon } from '../../components/ui/Badges';
import { useAuth } from '../../context/AuthContext';
import { cx } from '../../lib/cx';
import { STATUS_LABEL } from '../../lib/meta';
import { useAppDispatch, useAppSelector } from '../../store';
import { updateIssue } from '../../store/issues';
import { selectColumnIssues } from '../../store/selectors';
import { IssueCard } from './IssueCard';

interface Props {
  projectId: string;
  status: IssueStatus;
  onOpen(key: string): void;
}

const CARD_LIMIT = 40;

export const BoardColumn = memo(function BoardColumn({ projectId, status, onOpen }: Props) {
  const issues = useAppSelector((s) => selectColumnIssues(s, projectId, status), shallowEqual);
  const dispatch = useAppDispatch();
  const { can } = useAuth();
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const points = issues.reduce((sum, i) => sum + (i.estimate ?? 0), 0);
  const shown = expanded ? issues : issues.slice(0, CARD_LIMIT);

  return (
    <section
      className={cx('column', over && 'column-over')}
      data-testid={`column-${status}`}
      onDragOver={(e) => {
        if (!can('issue:edit')) return;
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData('text/issue-id');
        if (id) dispatch(updateIssue({ id, patch: { status } }));
      }}
    >
      <header className="column-head">
        <StatusIcon status={status} />
        <strong>{STATUS_LABEL[status]}</strong>
        <span className="muted">{issues.length}</span>
        <div className="grow" />
        {points > 0 && <span className="muted small">{points} pts</span>}
      </header>
      <div className="column-body">
        {shown.map((issue) => (
          <IssueCard key={issue.id} issue={issue} onOpen={onOpen} />
        ))}
        {issues.length > shown.length && (
          <button className="link-btn" onClick={() => setExpanded(true)}>
            Show {issues.length - shown.length} more
          </button>
        )}
      </div>
    </section>
  );
});
