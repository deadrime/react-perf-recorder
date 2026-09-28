import { memo } from 'react';
import type { IssueStatus, Priority } from '../../api/types';
import { PriorityIcon, StatusIcon } from '../../components/ui/Badges';
import { Button } from '../../components/ui/Button';
import { Dropdown } from '../../components/ui/Dropdown';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { activeFilterCount, EMPTY_FILTERS, type IssueFilters, type SortKey } from '../../lib/filters';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../../lib/meta';
import { useMembers } from '../../queries/members';
import { useLabels, useProjects } from '../../queries/workspace';
import { SearchBox } from './SearchBox';

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Created' },
  { value: 'priority', label: 'Priority' },
  { value: 'due', label: 'Due date' },
  { value: 'key', label: 'Key' },
];

const toggled = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

interface Props {
  filters: IssueFilters;
  setFilters(patch: Partial<IssueFilters>): void;
  total: number;
}

export const IssuesToolbar = memo(function IssuesToolbar({ filters, setFilters, total }: Props) {
  const { user } = useAuth();
  const { data: members = [] } = useMembers();
  const { data: labels = [] } = useLabels();
  const { data: projects = [] } = useProjects();
  const mine = !!user && filters.assignee.length === 1 && filters.assignee[0] === user.id;
  const count = activeFilterCount(filters);

  return (
    <div className="toolbar" data-testid="toolbar">
      <SearchBox value={filters.q} onSearch={(q) => setFilters({ q })} />
      <Button size="sm" variant={mine ? 'primary' : 'secondary'} icon="user" onClick={() => setFilters({ assignee: mine || !user ? [] : [user.id] })}>
        My issues
      </Button>
      <Dropdown<IssueStatus>
        trigger={<span className="btn btn-secondary btn-sm">Status{filters.status.length ? ` · ${filters.status.length}` : ''}</span>}
        options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], icon: <StatusIcon status={s} /> }))}
        selected={filters.status}
        multiple
        onSelect={(s) => setFilters({ status: toggled(filters.status, s) })}
        testId="filter-status"
      />
      <Dropdown<string>
        trigger={<span className="btn btn-secondary btn-sm">Assignee{filters.assignee.length ? ` · ${filters.assignee.length}` : ''}</span>}
        options={[{ value: 'none', label: 'Unassigned' }, ...members.map((m) => ({ value: m.id, label: m.name, hint: m.handle }))]}
        selected={filters.assignee}
        multiple
        searchable
        onSelect={(id) => setFilters({ assignee: toggled(filters.assignee, id) })}
        testId="filter-assignee"
      />
      <Dropdown<Priority>
        trigger={<span className="btn btn-secondary btn-sm">Priority{filters.priority.length ? ` · ${filters.priority.length}` : ''}</span>}
        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p], icon: <PriorityIcon priority={p} /> }))}
        selected={filters.priority}
        multiple
        onSelect={(p) => setFilters({ priority: toggled(filters.priority, p) })}
      />
      <Dropdown<string>
        trigger={<span className="btn btn-secondary btn-sm">Label{filters.label.length ? ` · ${filters.label.length}` : ''}</span>}
        options={labels.map((l) => ({ value: l.id, label: l.name, icon: <span className="dot" style={{ background: l.color }} /> }))}
        selected={filters.label}
        multiple
        searchable
        onSelect={(id) => setFilters({ label: toggled(filters.label, id) })}
      />
      <Dropdown<string>
        trigger={<span className="btn btn-secondary btn-sm">{projects.find((p) => p.id === filters.project)?.name ?? 'All projects'}</span>}
        options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        selected={[filters.project ?? '']}
        onSelect={(id) => setFilters({ project: id || null })}
      />
      {count > 0 && (
        <Button size="sm" variant="ghost" icon="close" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q, sort: filters.sort })}>
          Clear {count}
        </Button>
      )}
      <div className="grow" />
      <span className="muted small" data-testid="issue-count">
        {total} issues
      </span>
      <Dropdown<SortKey>
        trigger={
          <span className="btn btn-ghost btn-sm">
            <Icon name="sort" size={14} /> {SORTS.find((s) => s.value === filters.sort)?.label}
          </span>
        }
        options={SORTS}
        selected={[filters.sort]}
        align="right"
        onSelect={(sort) => setFilters({ sort })}
      />
    </div>
  );
});
