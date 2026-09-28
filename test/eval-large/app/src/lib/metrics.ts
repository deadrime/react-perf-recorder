import type { Issue, Project } from '../api/types';
import { DAY, startOfDay } from './time';

export interface DayPoint {
  day: number;
  byProject: Record<string, number>;
  total: number;
  /** Mean of the last seven days, this one included. */
  rolling: number;
  /** Median days from creation to completion of what was completed that day. */
  cycleDays: number | null;
  /** Issues open at the end of the day. */
  open: number;
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Issues completed per day and project over the last `days` days, with a 7-day rolling mean and the cycle time. */
export function buildThroughput(issues: Issue[], projects: Project[], days: number, now = Date.now()): DayPoint[] {
  const today = startOfDay(now);
  const points: DayPoint[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = today - d * DAY;
    const done = issues.filter((i) => i.completedAt !== null && startOfDay(i.completedAt) === day);
    const open = issues.filter((i) => startOfDay(i.createdAt) <= day && (i.completedAt === null || startOfDay(i.completedAt) > day)).length;
    const byProject: Record<string, number> = {};
    for (const project of projects) byProject[project.id] = done.filter((i) => i.projectId === project.id).length;
    points.push({
      day,
      byProject,
      total: done.length,
      rolling: 0,
      cycleDays: median(done.map((i) => (i.completedAt! - i.createdAt) / DAY)),
      open,
    });
  }
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - 6), i + 1);
    points[i].rolling = window.reduce((sum, p) => sum + p.total, 0) / window.length;
  }
  return points;
}

export function statusBreakdown(issues: Issue[]) {
  const counts = { open: 0, inProgress: 0, doneThisWeek: 0, overdue: 0 };
  const now = Date.now();
  for (const i of issues) {
    if (i.status === 'in_progress' || i.status === 'in_review') counts.inProgress++;
    if (i.status !== 'done' && i.status !== 'canceled') {
      counts.open++;
      if (i.dueDate && i.dueDate < now) counts.overdue++;
    }
    if (i.completedAt && now - i.completedAt < 7 * DAY) counts.doneThisWeek++;
  }
  return counts;
}
