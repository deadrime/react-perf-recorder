/**
 * React's own dev warnings that explain renders: a list without keys, two children with one key, a state update made
 * while another component renders, an update loop. React prints most of them once per component, usually at the
 * first render, so they are caught from the moment the client loads, not from the moment a recording starts.
 */
export interface ReactWarning {
  kind: 'key' | 'duplicate-key' | 'update-in-render' | 'update-depth';
  /** What it means for renders, with the components React named. */
  text: string;
  count: number;
  /** `performance.now()` of the last time React printed it. */
  lastAt: number;
}

type Console = typeof console & { __rprWarnings?: true };

const MAX_WARNINGS = 20;
const seen = new Map<string, ReactWarning>();

/** `%s` filled in as console.error does it, which React's warnings rely on. */
function format(args: unknown[]): string {
  const [first, ...rest] = args;
  if (typeof first !== 'string') return '';
  let i = 0;
  return first.replace(/%[sdoO]/g, () => (i < rest.length ? String(rest[i++]) : ''));
}

/** The first component of the stack React appends, when it appends one. */
const stackComponent = (text: string) => /\n\s+at ([A-Z][\w$.]*)[ (]/.exec(text)?.[1];

export function classify(text: string): Omit<ReactWarning, 'count' | 'lastAt'> | null {
  const message = text.replace(/^Warning: /, '');
  if (message.startsWith('Each child in a list should have a unique "key" prop')) {
    const owner = /Check the render method of `([^`]+)`/.exec(message)?.[1] ?? stackComponent(message);
    return {
      kind: 'key',
      text: `a list${
        owner ? ` in ${owner}` : ''
      } renders children without a key: React matches them by position, so inserting or removing one re-renders or remounts the ones after it`,
    };
  }
  const duplicate = /^Encountered two children with the same key, `([^`]*)`/.exec(message);
  if (duplicate) {
    const where = stackComponent(message);
    return {
      kind: 'duplicate-key',
      text: `two children${where ? ` in ${where}` : ''} share the key "${duplicate[1]}": React may drop, duplicate or remount them`,
    };
  }
  const inRender = /^Cannot update a component \(`([^`]+)`\) while rendering a different component \(`([^`]+)`\)/.exec(message);
  if (inRender)
    return { kind: 'update-in-render', text: `${inRender[2]} sets the state of ${inRender[1]} while it renders: a second render pass each time` };
  if (message.startsWith('Cannot update during an existing state transition'))
    return { kind: 'update-in-render', text: 'a class component sets state in its render: a second render pass each time' };
  if (message.startsWith('Maximum update depth exceeded')) {
    const where = stackComponent(message);
    return {
      kind: 'update-depth',
      text: `an update loop${where ? ` in ${where}` : ''}: an effect sets state that changes on every render, or has no dependencies`,
    };
  }
  return null;
}

/** Wraps console.error once; what is printed still is. Call before react-dom loads to see the first render's. */
export function captureReactWarnings() {
  const target = console as Console;
  if (target.__rprWarnings) return;
  target.__rprWarnings = true;
  const original = target.error;
  target.error = function (...args: unknown[]) {
    try {
      const found = classify(format(args));
      if (found) {
        const known = seen.get(found.text);
        if (known) {
          known.count++;
          known.lastAt = performance.now();
        } else if (seen.size < MAX_WARNINGS) seen.set(found.text, { ...found, count: 1, lastAt: performance.now() });
      }
    } catch {
      // A warning the recorder cannot read is still printed.
    }
    return original.apply(this, args);
  };
}

/** The warnings as lines for a recording, the ones printed before it started marked so. */
export function reactWarningLines(startedAt: number): string[] {
  return [...seen.values()].map(
    (w) => `React warned: ${w.text}${w.count > 1 ? ` (×${w.count})` : ''}${w.lastAt < startedAt ? ', before the recording' : ''}`
  );
}
