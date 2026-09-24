/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { HookInfo, ReasonInfo } from '../../shared/schema';
import { hookChain, stateName, stepParts, type Way, type WayStep } from '../../shared/summary';

/** A number worth seeing at a glance next to a component's name; `warn` is for the ones that mean wasted work. */
export interface Badge {
  text: string;
  tone?: 'count' | 'warn';
}

export interface StatReason {
  id: number;
  /** How many renders it took; left out where a row stands for one commit. */
  n?: number;
  reason?: ReasonInfo;
  /** The hook the reason came through, when the recording knows it: the chain, the call site and the line. */
  hook?: HookInfo;
}

const names = (list: string[] | undefined) => (list ?? []).slice(0, 5).join(', ');

/**
 * A reason in the parts a row draws: the kind is a chip of its own, so the words next to it never repeat it.
 * `props: price | same: style` becomes `props` · `price` · `same: style`.
 */
function partsOf(reason: ReasonInfo, hook?: HookInfo): { what: string; same?: string } {
  const same = reason.sameRef?.length ? `same: ${names(reason.sameRef)}` : undefined;
  switch (reason.kind) {
    case 'state':
      return { what: stateName(hook) ?? (reason.hook === undefined ? 'of a class' : `#${reason.hook}`) };
    case 'store':
      return { what: reason.store || (reason.hook === undefined ? 'subscription' : `#${reason.hook}`) };
    case 'context':
      return { what: reason.context || '(unnamed)' };
    case 'props':
      return { what: names(reason.changed) || (same ? '' : '(new object)'), same };
    case 'parent': {
      if (reason.equal) return { what: 'props equal' };
      const what = [names(reason.changed), reason.children ? 'children' : ''].filter(Boolean).join(' + ');
      return { what: what || (same ? '' : 'props'), same };
    }
    case 'bailout':
      return { what: 'state set to the same value' };
    default:
      return { what: reason.text ?? 'unknown' };
  }
}

/** The words next to a reason's chip, for a line with no room for more. */
export const whatOf = (reason: ReasonInfo) => {
  const { what, same } = partsOf(reason);
  return [what, same].filter(Boolean).join(' ');
};

/** A reason opens only when there is more under it than the row already says. */
const hasDetail = (entry: StatReason) => Boolean(entry.reason?.selector || entry.hook?.site || entry.hook?.code || hookChain(entry.hook, 'short'));

const copy = (text: string) => void navigator.clipboard?.writeText(text);

/**
 * A line that copies what it says. The icon at its right shows on hover, so a row of file names does not read as a
 * row of buttons, and turns into a tick for a moment after the click — the answer is where the pointer is.
 */
export function CopyLine({ text, shown = text, className, title }: { text: string; shown?: string; className: string; title: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <button
      type="button"
      class={`copy-line ${className}`}
      data-copied={copied ? 'true' : undefined}
      title={copied ? 'Copied' : title}
      aria-label={copied ? `${text} copied` : `Copy ${text}`}
      onClick={() => {
        copy(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      }}
    >
      <span class="copy-text">{shown}</span>
      <span class="copy-mark" aria-hidden="true">
        {copied ? '✓' : '⧉'}
      </span>
    </button>
  );
}

/** The head has room for the file, not for the folders it sits in: `src/components/ChatView.tsx:36` → `ChatView.tsx:36`. */
const fileOf = (site: string) => site.slice(site.lastIndexOf('/') + 1);

function ReasonRow({
  entry,
  open,
  onToggle,
  who,
}: {
  entry: StatReason;
  open: boolean;
  onToggle: () => void;
  /** The component the reason belongs to, where the row stands outside that component's own card. */
  who?: string;
}): JSX.Element {
  const { reason, hook, n } = entry;
  const detail = hasDetail(entry);
  const parts = reason ? partsOf(reason, entry.hook) : { what: 'unknown', same: undefined };
  const chain = hookChain(hook, 'short');
  const head = (
    <>
      <span class="tw" aria-hidden="true">
        {detail ? (open ? '▾' : '▸') : ''}
      </span>
      {who ? <span class="who">{who}</span> : null}
      {n !== undefined ? <span class="n">{`${n}×`}</span> : null}
      {reason ? (
        <span class="kind" data-kind={reason.kind}>
          {reason.kind}
        </span>
      ) : null}
      {parts.what ? <span class="what">{parts.what}</span> : null}
      {parts.same ? <span class="muted">{parts.same}</span> : null}
      {reason?.sameContent ? (
        <span class="flag" title="A new value with the same content: a subscription bug, not new data">
          same content
        </span>
      ) : null}
    </>
  );
  return (
    <div class="reason" data-open={open ? 'true' : undefined}>
      {/* A row that opens is a button, so a keyboard gets to it and a screen reader hears whether it is open. */}
      {detail ? (
        <button type="button" class="reason-head" data-clickable="true" aria-expanded={open} onClick={onToggle}>
          {head}
        </button>
      ) : (
        <div class="reason-head">{head}</div>
      )}
      {open && detail ? (
        <div class="reason-body">
          {reason?.selector ? <div class="sel">{reason.selector}</div> : null}
          {chain ? (
            <div class="chain" title={hookChain(hook, 'full')}>
              {chain}
            </div>
          ) : null}
          {hook?.site ? <CopyLine className="site" text={hook.site} title="Copy the file and line" /> : null}
          {hook?.code ? <div class="code">{hook.code}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A reason on its own, outside a card: an action's leading root, a root of one commit, a root leading right now. */
export function ReasonLine({ entry, who, openFirst = false }: { entry: StatReason; who?: string; openFirst?: boolean }): JSX.Element {
  const [open, setOpen] = useState(openFirst);
  return <ReasonRow entry={entry} who={who} open={open} onToggle={() => setOpen(!open)} />;
}

/** A number the report leads with: what it counts, and whether it is the kind that means wasted work. */
export interface Kpi {
  label: string;
  value: string;
  tone?: 'warn';
  title?: string;
}

export const Kpis = ({ items }: { items: Kpi[] }): JSX.Element => (
  <div class="kpis">
    {items.map((k) => (
      <div class="kpi" key={k.label} data-tone={k.tone} title={k.title}>
        <span class="kpi-value">{k.value}</span>
        <span class="kpi-label">{k.label}</span>
      </div>
    ))}
  </div>
);

/**
 * One component of the report: its name and numbers on the head, a row per reason under it; the hooks and the line
 * to open are one click away, so the reading stays short.
 */
/** `core:timer setInterval @ src/basics/StateDown.tsx` reads as `setInterval @ StateDown.tsx`; the title keeps the whole key. */
const shortCause = (key: string) => key.replace(/^core:(timer )?/, '').replace(/@ \S*\/([^/\s]+)$/, '@ $1');

export function StatCard({
  name,
  source,
  badges,
  reasons,
  ways,
  openFirst,
}: {
  name: string;
  source?: string;
  badges: Badge[];
  reasons: StatReason[];
  /** How its renders came down from their roots, most frequent first. */
  ways?: Way[];
  /** Roots open their leading reason: it is the answer the report was opened for. */
  openFirst?: boolean;
}): JSX.Element {
  const first = reasons.findIndex(hasDetail);
  const [open, setOpen] = useState(openFirst ? first : -1);
  return (
    <div class="stat">
      <div class="stat-head">
        <span class="stat-name">{name}</span>
        {badges.map((badge) => (
          <span
            class="badge"
            key={badge.text}
            data-tone={badge.tone}
            title={/ wasted$/.test(badge.text) ? 'Renders after which nothing in the DOM of that component changed' : undefined}
          >
            {badge.text}
          </span>
        ))}
        {source ? <CopyLine className="stat-src" text={source} shown={fileOf(source)} title={`${source} — click to copy`} /> : null}
      </div>
      {reasons.map((entry, i) => (
        <ReasonRow key={`${entry.id}-${i}`} entry={entry} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
      ))}
      {ways?.length ? (
        <div class="ways">
          {ways.map((way, i) => (
            <WayRow key={i} way={way} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Past this many links a way reads down the card, a link a line; in a row it would wrap into a paragraph. */
const IN_A_ROW = 4;
/** A column this long shows its two top links, its last four and the ones worth fixing; the rest behind a button. */
const FOLDED = 8;

/** A link: who rendered, and why — a root's own reason, or the props its parent handed on, each after its chip. */
export function StepView({ step }: { step: WayStep }): JSX.Element {
  return (
    <>
      <span class="way-name">{step.name}</span>
      {stepParts(step).map((part, k) => (
        <span class="way-why" key={k} data-tone={part.tone}>
          {part.label ? <span class="way-label">{part.label}</span> : null}
          {part.text}
        </span>
      ))}
    </>
  );
}

function WayStepItem({ step }: { step: WayStep }): JSX.Element {
  return (
    // Props equal on a link: the parent rendered for nothing this child needed — a memo would stop it here.
    <li class="way-step" data-equal={step.equal ? 'true' : undefined} data-skipped={step.skipped ? 'true' : undefined}>
      <StepView step={step} />
    </li>
  );
}

function WayRow({ way }: { way: Way }): JSX.Element {
  const [open, setOpen] = useState(false);
  const { steps } = way;
  const column = steps.length > IN_A_ROW;
  const folded = column && !open && steps.length > FOLDED;
  // Folded, the middle keeps the links worth fixing: equal props, or a prop new with the same content.
  const shown = (i: number) => !folded || i < 2 || i >= steps.length - 4 || Boolean(steps[i].equal || steps[i].same);
  const items: JSX.Element[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (shown(i)) {
      items.push(<WayStepItem key={i} step={steps[i]} />);
      continue;
    }
    let end = i;
    while (end < steps.length && !shown(end)) end++;
    items.push(
      <li class="way-step way-more" key={`more-${i}`}>
        <button type="button" data-rpr="way-more" onClick={() => setOpen(true)}>{`… ${end - i} more`}</button>
      </li>
    );
    i = end - 1;
  }
  return (
    <div class="way" data-rpr="way" data-column={column ? 'true' : undefined} title={`${way.n} renders came down this way`}>
      <span class="way-n">{`×${way.n}`}</span>
      {way.cause ? (
        <span class="way-cause" title={way.cause}>
          {shortCause(way.cause)}
        </span>
      ) : null}
      <ol class="way-steps">{items}</ol>
    </div>
  );
}

/** A warning of the recording, as a card with an ⓘ: it colours the numbers above it, so it is read before them. */
export function Notice({ text }: { text: string }): JSX.Element {
  const bad = text.startsWith('error: ');
  const body = bad ? text.slice('error: '.length) : text;
  const at = body.indexOf(': ');
  const head = bad ? 'error' : at > 0 ? body.slice(0, at) : body;
  const rest = bad ? body : at > 0 ? body.slice(at + 2) : '';
  return (
    <div class="notice-card" data-tone={bad ? 'bad' : undefined}>
      <span class="notice-icon" aria-hidden="true">
        {bad ? '!' : 'i'}
      </span>
      <div>
        <span class="notice-head">{head}</span>
        {rest ? <span class="notice-text">{` — ${rest}`}</span> : null}
      </div>
    </div>
  );
}
