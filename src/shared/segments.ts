import type { ActionRecord, LatencyEntry, LongFrame, Segment } from './schema';

export interface SegmentCommit {
  /** Id of the commit in the recording, so an action and its commits can point at each other. */
  i: number;
  t: number;
  n: number;
  event?: string;
  roots?: Array<[number, number]>;
}

/**
 * Moving a pointer over the page is not an event worth a cause of its own: a commit during one is reported as
 * `pointer`, so a page with hover effects does not fill the report with `pointermove`, `pointerover`, `mouseout`.
 */
const AMBIENT_POINTER = /^(pointer|mouse)(move|over|out|enter|leave)$/;

export const eventName = (type: string | undefined) => (type && AMBIENT_POINTER.test(type) ? 'pointer' : type);

/** Events a person produced; a commit during their dispatch is a direct reaction to the action. */
export const USER_EVENTS = new Set([
  'click',
  'input',
  'change',
  'keydown',
  'keyup',
  'keypress',
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'submit',
  'focusin',
  'focusout',
  'focus',
  'blur',
  'wheel',
  'scroll',
  'popstate',
]);

const LATENCY_TYPES: Record<string, string[]> = {
  click: ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup'],
  typing: ['keydown', 'keypress', 'keyup', 'beforeinput', 'input'],
  change: ['pointerdown', 'pointerup', 'click', 'change', 'input'],
  key: ['keydown', 'keyup', 'keypress'],
  submit: ['keydown', 'keyup', 'click', 'pointerup', 'submit'],
};

/**
 * A segment runs from an action until the next action or a quiet gap with no commits. Commits during a user event
 * are the reaction; the rest (sockets, timers, fetches) is background, which may include delayed consequences.
 */
export function buildSegments(
  actions: ActionRecord[],
  commits: SegmentCommit[],
  latency: LatencyEntry[] = [],
  frames: LongFrame[] = [],
  quietMs = 1000
): Segment[] {
  const sorted = actions.slice().sort((a, b) => a.atMs - b.atMs);
  const byTime = commits.slice().sort((a, b) => a.t - b.t);
  const segments: Segment[] = [];
  let c = 0;
  for (let i = 0; i < sorted.length; i++) {
    const action = sorted[i];
    const nextStart = sorted[i + 1]?.atMs ?? Infinity;
    while (c < byTime.length && byTime[c].t < action.atMs) c++;
    const segment: Segment = {
      action: action.id,
      atMs: action.atMs,
      durationMs: 0,
      commits: 0,
      renders: 0,
      reaction: { commits: 0, renders: 0 },
      background: { commits: 0, renders: 0 },
      topRoots: [],
      commitIds: [],
      longFrames: 0,
      maxFrameMs: 0,
    };
    const roots = new Map<number, number>();
    let last = action.endMs;
    let maxReaction = 0;
    for (let j = c; j < byTime.length; j++) {
      const commit = byTime[j];
      if (commit.t >= nextStart || commit.t - last > quietMs) break;
      last = Math.max(last, commit.t);
      segment.commits++;
      segment.renders += commit.n;
      segment.commitIds!.push(commit.i);
      const bucket = commit.event && USER_EVENTS.has(commit.event) ? segment.reaction : segment.background;
      bucket.commits++;
      bucket.renders += commit.n;
      if (bucket === segment.reaction) maxReaction = Math.max(maxReaction, commit.n);
      for (const [root, cascade] of commit.roots ?? []) roots.set(root, (roots.get(root) ?? 0) + cascade);
    }
    const end = Math.min(nextStart, Math.max(last, action.endMs));
    segment.durationMs = Math.max(0, Math.round(end - action.atMs));
    segment.topRoots = [...roots].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (action.kind === 'typing' && action.chars) {
      segment.perChar = {
        commits: +(segment.reaction.commits / action.chars).toFixed(2),
        renders: Math.round(segment.reaction.renders / action.chars),
        maxRenders: maxReaction,
      };
    }
    const types = LATENCY_TYPES[action.kind];
    if (types) {
      const matched = latency.filter(
        (e) => types.includes(e.type) && e.atMs >= action.atMs - 50 && e.atMs <= Math.max(action.endMs, action.atMs) + 50
      );
      if (matched.length) segment.latency = matched.reduce((worst, e) => (e.duration > worst.duration ? e : worst));
    }
    for (const frame of frames) {
      if (frame.atMs + frame.duration < action.atMs || frame.atMs > end) continue;
      segment.longFrames++;
      segment.maxFrameMs = Math.max(segment.maxFrameMs, frame.duration);
    }
    segments.push(segment);
  }
  return segments;
}
