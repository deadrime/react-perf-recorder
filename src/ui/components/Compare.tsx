/** @jsxImportSource preact */
import type { JSX } from 'preact';
import type { ActionChange, Delta, DigestComparison } from '../../shared/compare';

export interface Comparison extends DigestComparison {
  /** When the recording it is compared with was made. */
  since: string;
}

const MAX_ROWS = 5;

/** Under a tenth, or under one render, is noise between two runs by hand. */
const toneOf = (d: Delta) =>
  d.pct === null || Math.abs(d.pct) < 10 || Math.abs(d.delta ?? 0) < 1 ? undefined : d.pct < 0 ? 'good' : 'bad';
const num = (n: number | null) => (n === null ? '–' : String(n));
const pct = (d: Delta) => (d.pct === null ? '' : `${d.pct > 0 ? '+' : d.pct < 0 ? '−' : ''}${Math.abs(d.pct)}%`);
const unitOf = (c: ActionChange) => (c.per === 'char' ? '/char' : c.action.startsWith('click') ? '/click' : '/time');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const Row = ({ what, times, d, unit }: { what: string; times?: string; d: Delta; unit: string }) => (
  <div class="cmp-row" data-rpr="cmp-row">
    <span class="cmp-what" title={what}>
      {what}
    </span>
    {times ? (
      <span class="cmp-times" title="How many times it was done, before and after: the numbers are per time, so it does not matter">
        {times}
      </span>
    ) : null}
    <span class="cmp-value">{`${num(d.before)} → ${num(d.after)}`}</span>
    <span class="cmp-unit">{unit}</span>
    <span class="cmp-pct" data-tone={toneOf(d)}>
      {pct(d)}
    </span>
  </div>
);

/**
 * The same actions in this recording and the one before it, per time each was done — so the two runs need not have
 * pressed a button the same number of times. What only one of them did is named, not compared.
 */
export function Compare({ c }: { c: Comparison }): JSX.Element {
  const only = [
    ...(c.unmatched.before.length ? [`only before: ${c.unmatched.before.slice(0, 2).join(', ')}`] : []),
    ...(c.unmatched.after.length ? [`only now: ${c.unmatched.after.slice(0, 2).join(', ')}`] : []),
  ];
  return (
    <div class="cmp" data-rpr="compare">
      {c.actions.slice(0, MAX_ROWS).map((a) => (
        <Row key={a.action} what={a.action} times={`${a.times.before}× · ${a.times.after}×`} d={a.renders} unit={unitOf(a)} />
      ))}
      <Row what="wasted renders" d={c.wastedPerSec} unit="/s" />
      {only.length ? <p class="muted cmp-only">{only.join(' · ')}</p> : null}
    </div>
  );
}

export const compareNote = (c: Comparison) => `vs ${timeOf(c.since)}`;
