export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
export type Priority = 0 | 1 | 2 | 3 | 4; // none, urgent, high, medium, low — the order Linear and friends use
export type Role = 'owner' | 'admin' | 'member' | 'guest';

export interface Member {
  id: string;
  name: string;
  handle: string;
  email: string;
  title: string;
  role: Role;
  timezone: string;
  color: string;
  /** Epoch ms. */
  lastActiveAt: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  color: string;
  leadId: string;
  memberIds: string[];
  targetDate: number | null;
}

export interface Issue {
  id: string;
  key: string;
  number: number;
  projectId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  assigneeId: string | null;
  reporterId: string;
  labelIds: string[];
  estimate: number | null;
  commentCount: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  dueDate: number | null;
  /** Place on the board: a column sorts by it, and a drop sets it between the two neighbours. */
  sortOrder: number;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  createdAt: number;
  editedAt: number | null;
}

export type NotificationKind = 'assigned' | 'mentioned' | 'commented' | 'status_changed' | 'due_soon';

export interface Notification {
  id: string;
  kind: NotificationKind;
  issueId: string;
  actorId: string;
  createdAt: number;
  readAt: number | null;
}

export type ActivityKind = 'status' | 'assignee' | 'priority' | 'comment' | 'created' | 'estimate';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  issueId: string;
  actorId: string;
  at: number;
  from?: string | number | null;
  to?: string | number | null;
}

export interface NotificationSettings {
  email: Record<NotificationKind, boolean>;
  push: Record<NotificationKind, boolean>;
  digest: 'off' | 'daily' | 'weekly';
  quietHours: { enabled: boolean; from: string; to: string };
}

export interface Profile {
  name: string;
  handle: string;
  title: string;
  timezone: string;
  bio: string;
  weekStartsOn: 'monday' | 'sunday';
}

export type IssuePatch = Partial<
  Pick<Issue, 'status' | 'priority' | 'assigneeId' | 'labelIds' | 'estimate' | 'title' | 'description' | 'dueDate' | 'sortOrder'>
>;
