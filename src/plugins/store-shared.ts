import { libraryOf } from '../core/stack';

/**
 * The package that made a store, from the stack taken where the store library made it: `@xyflow/react` for
 * `.vite/deps/@xyflow_react.js`. `own` are the store library's packages, passed over on the way down.
 */
export function packageOfStack(stack: string | undefined, own: string[]): string | null {
  for (const line of (stack ?? '').split('\n').slice(1)) {
    const url = /(?:(?:https?|file):\/\/|\/)[^\s()]+/
      .exec(line)?.[0]
      .replace(/[?#].*$/, '')
      .replace(/(:\d+)+$/, '');
    if (!url) continue;
    const pkg = libraryOf(url);
    // The app's code, or a linked package served by its path: the store is theirs, and the declaration names it.
    if (pkg === null) return null;
    if (pkg && pkg !== 'react-perf-recorder' && !own.includes(pkg)) return pkg;
  }
  return null;
}

const MAX_KEYS = 40;

/** The top-level keys a write changed — a store's slices — with the values either side, for the cause of a commit. */
export function changedKeys(prev: unknown, next: unknown) {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return [{ key: '(state)', prev, next }];
  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const out: Array<{ key: string; prev: unknown; next: unknown }> = [];
  for (const key of Object.keys(b)) if (a[key] !== b[key] && out.length < MAX_KEYS) out.push({ key, prev: a[key], next: b[key] });
  return out;
}
