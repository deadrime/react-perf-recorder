import type { Issue, IssueStatus, Priority } from '../api/types';
import { matchesAllWords } from './search';

export type SortKey = 'updated' | 'created' | 'priority' | 'due' | 'key';

export interface IssueFilters {
  q: string;
  status: IssueStatus[];
  assignee: string[];
  priority: Priority[];
  label: string[];
  project: string | null;
  sort: SortKey;
}

export const EMPTY_FILTERS: IssueFilters = { q: '', status: [], assignee: [], priority: [], label: [], project: null, sort: 'updated' };

const list = (params: URLSearchParams, name: string) => params.get(name)?.split(',').filter(Boolean) ?? [];

export function parseFilters(params: URLSearchParams): IssueFilters {
  return {
    q: params.get('q') ?? '',
    status: list(params, 'status') as IssueStatus[],
    assignee: list(params, 'assignee'),
    priority: list(params, 'priority').map(Number) as Priority[],
    label: list(params, 'label'),
    project: params.get('project'),
    sort: (params.get('sort') as SortKey) ?? 'updated',
  };
}

export function writeFilters(params: URLSearchParams, filters: Partial<IssueFilters>) {
  const next = new URLSearchParams(params);
  for (const [name, value] of Object.entries(filters)) {
    const text = Array.isArray(value) ? value.join(',') : value == null ? '' : String(value);
    if (text && !(name === 'sort' && text === 'updated')) next.set(name, text);
    else next.delete(name);
  }
  return next;
}

export const activeFilterCount = (f: IssueFilters) => f.status.length + f.assignee.length + f.priority.length + f.label.length + (f.project ? 1 : 0);

const SORTERS: Record<SortKey, (a: Issue, b: Issue) => number> = {
  updated: (a, b) => b.updatedAt - a.updatedAt,
  created: (a, b) => b.createdAt - a.createdAt,
  priority: (a, b) => (a.priority || 9) - (b.priority || 9) || b.updatedAt - a.updatedAt,
  due: (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity),
  key: (a, b) => a.projectId.localeCompare(b.projectId) || a.number - b.number,
};

export function applyFilters(issues: Issue[], f: IssueFilters) {
  const status = new Set(f.status);
  const assignee = new Set(f.assignee);
  const priority = new Set(f.priority);
  const label = new Set(f.label);
  const result = issues.filter(
    (i) =>
      (!f.project || i.projectId === f.project) &&
      (!status.size || status.has(i.status)) &&
      (!assignee.size || assignee.has(i.assigneeId ?? 'none')) &&
      (!priority.size || priority.has(i.priority)) &&
      (!label.size || i.labelIds.some((l) => label.has(l))) &&
      (!f.q || matchesAllWords(f.q, `${i.key} ${i.title}`))
  );
  return result.sort(SORTERS[f.sort]);
}
