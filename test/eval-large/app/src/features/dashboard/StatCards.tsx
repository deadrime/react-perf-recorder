import { useMemo } from 'react';
import { statusBreakdown } from '../../lib/metrics';
import { useAppSelector } from '../../store';
import { selectAllIssues } from '../../store/selectors';

export function StatCards() {
  const issues = useAppSelector(selectAllIssues);
  const counts = useMemo(() => statusBreakdown(issues), [issues]);
  const cards = [
    { label: 'Open', value: counts.open },
    { label: 'In progress', value: counts.inProgress },
    { label: 'Done this week', value: counts.doneThisWeek },
    { label: 'Overdue', value: counts.overdue, tone: counts.overdue ? 'danger' : undefined },
  ];
  return (
    <div className="stats" data-testid="stats">
      {cards.map((c) => (
        <div key={c.label} className="stat">
          <span className="muted small">{c.label}</span>
          <strong className={c.tone}>{c.value}</strong>
        </div>
      ))}
    </div>
  );
}
