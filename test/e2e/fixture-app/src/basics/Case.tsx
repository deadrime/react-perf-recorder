import type { ReactNode } from 'react';
import { useRef } from 'react';

/** Renders so far, without causing one: a ref, not state. */
export function useRenderCount() {
  const count = useRef(0);
  count.current += 1;
  return count.current;
}

export const RenderCount = ({ n }: { n: number }) => (
  <span className="count" data-count={n}>
    rendered {n}×
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

export const Panel = ({ kind, title, says, children }: { kind: 'broken' | 'fixed'; title: string; says: string; children: ReactNode }) => (
  <section className={`case ${kind}`} data-case={kind}>
    <h2>
      <span className="mark">{kind === 'broken' ? '✗' : '✓'}</span> {title}
    </h2>
    {children}
    <p className="says">{says}</p>
  </section>
);
