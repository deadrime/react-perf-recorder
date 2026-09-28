import type { ActivityEvent, Comment, Issue, IssueStatus, Label, Member, Notification, Priority, Project } from './types';

/** A seeded PRNG, so every load of the demo workspace is the same workspace. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = random(20260927);
const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const BOOTED_AT = Date.now();

export const MEMBERS: Member[] = [
  ['Anna Petrova', 'anna', 'Engineering manager', 'owner', 'Europe/Berlin', '#e5484d'],
  ['Boris Chen', 'boris', 'Frontend engineer', 'admin', 'Europe/London', '#0091ff'],
  ['Chen Wei', 'chen', 'Product designer', 'member', 'Asia/Singapore', '#30a46c'],
  ['Dana Okafor', 'dana', 'Backend engineer', 'member', 'Africa/Lagos', '#f76b15'],
  ['Eli Navarro', 'eli', 'Frontend engineer', 'member', 'America/Mexico_City', '#8e4ec6'],
  ['Farah Haddad', 'farah', 'QA engineer', 'member', 'Asia/Dubai', '#d6409f'],
  ['Gus Lindqvist', 'gus', 'Site reliability', 'member', 'Europe/Stockholm', '#12a594'],
  ['Hana Sato', 'hana', 'Mobile engineer', 'member', 'Asia/Tokyo', '#ffb224'],
  ['Ivan Morozov', 'ivan', 'Backend engineer', 'member', 'Europe/Belgrade', '#3e63dd'],
  ['Jade Moreau', 'jade', 'Product manager', 'admin', 'Europe/Paris', '#e54666'],
  ['Kofi Mensah', 'kofi', 'Data engineer', 'member', 'Africa/Accra', '#46a758'],
  ['Lena Vogel', 'lena', 'Support lead', 'guest', 'Europe/Vienna', '#978365'],
].map(([name, handle, title, role, timezone, color], i) => ({
  id: `u${i + 1}`,
  name,
  handle,
  email: `${handle}@orbit.dev`,
  title,
  role: role as Member['role'],
  timezone,
  color,
  lastActiveAt: BOOTED_AT - between(1, 90) * 60_000,
}));

/** Whoever is signed in to the demo. */
export const ME = MEMBERS[1];

export const LABELS: Label[] = [
  ['Bug', '#e5484d'],
  ['Feature', '#8e4ec6'],
  ['Improvement', '#0091ff'],
  ['Design', '#d6409f'],
  ['Performance', '#f76b15'],
  ['Security', '#ffb224'],
  ['Tech debt', '#978365'],
  ['Docs', '#30a46c'],
  ['Customer', '#12a594'],
  ['Regression', '#e54666'],
  ['Accessibility', '#3e63dd'],
  ['Infra', '#46a758'],
].map(([name, color], i) => ({ id: `l${i + 1}`, name, color }));

const PROJECT_SPECS = [
  {
    key: 'WEB',
    name: 'Web app',
    color: '#0091ff',
    description: 'The customer-facing dashboard: billing, workspaces, onboarding.',
    subjects: ['billing page', 'invoice PDF', 'workspace switcher', 'onboarding checklist', 'team invites', 'SSO login', 'date picker', 'CSV export'],
  },
  {
    key: 'MOB',
    name: 'Mobile',
    color: '#30a46c',
    description: 'iOS and Android clients built on the shared React Native core.',
    subjects: ['push notifications', 'offline queue', 'deep links', 'photo upload', 'biometric unlock', 'tab bar', 'pull to refresh', 'widget'],
  },
  {
    key: 'API',
    name: 'Platform API',
    color: '#8e4ec6',
    description: 'Public REST and webhook API, rate limiting and the SDKs.',
    subjects: [
      'webhook retries',
      'rate limiter',
      'pagination cursor',
      'OAuth scopes',
      'audit log',
      'idempotency keys',
      'search endpoint',
      'batch import',
    ],
  },
  {
    key: 'DS',
    name: 'Design system',
    color: '#d6409f',
    description: 'Tokens, components and the docs site every product team builds on.',
    subjects: ['Select component', 'color tokens', 'Tooltip', 'Modal focus trap', 'Table density', 'icon set', 'dark theme', 'Toast'],
  },
  {
    key: 'OPS',
    name: 'Infrastructure',
    color: '#f76b15',
    description: 'Deploys, observability and the on-call rotation.',
    subjects: [
      'staging deploys',
      'log retention',
      'alert routing',
      'Postgres failover',
      'CDN cache',
      'build times',
      'secrets rotation',
      'status page',
    ],
  },
];

const TEMPLATES = [
  'Fix crash when opening {s} with an empty state',
  '{S} shows stale data after switching workspace',
  'Add keyboard shortcuts to {s}',
  'Investigate slow load of {s} on large accounts',
  'Redesign {s} for the new navigation',
  '{S} ignores the user locale',
  'Write migration guide for {s}',
  'Flaky test around {s}',
  'Track usage of {s} in analytics',
  'Support bulk actions in {s}',
  '{S}: error message is not actionable',
  'Remove the legacy fallback in {s}',
  'Accessibility audit of {s}',
  'Cache {s} responses on the edge',
  '{S} breaks on Safari 16',
  'Add empty state illustration to {s}',
];

const PARAGRAPHS = [
  'Reported by two customers this week. It reproduces on the production workspace but not on staging, which points at the data rather than the code.',
  'Steps: open the page, switch the filter twice, then go back. The second time the list is empty until a reload.',
  'We agreed in the planning meeting to keep the current behaviour behind a flag until the new version is validated with the pilot accounts.',
  'The fix is probably small, but it touches code shared with the mobile client, so it needs a second review.',
  'Design is in the shared file, page "Q4 / navigation". The spacing tokens there are the new ones.',
  'Not urgent on its own, but it blocks the release checklist item about error reporting.',
];

const STATUSES: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
const STATUS_WEIGHTS = [16, 22, 18, 10, 30, 4];

function weighted<T>(values: T[], weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < values.length; i++) if ((r -= weights[i]) < 0) return values[i];
  return values[values.length - 1];
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

export const PROJECTS: Project[] = PROJECT_SPECS.map((spec, i) => ({
  id: `p${i + 1}`,
  key: spec.key,
  name: spec.name,
  description: spec.description,
  color: spec.color,
  leadId: MEMBERS[(i * 2) % MEMBERS.length].id,
  memberIds: MEMBERS.filter((_, m) => (m + i) % 3 !== 0).map((m) => m.id),
  targetDate: BOOTED_AT + between(10, 80) * DAY,
}));

function makeIssues(): Issue[] {
  const issues: Issue[] = [];
  for (const [p, project] of PROJECTS.entries()) {
    const spec = PROJECT_SPECS[p];
    for (let n = 1; n <= 96; n++) {
      const subject = pick(spec.subjects);
      const title = pick(TEMPLATES).replace('{s}', subject).replace('{S}', capital(subject));
      const status = weighted(STATUSES, STATUS_WEIGHTS);
      const createdAt = BOOTED_AT - between(2, 120) * DAY - between(0, 23) * HOUR;
      const updatedAt = Math.min(BOOTED_AT - between(5, 600) * 60_000, createdAt + between(1, 60) * DAY);
      const completedAt = status === 'done' ? Math.max(createdAt + DAY, BOOTED_AT - between(0, 88) * DAY - between(0, 23) * HOUR) : null;
      const labels = new Set<string>();
      for (let l = between(0, 3); l > 0; l--) labels.add(pick(LABELS).id);
      issues.push({
        id: `i${issues.length + 1}`,
        key: `${project.key}-${n}`,
        number: n,
        projectId: project.id,
        title,
        description: [pick(PARAGRAPHS), pick(PARAGRAPHS)].join('\n\n'),
        status,
        priority: between(0, 4) as Priority,
        assigneeId: rnd() < 0.85 ? pick(project.memberIds) : null,
        reporterId: pick(MEMBERS).id,
        labelIds: [...labels],
        estimate: rnd() < 0.7 ? pick([1, 2, 3, 5, 8]) : null,
        commentCount: between(0, 9),
        createdAt,
        updatedAt,
        completedAt,
        dueDate: rnd() < 0.3 ? BOOTED_AT + between(-5, 30) * DAY : null,
      });
    }
  }
  return issues;
}

export const ISSUES: Issue[] = makeIssues();

const COMMENT_BODIES = [
  'I can take this one after the release.',
  'Could this be the same root cause as the export timeout last month?',
  'Repro video is in the support ticket, the relevant part starts at 0:42.',
  'Pushed a draft, would love eyes on the approach before I write the tests.',
  'Moving to next cycle, we ran out of time on this one.',
  'Checked on staging: fixed for new workspaces, old ones still show it.',
  '@anna this needs a decision on the copy, can you weigh in?',
  'Customer confirmed the workaround works for now.',
  'Added the metrics to the dashboard so we can see if it regresses.',
  'Let us pair on it tomorrow morning.',
];

/** An issue's thread, made the first time it is asked for and the same every time after. */
export function commentsFor(issue: Issue): Comment[] {
  const r = random(issue.number * 7919 + issue.projectId.charCodeAt(1));
  return Array.from({ length: issue.commentCount }, (_, i) => ({
    id: `${issue.id}-c${i + 1}`,
    issueId: issue.id,
    authorId: MEMBERS[Math.floor(r() * MEMBERS.length)].id,
    body: COMMENT_BODIES[Math.floor(r() * COMMENT_BODIES.length)],
    createdAt: issue.createdAt + (i + 1) * Math.floor(((issue.updatedAt - issue.createdAt) / (issue.commentCount + 1)) * (0.6 + r() * 0.4)),
    editedAt: null,
  }));
}

export const NOTIFICATIONS: Notification[] = Array.from({ length: 14 }, (_, i) => ({
  id: `n${i + 1}`,
  kind: pick(['assigned', 'mentioned', 'commented', 'status_changed', 'due_soon'] as const),
  issueId: pick(ISSUES).id,
  actorId: pick(MEMBERS.filter((m) => m.id !== ME.id)).id,
  createdAt: BOOTED_AT - (i + 1) * between(20, 200) * 60_000,
  readAt: i < 5 ? null : BOOTED_AT - i * HOUR,
}));

export const ACTIVITY: ActivityEvent[] = Array.from({ length: 30 }, (_, i) => {
  const issue = pick(ISSUES);
  return {
    id: `a${i + 1}`,
    kind: pick(['status', 'assignee', 'priority', 'comment', 'created'] as const),
    issueId: issue.id,
    actorId: pick(MEMBERS).id,
    at: BOOTED_AT - (i + 1) * between(3, 40) * 60_000,
  };
});
