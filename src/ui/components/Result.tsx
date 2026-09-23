/** @jsxImportSource preact */
import type { ComponentChildren, JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { Saved } from '../../core/engine';
import type { RootStat } from '../../shared/schema';
import { hookOf, reasonsById, summarize } from '../../shared/summary';
import { downloadJson } from '../download';
import { Compare, compareNote, type Comparison } from './Compare';
import { Kpis, Notice, ReasonLine, StatCard, type Badge, type Kpi, type StatReason } from './Stats';
import { causeColour, Timeline } from './Timeline';

/**
 * A part of the report that folds away. The parts read first start open, the long tail starts closed; a fold a
 * person closed stays closed while they look around, because the `open` it was drawn with does not change.
 */
const Fold = ({ id, title, note, open = true, children }: { id: string; title: string; note?: string; open?: boolean; children: ComponentChildren }) => (
  <details class="fold" data-fold={id} open={open}>
    <summary>
      <span class="fold-title">{title}</span>
      {note ? <span class="fold-note">{note}</span> : null}
    </summary>
    <div class="fold-body">{children}</div>
  </details>
);

/** A slow action: past this the delay between a click and the screen is felt. */
const SLOW_MS = 100;

/**
 * The summary shown after Stop: the answer first — the root that cost most, why, and where — then what to read it
 * against, then the parts that explain it. A pure function of the recording, summarized once and redrawn for free.
 */
export function Result({
  rec,
  compared,
  onDismiss,
  wide,
  onWide,
}: {
  rec: Saved;
  compared?: Comparison | null;
  onDismiss: () => void;
  wide: boolean;
  onWide: () => void;
}): JSX.Element {
  const s = useMemo(() => summarize(rec, 5), [rec]);
  const t = s.totals;
  const roots = useMemo(() => [...rec.roots, ...rec.outsideRoots], [rec]);
  const reasons = useMemo(() => reasonsById(rec.reasons), [rec]);
  const [litCause, setLitCause] = useState<number | null>(null);

  // A component's reasons carry no hooks of their own; the root of the same name knows which hook each one came from.
  const rootByName = useMemo(() => new Map(roots.map((r) => [r.name, r])), [roots]);
  const stated = (stat: { reasons: Array<[number, number]> }, root?: RootStat): StatReason[] =>
    stat.reasons.slice(0, 3).map(([id, n]) => {
      const reason = reasons.get(id);
      return { id, n, reason, hook: root && reason ? hookOf(root, reason) : undefined };
    });
  const rootCard = (root: RootStat, openFirst = true) => {
    const badges: Badge[] = [{ text: `×${root.hits}`, tone: 'count' }, { text: `${root.perHit}/hit` }];
    if (root.instances > 1) badges.push({ text: `${root.instances} inst` });
    if (root.noDomChange) badges.push({ text: `${root.noDomChange} wasted`, tone: 'warn' });
    if (root.mounts) badges.push({ text: `${root.mounts} mounts` });
    if (root.renderMs) badges.push({ text: `${+(root.renderMs / Math.max(1, root.hits)).toFixed(2)}ms/hit` });
    return <StatCard key={root.key} name={root.name} source={root.source} badges={badges} reasons={stated(root, root)} openFirst={openFirst} />;
  };

  // The answer. A root whose renders changed nothing on the screen is the one to fix, and the one with the most of
  // them wasted comes first; with none of those, the report says which rendered most and does not call it a cause —
  // two clicks on a tab render a lot, and rightly.
  const wasted = (r: RootStat) => r.noDomChange * r.perHit;
  const suspect = roots.filter((r) => r.noDomChange > 0).sort((a, b) => wasted(b) - wasted(a))[0];
  const lead = suspect ?? rec.roots[0] ?? rec.outsideRoots[0];
  const leadIsOutside = Boolean(lead) && rec.outsideRoots.includes(lead);
  const leadTitle = `${suspect ? 'Main cause · wasted renders' : 'Rendered most'}${leadIsOutside ? ' · from outside the area' : ''}`;
  const otherRoots = rec.roots.filter((r) => r !== lead).slice(0, 4);
  const otherOutside = rec.outsideRoots.filter((r) => r !== lead).slice(0, 3);
  const slowest = Math.max(0, ...s.actions.map((a) => a.latencyMs ?? 0));
  const kpis: Kpi[] = [
    { value: String(t.commitsInScope), label: s.scope ? 'commits in area' : 'commits', title: `${t.commits} in the whole app` },
    { value: String(t.renders), label: 'renders', title: `${t.rendersPerScopeCommit} per commit` },
    // "0 · changed nothing" read as "nothing changed": the tile names what is counted, and the share says of what.
    {
      value: String(t.rendersWithoutDom),
      label: t.renders && t.rendersWithoutDom ? `wasted renders · ${Math.round((t.rendersWithoutDom / t.renders) * 100)}%` : 'wasted renders',
      tone: t.rendersWithoutDom ? 'warn' : undefined,
      title: 'Renders after which nothing in the DOM of the component changed',
    },
    ...(slowest ? [{ value: `${slowest}ms`, label: 'slowest action', tone: slowest > SLOW_MS ? ('warn' as const) : undefined }] : []),
    { value: `${s.durationSec}s`, label: 'recorded' },
  ];

  const segments = useMemo(() => new Map(rec.segments.map((seg) => [seg.action, seg])), [rec]);
  const rootNames = new Set(roots.map((r) => r.name));
  const appComponents = rec.components.filter((c) => !c.library && !c.wrapper);
  const hidden = rec.components.length - appComponents.length;
  // Roots have cards of their own above; the list below is the rest of what rendered.
  const others = appComponents.filter((c) => !rootNames.has(c.name));
  const causes = useMemo(() => new Map(s.topCauses.map((c) => [c.key, c.keys])), [s]);

  return (
    <>
      <div class="verdict" data-rpr="verdict">
        <Kpis items={kpis} />
        {lead ? (
          <>
            <h4 class="verdict-title">{leadTitle}</h4>
            {rootCard(lead)}
          </>
        ) : (
          <p class="muted">Nothing rendered while this was recording.</p>
        )}
      </div>

      {s.warnings.length ? (
        <div class="notices">
          {s.warnings.slice(0, 3).map((w) => (
            <Notice key={w} text={w} />
          ))}
        </div>
      ) : null}

      {compared ? (
        <Fold id="compare" title="Before → after" note={compareNote(compared)}>
          <Compare c={compared} />
        </Fold>
      ) : null}

      {s.actions.length ? (
        <Fold id="actions" title="Actions" note={`${s.actions.length}`}>
          {s.actions.map((a) => {
            const seg = segments.get(a.id);
            const top = seg?.topRoots[0];
            const root = top ? roots[top[0]] : undefined;
            const first = root?.reasons[0];
            const reason = first ? reasons.get(first[0]) : undefined;
            return (
              <div class="action" key={a.id}>
                <div class="action-head">
                  <span class="action-at">{`${a.atSec}s`}</span>
                  <span class="action-what">{a.what}</span>
                  <span class="badge" data-tone="count">{`${a.renders} renders`}</span>
                  <span class="badge">{`${a.commits} commits`}</span>
                  {seg?.perChar ? <span class="badge" title={a.perChar}>{`${seg.perChar.renders}/char`}</span> : null}
                  {a.latencyMs ? (
                    <span class="badge" data-tone={a.latencyMs > SLOW_MS ? 'warn' : undefined} title="From the event to the next paint">
                      {`${a.latencyMs}ms`}
                    </span>
                  ) : null}
                </div>
                {root && top && first ? (
                  <ReasonLine who={`${root.name} ×${top[1]}`} entry={{ id: first[0], reason, hook: reason ? hookOf(root, reason) : undefined }} />
                ) : null}
              </div>
            );
          })}
        </Fold>
      ) : null}

      {rec.watch && Object.keys(rec.watch).length ? (
        <Fold id="watched" title="Watched">
          {Object.entries(rec.watch).map(([name, w]) => (
            <div class="watched" key={name}>
              <span class="who">{name}</span>
              <span class="badge" data-tone="count">{`${w.renders} renders`}</span>
              {w.mounted !== 1 ? <span class="badge">{`${w.mounted} mounted`}</span> : null}
              <span class="muted">
                {w.byRoot
                  .slice(0, 3)
                  .map(([index, count]) => `${count}× ${index === null ? 'unknown root' : roots[index]?.name ?? '?'}`)
                  .join(' · ')}
              </span>
            </div>
          ))}
        </Fold>
      ) : null}

      {otherRoots.length ? (
        <Fold id="roots" title="Other roots" note={`${otherRoots.length}`}>
          {otherRoots.map((root) => rootCard(root, false))}
        </Fold>
      ) : null}

      {otherOutside.length ? (
        <Fold id="outside" title="From outside the area">
          {otherOutside.map((root) => rootCard(root, false))}
        </Fold>
      ) : null}

      <Fold id="timeline" title="Timeline" note={`${rec.commits.list.length} commits${rec.commits.truncated ? ' (truncated)' : ''}`}>
        {rec.causes.length ? (
          // The legend of the tracks' colours, and a filter: a cause picked here lights up its commits below.
          <div class="causes" data-rpr="causes">
            {rec.causes.slice(0, 6).map((c) => (
              <button
                type="button"
                class="cause"
                key={c.i}
                data-rpr="cause"
                aria-pressed={litCause === c.i}
                title={litCause === c.i ? 'Show every commit again' : 'Light up the commits this caused'}
                onClick={() => setLitCause(litCause === c.i ? null : c.i)}
              >
                <i class="swatch" style={`background:${causeColour(c.key)}`} />
                <span class="n">{c.commits}</span>
                <span class="cause-key">{c.key}</span>
                {causes.get(c.key) ? <span class="muted">{causes.get(c.key)}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        <Timeline rec={rec} litCause={litCause} onReset={() => setLitCause(null)} />
      </Fold>

      {others.length || hidden ? (
        <Fold id="components" title="Components" note={`${others.length}${hidden ? ` + ${hidden} hidden` : ''}`} open={false}>
          {others.slice(0, 8).map((c) => {
            const badges: Badge[] = [{ text: `×${c.renders}`, tone: 'count' }];
            if (c.memo) badges.push({ text: 'memo' });
            if (c.withoutDom) badges.push({ text: `${c.withoutDom} wasted`, tone: 'warn' });
            if (c.mounts) badges.push({ text: `${c.mounts} mounts` });
            const root = rootByName.get(c.name);
            return <StatCard key={c.name} name={c.name} source={root?.source} badges={badges} reasons={stated(c, root)} />;
          })}
          {hidden ? <p class="muted">{`+ ${hidden} wrappers and components of packages`}</p> : null}
        </Fold>
      ) : null}

      {Object.keys(s.plugins).length ? (
        <Fold id="plugins" title="Plugins" note={Object.keys(s.plugins).join(' · ')} open={false}>
          {Object.entries(s.plugins).map(([name, plugin]) => (
            <div class="plugin" key={name}>
              <span class="who">{name}</span>
              {plugin.highlights.slice(0, 3).map((text) => (
                // A cache smaller than the arguments it is called with is the one line here that is always a bug.
                <span class="badge" key={text} data-tone={/cache size/.test(text) ? 'warn' : undefined}>
                  {text}
                </span>
              ))}
            </div>
          ))}
        </Fold>
      ) : null}

      <div class="result-bar" data-rpr="result-bar">
        {rec.id ? <span class="muted saved">{`saved ${rec.id}`}</span> : <span class="error">{rec.saveError ?? 'not saved'}</span>}
        {rec.id ? (
          <button type="button" onClick={() => void navigator.clipboard?.writeText(rec.id ?? '')}>
            Copy id
          </button>
        ) : null}
        <button type="button" onClick={() => downloadJson(rec)}>
          Download
        </button>
        <button type="button" data-rpr="wide" aria-pressed={wide} title={wide ? 'Back to the narrow panel' : 'A wider panel for the report'} onClick={onWide}>
          {wide ? '⤡ Narrow' : '⤢ Wide'}
        </button>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </>
  );
}
