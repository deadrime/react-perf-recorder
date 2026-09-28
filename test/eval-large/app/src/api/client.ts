import { API_LATENCY_MS } from '../config';
import { ACTIVITY, commentsFor, ISSUES, LABELS, ME, MEMBERS, NOTIFICATIONS, PROJECTS } from './seed';
import type { ActivityEvent, Comment, Issue, IssuePatch, Label, Member, Notification, NotificationSettings, Profile, Project } from './types';

// The demo has no backend: this module is the server. Every response is a fresh copy, as it would be off the wire.
const db = {
  members: MEMBERS,
  labels: LABELS,
  projects: PROJECTS,
  issues: new Map(ISSUES.map((i) => [i.id, i])),
  comments: new Map<string, Comment[]>(),
  notifications: NOTIFICATIONS,
  activity: ACTIVITY,
  profile: {
    name: ME.name,
    handle: ME.handle,
    title: ME.title,
    timezone: ME.timezone,
    bio: 'Frontend at Orbit. Mostly tables, forms and the occasional chart.',
    weekStartsOn: 'monday',
  } as Profile,
  notificationSettings: {
    email: { assigned: true, mentioned: true, commented: false, status_changed: false, due_soon: true },
    push: { assigned: true, mentioned: true, commented: true, status_changed: false, due_soon: false },
    digest: 'daily',
    quietHours: { enabled: false, from: '20:00', to: '08:00' },
  } as NotificationSettings,
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function respond<T>(produce: () => T, latency = API_LATENCY_MS): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(wire(produce()));
      } catch (error) {
        reject(error);
      }
    }, latency)
  );
}

function issueOrThrow(id: string) {
  const issue = db.issues.get(id);
  if (!issue) throw new ApiError(404, `No issue ${id}`);
  return issue;
}

function threadOf(issue: Issue) {
  let thread = db.comments.get(issue.id);
  if (!thread) db.comments.set(issue.id, (thread = commentsFor(issue)));
  return thread;
}

export const api = {
  me: () => respond(() => ({ ...ME, permissions: ['issue:edit', 'issue:comment', 'project:view', 'settings:edit'] })),
  members: () => respond<Member[]>(() => db.members),
  labels: () => respond<Label[]>(() => db.labels),
  projects: () => respond<Project[]>(() => db.projects),
  issues: () => respond<Issue[]>(() => [...db.issues.values()], API_LATENCY_MS * 2),
  comments: (issueId: string) => respond<Comment[]>(() => threadOf(issueOrThrow(issueId))),
  addComment: (issueId: string, body: string, authorId = ME.id) =>
    respond<Comment>(() => {
      const issue = issueOrThrow(issueId);
      const thread = threadOf(issue);
      const comment = { id: `${issue.id}-c${thread.length + 1}-${Date.now()}`, issueId, authorId, body, createdAt: Date.now(), editedAt: null };
      thread.push(comment);
      db.issues.set(issueId, { ...issue, commentCount: thread.length, updatedAt: comment.createdAt });
      return comment;
    }),
  updateIssue: (id: string, patch: IssuePatch) =>
    respond<Issue>(() => {
      const issue = issueOrThrow(id);
      const next: Issue = { ...issue, ...patch, updatedAt: Date.now() };
      if (patch.status && patch.status !== issue.status) next.completedAt = patch.status === 'done' ? Date.now() : null;
      db.issues.set(id, next);
      return next;
    }),
  notifications: () => respond<Notification[]>(() => db.notifications),
  activity: () => respond<ActivityEvent[]>(() => db.activity),
  profile: () => respond<Profile>(() => db.profile),
  saveProfile: (profile: Profile) =>
    respond<Profile>(() => {
      if (!/^[a-z0-9_]{2,20}$/.test(profile.handle)) throw new ApiError(422, 'Handle is taken or invalid');
      db.profile = profile;
      return profile;
    }, API_LATENCY_MS * 4),
  notificationSettings: () => respond<NotificationSettings>(() => db.notificationSettings),
  saveNotificationSettings: (settings: NotificationSettings) =>
    respond<NotificationSettings>(() => (db.notificationSettings = settings), API_LATENCY_MS * 3),
};

/** What the realtime server does to the data before it tells the clients: other people's edits land here first. */
export const server = {
  getIssue: (id: string) => db.issues.get(id),
  applyIssue(id: string, patch: IssuePatch) {
    const issue = issueOrThrow(id);
    const next: Issue = { ...issue, ...patch, updatedAt: Date.now() };
    if (patch.status && patch.status !== issue.status) next.completedAt = patch.status === 'done' ? Date.now() : null;
    db.issues.set(id, next);
    return wire(next);
  },
  applyComment(issueId: string, authorId: string, body: string) {
    const issue = issueOrThrow(issueId);
    const thread = threadOf(issue);
    const comment: Comment = {
      id: `${issue.id}-c${thread.length + 1}-${Date.now()}`,
      issueId,
      authorId,
      body,
      createdAt: Date.now(),
      editedAt: null,
    };
    thread.push(comment);
    db.issues.set(issueId, { ...issue, commentCount: thread.length, updatedAt: comment.createdAt });
    return { comment: wire(comment), issue: wire(db.issues.get(issueId)!) };
  },
};
