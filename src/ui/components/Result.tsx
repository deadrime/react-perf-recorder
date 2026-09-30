/** @jsxImportSource preact */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Saved } from '../../core/engine';
import { GROWTH_KEYS, type GrowthKey, type GrowthMetric, type GrowthOrigin, type GrowthStats, type RootStat } from '../../shared/schema';
import { hookOf, reasonsById, summarize, waysOf } from '../../shared/summary';
import { downloadJson } from '../download';
import { Compare, compareNote, type Comparison } from './Compare';
import { Cpu } from './Cpu';
import { Memos } from './Memos';
import type { ShiftOutline } from './PanelView';
import { Shifts, shiftValue, type ShiftFound } from './Shifts';
import { runMoves, shiftRuns } from '../../shared/shifts';
import { planReplay } from '../../shared/replay';
import { Kpis, Notice, ReasonLine, StatCard, type Badge, type Kpi, type StatReason } from './Stats';
import { causeColour, Timeline } from './Timeline';

/**
 * A part of the report that folds away. The parts read first start open, the long tail starts closed; a fold a
 * person closed stays closed while they look around, because the `open` it was drawn with does not change.
 */
const Fold = ({
  id,
  title,
  note,
  open = true,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  open?: boolean;
  children: ComponentChildren;
}) => (
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
  onRepeat,
  onOutline,
  onOutlineShift,
  onDismiss,
  wide,
  onWide,
}: {
  rec: Saved;
  compared?: Comparison | null;
  onRepeat?: () => void;
  onOutline?: (entries: Array<{ i: number; hits: number }> | null) => number;
  onOutlineShift?: (shift: ShiftOutline | null) => ShiftFound;
  onDismiss: () => void;
  wide: boolean;
  onWide: () => void;
}): JSX.Element {
  const s = useMemo(() => summarize(rec, 5), [rec]);
  const t = s.totals;
  const roots = useMemo(() => [...rec.roots, ...rec.outsideRoots], [rec]);
  const reasons = useMemo(() => reasonsById(rec.reasons), [rec]);
  const [litCause, setLitCause] = useState<number | null>(null);
  const runs = useMemo(() => shiftRuns(rec.shifts?.list ?? []), [rec]);
  // A run of layout shifts picked in its section or on the timeline, and how much of it is on the page now.
  const [pickedRun, setPickedRun] = useState<number | null>(null);
  const [shiftOutlined, setShiftOutlined] = useState<ShiftFound | null>(null);
  useEffect(() => {
    if (!onOutlineShift) return;
    const run = pickedRun === null ? undefined : runs[pickedRun];
    const cause = run?.first.cause;
    setShiftOutlined(
      run ? onOutlineShift({ moved: runMoves(run), ...(cause && 'by' in cause && cause.by ? { by: cause.by } : {}) }) : (onOutlineShift(null), null)
    );
  }, [pickedRun, runs]);
  useEffect(() => () => void onOutlineShift?.(null), []);

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
    if (root.ownDomUnchanged)
      badges.push({
        text: `${root.ownDomUnchanged} for nothing`,
        tone: 'warn',
        title: 'Renders that changed none of its own elements, nor anything drawn from a value it passed: what changed below re-renders by itself',
      });
    if (root.mounts) badges.push({ text: `${root.mounts} mounts` });
    if (root.renderMs) badges.push({ text: `${+(root.renderMs / Math.max(1, root.hits)).toFixed(2)}ms/hit` });
    return <StatCard key={root.key} name={root.name} source={root.source} badges={badges} reasons={stated(root, root)} openFirst={openFirst} />;
  };

  // A root whose renders changed nothing on screen, or nothing of its own, is the one to fix; with none, the one that
  // rendered most is not called a cause — two clicks on a tab render a lot, and rightly.
  const wasted = (r: RootStat) => (r.ownDomUnchanged ?? r.noDomChange) * r.perHit;
  const suspect = roots.filter((r) => wasted(r) > 0).sort((a, b) => wasted(b) - wasted(a))[0];
  const lead = suspect ?? rec.roots[0] ?? rec.outsideRoots[0];
  const leadIsOutside = Boolean(lead) && rec.outsideRoots.includes(lead);
  const leadTitle = `${suspect ? 'Main cause · wasted renders' : 'Rendered most'}${leadIsOutside ? ' · from outside the area' : ''}`;
  const otherRoots = rec.roots.filter((r) => r !== lead).slice(0, 4);
  const otherOutside = rec.outsideRoots.filter((r) => r !== lead).slice(0, 3);
  const slowest = Math.max(0, ...s.actions.map((a) => a.latencyMs ?? 0));
  const cls = rec.shifts?.cls;
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
    ...(cls && runs.length
      ? [
          {
            value: shiftValue(cls.value),
            label: cls.nearMiss >= 0.01 ? `CLS · near miss ${shiftValue(cls.nearMiss)}` : 'CLS',
            // Chrome's own line between good and needs improvement.
            tone: cls.value >= 0.1 || cls.nearMiss >= 0.1 ? ('warn' as const) : undefined,
            title: `Cumulative layout shift: the worst window of shifts, as Chrome counts it. ${cls.count} shifts, ${shiftValue(
              cls.excluded
            )} left out after inputs`,
          },
        ]
      : []),
    { value: `${s.durationSec}s`, label: 'recorded' },
  ];

  const segments = useMemo(() => new Map(rec.segments.map((seg) => [seg.action, seg])), [rec]);
  const rootNames = new Set(roots.map((r) => r.name));
  const appComponents = rec.components.filter((c) => !c.library && !c.wrapper);
  const hidden = rec.components.length - appComponents.length;
  // Roots have cards of their own above; the list below is the rest of what rendered.
  const others = appComponents.filter((c) => !rootNames.has(c.name));
  const causes = useMemo(() => new Map(s.topCauses.map((c) => [c.key, c.keys])), [s]);
  const plan = useMemo(() => planReplay(rec), [rec]);

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
        <Fold id="compare" title="Before → after" note={compareNote(compared, Boolean(rec.label?.startsWith('replay of')))}>
          <Compare c={compared} />
        </Fold>
      ) : null}

      {rec.memos?.length ? (
        <Fold
          id="memos"
          title="Memos that miss"
          note={`${rec.memos.filter((m) => m.recomputed === m.renders).length} every render · ${rec.memos.length}`}
          open={rec.memos.some((m) => m.recomputed === m.renders && !m.info?.library)}
        >
          <Memos memos={rec.memos} />
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

      {cls && runs.length ? (
        <Fold
          id="shifts"
          title="Layout shifts"
          note={`CLS ${shiftValue(cls.value)}${cls.nearMiss ? ` · near miss ${shiftValue(cls.nearMiss)}` : ''} · ${cls.count}`}
          // Below a hundredth nothing is worth reading first, as in the summary line.
          open={cls.value >= 0.01 || cls.nearMiss >= 0.01}
        >
          <Shifts rec={rec} runs={runs} picked={pickedRun} onPick={setPickedRun} outlined={shiftOutlined} />
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
        <Timeline
          rec={rec}
          litCause={litCause}
          onReset={() => setLitCause(null)}
          onOutline={onOutline}
          runs={runs}
          pickedRun={pickedRun}
          onPickRun={setPickedRun}
          runOutlined={shiftOutlined}
        />
      </Fold>

      {rec.cpu ? <Cpu cpu={rec.cpu} open={rec.cpu.busyMs > rec.cpu.wallMs * 0.15} /> : null}

      {rec.growth ? <Growth growth={rec.growth} /> : null}

      {others.length || hidden ? (
        <Fold id="components" title="Components" note={`${others.length}${hidden ? ` + ${hidden} hidden` : ''}`} open={false}>
          {others.slice(0, 8).map((c) => {
            const badges: Badge[] = [{ text: `×${c.renders}`, tone: 'count' }];
            if (c.memo) badges.push({ text: 'memo' });
            if (c.withoutDom) badges.push({ text: `${c.withoutDom} wasted`, tone: 'warn' });
            if (c.mounts) badges.push({ text: `${c.mounts} mounts` });
            // Recorded fast: its reasons are a sample of its instances, its counts are not.
            if (c.sampled) badges.push({ text: 'reasons sampled' });
            const root = rootByName.get(c.name);
            const ways = waysOf(rec, c.chains);
            // The ways end in what the parent changed: a parent reason above them would say it twice.
            const own = ways.length ? stated(c, root).filter((r) => r.reason?.kind !== 'parent') : stated(c, root);
            return <StatCard key={c.name} name={c.name} source={root?.source} badges={badges} reasons={own} ways={ways} />;
          })}
          {hidden ? <p class="muted">{`+ ${hidden} wrappers and components of packages`}</p> : null}
        </Fold>
      ) : null}

      {Object.keys(s.plugins).length ? (
        <Fold id="plugins" title="Plugins" note={Object.keys(s.plugins).join(' · ')} open={false}>
          {Object.entries(s.plugins).map(([name, plugin]) => (
            <div class="plugin" key={name} data-rpr="plugin">
              <div class="plugin-name">{name}</div>
              {plugin.highlights.slice(0, 3).map((text) => {
                // "selectX: 8/81 recomputes" reads as a name and its numbers; a line without a name stays whole.
                const at = text.indexOf(': ');
                return (
                  // A cache smaller than the arguments it is called with is the one line here that is always a bug.
                  <div class="plugin-line" key={text} data-tone={/cache size/.test(text) ? 'warn' : undefined}>
                    {at > 0 ? <code class="plugin-key">{text.slice(0, at)}</code> : null}
                    <span class="plugin-value">{at > 0 ? text.slice(at + 2) : text}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </Fold>
      ) : null}

      <div class="result-bar" data-rpr="result-bar">
        {rec.id ? (
          <span class="muted saved">{`saved ${rec.id}`}</span>
        ) : rec.saveError ? (
          <span class="error">{rec.saveError}</span>
        ) : (
          // No dev server to keep it (a built demo, the script-tag engine): not a failure, and Download still works.
          <span class="muted saved" title="There is no dev server here to keep recordings: Download saves this one">
            kept in this tab
          </span>
        )}
        {rec.id ? (
          <button type="button" onClick={() => void navigator.clipboard?.writeText(rec.id ?? '')}>
            Copy id
          </button>
        ) : null}
        {onRepeat && plan.steps.length ? (
          <button
            type="button"
            class="repeat"
            data-rpr="repeat"
            title={`Reload the page and do these ${
              plan.steps.length
            } actions again at the same pace, recording — to see what a change of the code did${
              plan.skipped.length ? `. Not repeated: ${plan.skipped.join('; ')}` : ''
            }`}
            onClick={onRepeat}
          >
            ↻ Repeat
          </button>
        ) : null}
        <button type="button" onClick={() => downloadJson(rec)}>
          Download
        </button>
        <button
          type="button"
          data-rpr="wide"
          aria-pressed={wide}
          title={wide ? 'Back to the narrow panel' : 'A wider panel for the report'}
          onClick={onWide}
        >
          {wide ? '⤡ Narrow' : '⤢ Wide'}
        </button>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </>
  );
}

const SHORT: Record<GrowthKey, string> = {
  domNodes: 'DOM nodes',
  cssRules: 'CSS rules',
  styleElements: '<style>',
  intervals: 'intervals',
  listeners: 'listeners',
  heapKB: 'heap KB',
  observers: 'observers',
  connections: 'sockets',
};

interface Finding {
  key: string;
  count: string;
  title: string;
  where?: string;
  code?: string;
  hint: string;
  retained?: true;
}

/** Where a call was made: the mapped line, or the file the stack named. */
const placeOf = (o: GrowthOrigin) => o.site ?? o.origin.replace(/^.*@ /, '');

/** One line per thing left behind, most telling first: what it is, where, and what to change. */
function findingsOf(growth: GrowthStats): Finding[] {
  const grew = (key: GrowthKey) => {
    const m = growth.metrics[key];
    return Boolean(m && m.end > m.start);
  };
  const out: Finding[] = [];
  for (const g of (growth.styles ?? []).slice(0, 3))
    out.push({
      key: `s${g.source}${g.shape}`,
      count: `${g.rules}×`,
      title: g.component
        ? `${g.component}: a new CSS class for every ${g.varying?.map((v) => v.prop).join(', ') ?? 'render'}`
        : `${g.rules} new CSS rules: ${g.shape}`,
      where: g.source,
      hint: 'put the value into style or a CSS variable',
    });
  const held = growth.retained?.collected ? growth.retained.components.filter((c) => c.retained) : [];
  for (const c of held.slice(0, 3))
    out.push({
      key: `r${c.name}${c.site}`,
      count: `${c.retained} of ${c.unmounted}`,
      title: `${c.name} stays in memory after unmount`,
      where: c.site,
      hint: 'something outside React holds it: a listener, a timer, a subscription',
      retained: true,
    });
  const origins: Array<[GrowthKey, Array<GrowthOrigin & { title: string }>, string]> = [
    [
      'listeners',
      (growth.listeners ?? []).map((l) => ({ ...l, title: `${l.target} ${l.type} listener never removed` })),
      'remove it in the effect cleanup',
    ],
    ['intervals', (growth.intervals ?? []).map((t) => ({ ...t, title: 'setInterval never cleared' })), 'clear it in the effect cleanup'],
    ['observers', (growth.observers ?? []).map((o) => ({ ...o, title: `${o.kind} never disconnected` })), 'disconnect it on unmount'],
    [
      'connections',
      (growth.connections ?? []).map((o) => ({ ...o, title: `${o.kind}${o.url ? ` ${o.url}` : ''} left open` })),
      'close it on unmount',
    ],
  ];
  for (const [key, items, hint] of origins) {
    if (!grew(key)) continue;
    for (const o of items.slice(0, 3))
      out.push({ key: `${key}${o.title}${o.origin}`, count: `${o.live}×`, title: o.title, where: placeOf(o), code: o.code, hint });
  }
  return out;
}

const fmt = (m: GrowthMetric) => `${m.start} → ${m.end}`;

/** What the page held more of at the end, and who left it there; opens by itself when something kept growing. */
function Growth({ growth }: { growth: GrowthStats }) {
  const keys = GROWTH_KEYS.filter((key) => growth.metrics[key]);
  const growing = keys.filter((key) => growth.metrics[key]!.growing);
  const findings = findingsOf(growth);
  const held = findings.some((f) => f.retained);
  const note = [...growing.filter((key) => key !== 'styleElements').map((key) => SHORT[key]), ...(held ? ['retained'] : [])];
  // <style> elements grow with the CSS rules they hold: one leak, one row.
  const shown = keys.filter((key) => key !== 'styleElements' && growth.metrics[key]!.end !== growth.metrics[key]!.start);
  const still = keys.filter((key) => key !== 'styleElements' && !shown.includes(key));
  const styleEls = growth.metrics.styleElements;
  const retained = growth.retained;
  return (
    <Fold id="growth" title="Growth" note={note.length ? note.join(' · ') : 'nothing kept growing'} open={note.length > 0}>
      {findings.map((f) => (
        <div class="growth-find" key={f.key} {...(f.retained ? { 'data-rpr': 'retained' } : {})}>
          <span class="badge" data-tone="warn">
            {f.count}
          </span>
          <div class="growth-what">
            <div class="growth-title">{f.title}</div>
            {f.where ? <code class="growth-where">{f.where}</code> : null}
            {f.code ? <code class="growth-code">{f.code}</code> : null}
            <div class="muted">{f.hint}</div>
          </div>
        </div>
      ))}
      {shown.map((key) => {
        const m = growth.metrics[key]!;
        const d = m.end - m.start;
        const els = key === 'cssRules' && styleEls && styleEls.end > styleEls.start ? styleEls.end - styleEls.start : 0;
        return (
          <div class="growth-row" key={key} data-rpr="growth" data-key={key}>
            <span class="who">{SHORT[key]}</span>
            <span class="muted">{fmt(m)}</span>
            <span class="badge" data-tone={m.growing ? 'warn' : undefined}>{`${d > 0 ? '+' : ''}${d}`}</span>
            {m.growing ? <span class="muted">{`${m.perMin > 0 ? '+' : ''}${m.perMin}/min`}</span> : null}
            {els ? <span class="muted">{`in ${els} new <style>`}</span> : null}
          </div>
        );
      })}
      {retained ? (
        <div class="growth-row" data-rpr="growth" data-key="unmounted">
          <span class="who">unmounted</span>
          <span class="muted">{retained.unmounted}</span>
          {retained.collected ? (
            <span class="badge" data-tone={retained.retained ? 'warn' : undefined}>{`${retained.retained ?? 0} in memory`}</span>
          ) : null}
        </div>
      ) : null}
      {still.length ? <div class="growth-still muted">{`unchanged: ${still.map((key) => SHORT[key]).join(', ')}`}</div> : null}
    </Fold>
  );
}
