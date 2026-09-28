import { Fragment, memo, useState, type DragEvent } from 'react';
import { shallowEqual } from 'react-redux';
import type { IssueStatus } from '../../api/types';
import { StatusIcon } from '../../components/ui/Badges';
import { useAuth } from '../../context/AuthContext';
import { orderAt } from '../../lib/boardOrder';
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

/** The slot under the pointer, as the number of cards above it, and whether a drop there leaves the dragged card be. */
function slotAt(e: DragEvent<HTMLElement>) {
  const cards = [...e.currentTarget.querySelectorAll('[data-testid="card"]')];
  const slot = cards.filter((card) => {
    const { top, height } = card.getBoundingClientRect();
    return e.clientY > top + height / 2;
  }).length;
  const dragged = cards.findIndex((card) => card.classList.contains('card-dragging'));
  return { slot, stays: dragged !== -1 && (slot === dragged || slot === dragged + 1) };
}

export const BoardColumn = memo(function BoardColumn({ projectId, status, onOpen }: Props) {
  const issues = useAppSelector((s) => selectColumnIssues(s, projectId, status), shallowEqual);
  const dispatch = useAppDispatch();
  const { can } = useAuth();
  const [over, setOver] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const points = issues.reduce((sum, i) => sum + (i.estimate ?? 0), 0);
  const shown = expanded ? issues : issues.slice(0, CARD_LIMIT);

  return (
    <section
      className={cx('column', over !== null && 'column-over')}
      data-testid={`column-${status}`}
      onDragStart={(e) => (e.target as HTMLElement).classList.add('card-dragging')}
      onDragEnd={(e) => (e.target as HTMLElement).classList.remove('card-dragging')}
      onDragOver={(e) => {
        if (!can('issue:edit')) return;
        e.preventDefault();
        // -1: over the column, but a drop would change nothing, so no line.
        const { slot, stays } = slotAt(e);
        const next = stays ? -1 : slot;
        if (next !== over) setOver(next);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(null);
        const id = e.dataTransfer.getData('text/issue-id');
        if (!id) return;
        const sortOrder = orderAt(issues, id, slotAt(e).slot);
        const moved = !issues.some((i) => i.id === id);
        if (moved) dispatch(updateIssue({ id, patch: { status, sortOrder: sortOrder ?? 0 } }));
        else if (sortOrder !== null) dispatch(updateIssue({ id, patch: { sortOrder } }));
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
        {shown.map((issue, i) => (
          <Fragment key={issue.id}>
            {over === i && <div className="drop-line" />}
            <IssueCard issue={issue} onOpen={onOpen} />
          </Fragment>
        ))}
        {over !== null && over >= shown.length && <div className="drop-line" />}
        {issues.length > shown.length && (
          <button className="link-btn" onClick={() => setExpanded(true)}>
            Show {issues.length - shown.length} more
          </button>
        )}
      </div>
    </section>
  );
});
