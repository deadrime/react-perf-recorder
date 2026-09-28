import { createSelector } from '@reduxjs/toolkit';
import { memoize } from 'proxy-memoize';
import type { Issue, IssueStatus } from '../api/types';
import type { RootState } from './index';
import { issueSelectors } from './issues';
import { notificationSelectors } from './notifications';

export const selectIssuesState = (state: RootState) => state.issues;
export const selectAllIssues = (state: RootState) => issueSelectors.selectAll(state.issues);
export const selectIssueEntities = (state: RootState) => state.issues.entities;
export const selectIssueById = (state: RootState, id: string): Issue | undefined => state.issues.entities[id];
export const selectIssuesReady = (state: RootState) => state.issues.status === 'ready';

const selectIdByKey = createSelector([selectAllIssues], (issues) => new Map(issues.map((i) => [i.key, i.id])));

export const selectIssueByKey = (state: RootState, key: string | null | undefined) => {
  if (!key) return undefined;
  const id = selectIdByKey(state).get(key);
  return id ? state.issues.entities[id] : undefined;
};

export const selectProjectIssues = createSelector([selectAllIssues, (_: RootState, projectId: string) => projectId], (issues, projectId) =>
  issues.filter((i) => i.projectId === projectId)
);

export const selectColumnIssues = createSelector(
  [selectProjectIssues, (_: RootState, _projectId: string, status: IssueStatus) => status],
  (issues, status) => issues.filter((i) => i.status === status).sort((a, b) => a.priority - b.priority || b.updatedAt - a.updatedAt)
);

export const selectOpenCountByProject = createSelector([selectAllIssues], (issues) => {
  const counts: Record<string, number> = {};
  for (const issue of issues)
    if (issue.status !== 'done' && issue.status !== 'canceled') counts[issue.projectId] = (counts[issue.projectId] ?? 0) + 1;
  return counts;
});

export const selectMyOpenCount = createSelector(
  [selectAllIssues, (_: RootState, userId: string | undefined) => userId],
  (issues, userId) => issues.filter((i) => i.assigneeId === userId && i.status !== 'done' && i.status !== 'canceled').length
);

export const selectNotifications = (state: RootState) => notificationSelectors.selectAll(state.notifications);
export const selectUnreadCount = createSelector([selectNotifications], (all) => all.filter((n) => !n.readAt).length);

export const selectRecentActivity = (state: RootState) => state.activity.events;

/** Open issues and points per person, for the workload table: proxy-memoize reruns it only when those fields change. */
export const selectWorkload = memoize((state: RootState) => {
  const rows: Record<string, { open: number; inProgress: number; points: number; overdue: number }> = {};
  const now = Date.now();
  for (const id of state.issues.ids) {
    const issue = state.issues.entities[id];
    if (!issue.assigneeId || issue.status === 'done' || issue.status === 'canceled') continue;
    const row = (rows[issue.assigneeId] ??= { open: 0, inProgress: 0, points: 0, overdue: 0 });
    row.open++;
    if (issue.status === 'in_progress' || issue.status === 'in_review') row.inProgress++;
    row.points += issue.estimate ?? 0;
    if (issue.dueDate && issue.dueDate < now) row.overdue++;
  }
  return rows;
});
