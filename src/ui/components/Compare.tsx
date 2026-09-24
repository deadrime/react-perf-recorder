/** @jsxImportSource preact */
import type { JSX } from 'preact';
import type { ActionChange, Delta, DigestComparison } from '../../shared/compare';

export interface Comparison extends DigestComparison {
  /** When the recording it is compared with was made. */
  since: string;
}

const MAX_ROWS = 5;

/** Under a tenth, or under one render, is noise between two runs by hand. */
const toneOf = (d: Delta) => (d.pct === null || Math.abs(d.pct) < 10 || Math.abs(d.delta ?? 0) < 1 ? undefined : d.pct < 0 ? 'good' : 'bad');
const num = (n: number | null) => (n === null ? '–' : String(n));
const change = (d: Delta) => (toneOf(d) ? `${d.pct! > 0 ? '+' : '−'}${Math.abs(d.pct!)}%` : 'same');
const VERB: Record<string, string> = {
  typing: 'type',
  click: 'click',
  key: 'key',
  change: 'change',
  submit: 'submit',
  scroll: 'scroll',
  drag: 'drag',
};
const unitOf = (c: ActionChange) => (c.per === 'char' ? 'per char' : c.kind === 'click' ? 'per click' : 'per time');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const Change = ({ d }: { d: Delta }) => (
  <span class="cmp-change" data-tone={toneOf(d)}>
    {change(d)}
  </span>
);

const ActionRow = ({ a }: { a: ActionChange }) => (
  <div
    class="cmp-row"
    data-rpr="cmp-row"
    title={`${a.action}\nDone ${a.times.before}× before and ${a.times.after}× now — the numbers are renders ${unitOf(a)}, so that does not matter`}
  >
    <span class="cmp-what">
      <span class="cmp-verb">{VERB[a.kind] ?? a.kind}</span>
      <span class="cmp-target">{a.target}</span>
      {a.component ? <span class="cmp-in">{`in ${a.component}`}</span> : null}
    </span>
    <span class="cmp-before">{num(a.renders.before)}</span>
    <span class="cmp-arrow">→</span>
    <span class="cmp-after">
      {num(a.renders.after)}
      {a.per === 'char' ? <small>/char</small> : null}
    </span>
    <Change d={a.renders} />
  </div>
);

/**
 * The same actions in this recording and the one before it, as renders per time each was done — so the two runs
 * need not have pressed a button the same number of times. What only one of them did is named, not compared.
 */
export function Compare({ c }: { c: Comparison }): JSX.Element {
  const only = [
    ...(c.unmatched.before.length ? [`only before: ${c.unmatched.before.slice(0, 2).join(', ')}`] : []),
    ...(c.unmatched.after.length ? [`only now: ${c.unmatched.after.slice(0, 2).join(', ')}`] : []),
  ];
  return (
    <div class="cmp" data-rpr="compare">
      {c.actions.length ? (
        <div class="cmp-head">
          <span>renders per action</span>
          <span class="cmp-cols">before → now</span>
        </div>
      ) : null}
      {c.actions.slice(0, MAX_ROWS).map((a) => (
        <ActionRow key={a.action} a={a} />
      ))}
      <div class="cmp-foot">
        {c.startedDifferently ? (
          <span class="cmp-note">One run began with the page load: renders per second are not compared.</span>
        ) : (
          <span class="cmp-wasted" data-rpr="cmp-wasted">
            wasted renders <b>{num(c.wastedPerSec.before)}</b>
            <span class="cmp-arrow">→</span>
            <b>{num(c.wastedPerSec.after)}</b> per second <Change d={c.wastedPerSec} />
          </span>
        )}
        {only.length ? <span class="cmp-note">{only.join(' · ')}</span> : null}
      </div>
    </div>
  );
}

/** The fold's note: when the other recording was made, and that this one is its replay. */
export const compareNote = (c: Comparison, replayed: boolean) => `${replayed ? '↻ replay · ' : ''}vs ${timeOf(c.since)}`;
