const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function timeAgo(at: number, now = Date.now()) {
  const diff = Math.max(0, now - at);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return formatDate(at);
}

const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatDate = (at: number) => dateFormat.format(at);
export const formatDateTime = (at: number) => dateTimeFormat.format(at);

export function startOfDay(at: number) {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dueLabel(due: number, now = Date.now()) {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days < 0) return { text: `${-days}d overdue`, tone: 'danger' as const };
  if (days === 0) return { text: 'Due today', tone: 'warn' as const };
  if (days === 1) return { text: 'Due tomorrow', tone: 'warn' as const };
  return { text: `Due ${formatDate(due)}`, tone: 'muted' as const };
}
