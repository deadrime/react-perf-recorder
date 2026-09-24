/** @jsxImportSource preact */
import type { JSX } from 'preact';
import type { MemoHookStat } from '../../shared/schema';
import { memoWhy } from '../../shared/summary';
import { CopyLine } from './Stats';

const MAX_ROWS = 6;

/** A memo hook that keeps making a new value: where it is, how often it kept one, and what moved its deps. */
const MemoRow = ({ m }: { m: MemoHookStat }) => {
  const every = m.recomputed === m.renders;
  return (
    <div class="memo" data-rpr="memo" data-every={every ? 'true' : undefined}>
      <div class="memo-head">
        <span class="who">{m.component}</span>
        <span class="kind">{`${m.kind} #${m.hook}`}</span>
        <span class="badge" data-tone={every ? 'warn' : undefined} title={`Recomputed on ${m.recomputed} of ${m.renders} renders`}>
          {`${m.renders - m.recomputed}/${m.renders} reused`}
        </span>
      </div>
      <div class="memo-why">
        {/* The sentence marks a name from the code with backticks: here it is set as code instead. */}
        {memoWhy(m)
          .split('`')
          .map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}
      </div>
      {/* Inside a custom hook the line is the hook's call: the chain says which memo in it. */}
      {m.info?.path && m.info.path.length > 1 ? <div class="chain">{m.info.path.join(' › ')}</div> : null}
      {m.info?.site ? <CopyLine className="site" text={m.info.site} title="Copy the file and line" /> : null}
      {m.info?.code ? <div class="code">{m.info.code}</div> : null}
    </div>
  );
};

/** The memo hooks of the recording that remember least, worst first. */
export function Memos({ memos }: { memos: MemoHookStat[] }): JSX.Element {
  return (
    <div class="memos">
      {memos.slice(0, MAX_ROWS).map((m) => (
        <MemoRow key={`${m.component}#${m.hook}`} m={m} />
      ))}
      {memos.length > MAX_ROWS ? <p class="muted">{`+ ${memos.length - MAX_ROWS} more in the recording`}</p> : null}
    </div>
  );
}
