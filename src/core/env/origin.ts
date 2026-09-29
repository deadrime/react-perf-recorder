import { type Frame, libraryOf, parseStack, servedPath, sourceAt } from '../stack';

const EFFECT_FRAMES = /flushPassiveEffects|flushPendingEffects|commitPassiveMount|commitHookEffectList/;
const REACT_FRAMES = /^(react-dom|react|scheduler)$/;

/** V8 keeps 10 frames by default; React 19's effect wrappers would push the effect frames off the end. */
function captureStack(): string {
  const holder = Error as ErrorConstructor & { stackTraceLimit?: number };
  const limit = holder.stackTraceLimit;
  holder.stackTraceLimit = 40;
  try {
    return new Error().stack ?? '';
  } finally {
    holder.stackTraceLimit = limit;
  }
}

/**
 * Who scheduled the update that is being marked right now, read from the stack: the nearest app frame, and whether
 * React is flushing effects around it. Answers the commits that no store, query, timer or input explains.
 */
export interface UpdateOrigin {
  text: string;
  /** `effect`: React was flushing effects, so a user event around it does not explain this update. */
  kind: 'effect' | 'update';
}

export function updateOrigin(): UpdateOrigin | null {
  const frames = parseStack(captureStack()).slice(1);
  const own = frames.filter((f) => libraryOf(f.url, f.line) !== 'react-perf-recorder');
  if (!own.length) return null;
  const inEffect = own.some((f) => EFFECT_FRAMES.test(f.fn));
  const kind: UpdateOrigin['kind'] = inEffect ? 'effect' : 'update';
  // The accessor is called from react-dom itself, so its file names React's own frames whatever it is bundled as.
  // Keyed by source: one webpack or Next chunk holds React and the app alike.
  const fileOf = (f: Frame) => sourceAt(f.url, f.line) || f.url;
  const react = fileOf(own[0]);
  const app = own.find((f) => fileOf(f) !== react && libraryOf(f.url, f.line) === null);
  if (app) {
    const name =
      app.fn
        .split('.')
        .pop()
        ?.replace(/^bound /, '') ?? '';
    const file = servedPath(app.url, app.line);
    return { text: `${kind}${name ? ` ${name}` : ''} @ ${file}`, kind };
  }
  // Outside the app: name the package when the bundler kept it (deps are split into unnamed chunks) and the
  // function that asked, so a library's own update is at least told apart from React's internal work.
  const outside = own.find((f) => {
    const library = libraryOf(f.url, f.line);
    return fileOf(f) !== react && library !== null && !REACT_FRAMES.test(library);
  });
  if (!outside) return null;
  const library = libraryOf(outside.url, outside.line) || 'package';
  const name =
    outside.fn
      .split('.')
      .pop()
      ?.replace(/^bound /, '') ?? '';
  return { text: `${kind}${name ? ` ${name}` : ''} (${library})`, kind };
}
