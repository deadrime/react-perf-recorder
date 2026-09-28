import type { ReactNode } from 'react';
import { useRef, useSyncExternalStore } from 'react';
import { highlight } from './highlight';

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

const colored = new Map<string, string>();

/** Open by default where the two versions stand side by side; a phone keeps them folded under the demo. */
const wide = () => typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;

/** The shape of the code, with the line that matters marked by a `// ←` comment. */
const Code = ({ source }: { source: string }) => {
  // Some cases render the whole page on a press, this one with it: colour each snippet once.
  let html = colored.get(source);
  if (html === undefined) colored.set(source, (html = highlight(source)));
  return (
    <details className="code" open={wide()}>
      <summary>the code</summary>
      <pre dangerouslySetInnerHTML={{ __html: html }} />
    </details>
  );
};

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
    <div className="case-body">{children}</div>
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
