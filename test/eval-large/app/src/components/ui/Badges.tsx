import { memo } from 'react';
import type { IssueStatus, Priority } from '../../api/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../../lib/meta';
import { useLabelsById } from '../../queries/workspace';

const STATUS_COLOR: Record<IssueStatus, string> = {
  backlog: '#6e6e7a',
  todo: '#b4b4be',
  in_progress: '#f5a524',
  in_review: '#0091ff',
  done: '#30a46c',
  canceled: '#6e6e7a',
};

export function StatusIcon({ status, size = 14 }: { status: IssueStatus; size?: number }) {
  const color = STATUS_COLOR[status];
  const fill = { backlog: 0, todo: 0, in_progress: 0.5, in_review: 0.75, done: 1, canceled: 1 }[status];
  const r = 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-label={STATUS_LABEL[status]}>
      <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={status === 'backlog' ? '2 2' : undefined} />
      {fill > 0 && (
        <circle
          cx="7"
          cy="7"
          r={r / 2}
          fill="none"
          stroke={color}
          strokeWidth={r}
          strokeDasharray={`${(c / 2) * fill} ${c}`}
          transform="rotate(-90 7 7)"
        />
      )}
    </svg>
  );
}

export function PriorityIcon({ priority }: { priority: Priority }) {
  if (priority === 1)
    return (
      <span className="prio prio-urgent" title={PRIORITY_LABEL[1]}>
        !
      </span>
    );
  const bars = priority === 0 ? 0 : 5 - priority;
  return (
    <span className="prio" title={PRIORITY_LABEL[priority]}>
      {[1, 2, 3].map((b) => (
        <i key={b} className={b <= bars ? 'on' : undefined} style={{ height: 3 + b * 3 }} />
      ))}
    </span>
  );
}

export const LabelChips = memo(function LabelChips({ ids, max = 3 }: { ids: string[]; max?: number }) {
  const labels = useLabelsById();
  if (!ids.length || !labels) return null;
  return (
    <span className="chips">
      {ids.slice(0, max).map((id) => (
        <span key={id} className="chip">
          <i style={{ background: labels[id]?.color }} />
          {labels[id]?.name}
        </span>
      ))}
      {ids.length > max && <span className="chip">+{ids.length - max}</span>}
    </span>
  );
});

export const Count = ({ n }: { n: number }) => (n > 0 ? <span className="count">{n > 99 ? '99+' : n}</span> : null);
