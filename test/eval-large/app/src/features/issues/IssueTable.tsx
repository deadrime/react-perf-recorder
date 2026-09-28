import { useCallback, useState } from 'react';
import type { Issue } from '../../api/types';
import { EmptyState } from '../../components/ui/Misc';
import { useHotkey } from '../../hooks/useHotkey';
import { BulkBar } from './BulkBar';
import { IssueRow } from './IssueRow';

interface Props {
  issues: Issue[];
  onOpen(key: string): void;
}

export function IssueTable({ issues, onOpen }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState(-1);

  const toggle = useCallback(
    (id: string) =>
      setSelected((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    []
  );

  useHotkey('j', () => setActive((i) => Math.min(i + 1, issues.length - 1)));
  useHotkey('k', () => setActive((i) => Math.max(i - 1, 0)));
  useHotkey('enter', () => issues[active] && onOpen(issues[active].key), active >= 0);
  useHotkey('x', () => issues[active] && toggle(issues[active].id), active >= 0);

  if (!issues.length) return <EmptyState title="No issues match">Try removing a filter or searching for something else.</EmptyState>;

  return (
    <div className="table" role="table" data-testid="issue-table">
      {issues.map((issue, i) => (
        <IssueRow key={issue.id} issue={issue} selected={selected.has(issue.id)} active={i === active} onToggle={toggle} onOpen={onOpen} />
      ))}
      {selected.size > 0 && <BulkBar ids={selected} onClear={() => setSelected(new Set())} />}
    </div>
  );
}
