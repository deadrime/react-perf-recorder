import type { ActionRecord, RecordingV2 } from './schema';
import { actionText } from './summary';

/** One thing to do again, with enough of the element to find it on a freshly loaded page. */
export interface ReplayStep {
  kind: 'click' | 'typing' | 'key' | 'change' | 'submit' | 'scroll';
  /** Milliseconds after the previous step began (the first: after the replay began). */
  afterMs: number;
  /** How long it took; typing spreads its characters over it. */
  durationMs: number;
  what: string;
  selector?: string;
  nth?: number;
  key?: string;
  chars?: number;
  /** The typed or chosen value, only when the recording kept values. */
  value?: string;
  scrollTo?: number;
}

export interface ReplayPlan {
  from?: string;
  steps: ReplayStep[];
  /** How long to go on recording after the last step: the tail of the original, for the same background. */
  tailMs: number;
  /** Actions that cannot be done again, and why. */
  skipped: string[];
}

/** Two events of one gesture land within this: a click and the submit or change it causes. */
const SAME_GESTURE_MS = 100;
/** A recording that waited long before the first action does not make the replay wait as long. */
const MAX_LEAD_MS = 2000;

/**
 * The actions of a recording as steps to do again. A click and the submit or change it set off are one gesture:
 * the click is done, and the browser does the rest, as it did the first time. What cannot be done again — going
 * back and forward, a select without its value — is listed, not guessed.
 */
export function planReplay(rec: Pick<RecordingV2, 'actions' | 'durationMs'> & { id?: string }): ReplayPlan {
  const actions = rec.actions.slice().sort((a, b) => a.atMs - b.atMs);
  const steps: ReplayStep[] = [];
  const skipped: string[] = [];
  let previous: ActionRecord | null = null;
  let lastAt = 0;
  for (const action of actions) {
    const what = actionText({ ...action, value: undefined });
    const soon = previous !== null && action.atMs - previous.endMs <= SAME_GESTURE_MS;
    const prev = previous;
    previous = action;
    const t = action.target;
    if (action.kind === 'navigation') {
      skipped.push(`${what}: back and forward are not replayed`);
      continue;
    }
    // The click on a submit button submits; the click on a checkbox changes it. Doing both would do it twice.
    if ((action.kind === 'submit' || action.kind === 'change') && soon && prev?.kind === 'click') continue;
    // A label passes its click on to its field, and both are recorded: the label's click is the one to do.
    if (action.kind === 'click' && soon && prev?.kind === 'click' && prev.target?.tag === 'label') continue;
    if (action.kind === 'change' && t?.tag === 'select' && action.value === undefined) {
      skipped.push(`${what}: the chosen option was not recorded`);
      continue;
    }
    if (!t?.selector && action.kind !== 'key' && action.kind !== 'scroll') {
      skipped.push(`${what}: nothing to find the element by`);
      continue;
    }
    const at = action.atMs;
    steps.push({
      kind: action.kind,
      afterMs: steps.length ? Math.max(0, at - lastAt) : Math.min(at, MAX_LEAD_MS),
      durationMs: Math.max(0, action.endMs - action.atMs),
      what,
      ...(t?.selector ? { selector: t.selector } : {}),
      ...(t?.nth !== undefined ? { nth: t.nth } : {}),
      ...(action.key ? { key: action.key } : {}),
      ...(action.chars ? { chars: action.chars } : {}),
      ...(action.value !== undefined && !action.secret ? { value: action.value } : {}),
      ...(action.scroll ? { scrollTo: action.scroll.to } : {}),
    });
    lastAt = at;
  }
  const last = actions.at(-1);
  const tailMs = last ? Math.min(3000, Math.max(500, rec.durationMs - last.endMs)) : Math.min(3000, rec.durationMs);
  return { ...(rec.id ? { from: rec.id } : {}), steps, tailMs, skipped };
}
