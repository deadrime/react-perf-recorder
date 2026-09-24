import type { ReactNode } from 'react';
import { useRef, useSyncExternalStore } from 'react';

/**
 * What a case's buttons change, kept outside React. Only the components the lesson is about read it, so the page,
 * the frames of the two versions and their code do not render with every press — with the outlines on, what lights
 * up is what the lesson is about.
 */
export function createDriver<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    use: () => useSyncExternalStore(subscribe, () => value),
    get: () => value,
    set(next: T | ((current: T) => T)) {
      value = typeof next === 'function' ? (next as (current: T) => T)(value) : next;
      listeners.forEach((listener) => listener());
    },
  };
}

/** Renders so far, without causing one: a ref, not state. */
export function useRenderCount() {
  const count = useRef(0);
  count.current += 1;
  return count.current;
}

export const RenderCount = ({ renders }: { renders: number }) => (
  <span className="count" data-count={renders}>
    rendered {renders}×
  </span>
);

export const MountCount = ({ mounts }: { mounts: number }) => (
  <span className={mounts > 1 ? 'count mounts again' : 'count mounts'} data-mounts={mounts}>
    mounted {mounts}×
  </span>
);

/** The frame every basics page shares: what the mistake is, and the two versions of it side by side. */
export const Case = ({ title, what, children }: { title: string; what: ReactNode; children: ReactNode }) => (
  <div className="basics">
    <h1>{title}</h1>
    <p className="what">{what}</p>
    {children}
  </div>
);

/** The shape of the code, with the line that matters marked by a `// ←` comment. */
const Code = ({ source }: { source: string }) => (
  <details className="code">
    <summary>the code</summary>
    <pre>
      {source
        .trim()
        .split('\n')
        .map((line, i) => (
          <span key={i} className={line.includes('// ←') ? 'line bad' : 'line'}>
            {line}
            {'\n'}
          </span>
        ))}
    </pre>
  </details>
);

export const Panel = ({
  kind,
  title,
  says,
  code,
  children,
}: {
  kind: 'broken' | 'fixed';
  title: string;
  says: string;
  code?: string;
  children: ReactNode;
}) => (
  <section className={`case ${kind}`} data-case={kind}>
    <h2>
      <span className="mark">{kind === 'broken' ? '✗' : '✓'}</span> {title}
    </h2>
    {children}
    <p className="says">{says}</p>
    {code ? <Code source={code} /> : null}
  </section>
);

/**
 * One of several mistakes a case shows, under a heading of its own: the broken and the fixed version side by side.
 * `id` names the pair, so a test can read the counters of one pair without counting the others.
 */
export const Pair = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <div data-pair={id}>
    <h3 className="pair">{title}</h3>
    <div className="two">{children}</div>
  </div>
);
