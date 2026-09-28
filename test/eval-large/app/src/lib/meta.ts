import type { IssueStatus, Priority } from '../api/types';

export const STATUSES: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
export const BOARD_STATUSES: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

export const STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  canceled: 'Canceled',
};

export const PRIORITIES: Priority[] = [1, 2, 3, 4, 0];

export const PRIORITY_LABEL: Record<Priority, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

export const isOpen = (status: IssueStatus) => status !== 'done' && status !== 'canceled';
