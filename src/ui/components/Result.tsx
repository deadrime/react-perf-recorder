/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import type { Saved } from '../../core/engine';
import { summarize, type RootLine } from '../../shared/summary';
import { downloadJson } from '../download';
import { Line, N, Why } from './Text';

const Section = ({ title, rows }: { title: string; rows: JSX.Element[] }) =>
  rows.length ? (
    <div class="section">
      <h4>{title}</h4>
      {rows}
    </div>
  ) : null;

const rootRows = (roots: RootLine[]) =>
  roots.map((r) => (
    <Line key={r.root}>
      <N>{r.root}</N>
      {` ×${r.hits} · ${r.perHit}/hit${r.instances > 1 ? ` · ${r.instances} inst` : ''}${r.noDomChange ? ` · ${r.noDomChange} no-DOM` : ''}${
        r.mounts ? ` · ${r.mounts} mounts` : ''
      } `}
      <Why>{r.reasons.join('; ')}</Why>
    </Line>
  ));

/** The summary shown after Stop: a pure function of the recording, so it is summarized once and redrawn for free. */
export function Result({ rec, onDismiss }: { rec: Saved; onDismiss: () => void }): JSX.Element {
  const s = useMemo(() => summarize(rec, 5), [rec]);
  const t = s.totals;
  const roots = [...rec.roots, ...rec.outsideRoots];
  const appComponents = rec.components.filter((c) => !c.library && !c.wrapper);
  const hidden = rec.components.length - appComponents.length;
  return (
    <>
      <Line>
        {`${s.durationSec}s · `}
        <N>{t.commitsInScope}</N>
        {` commits${s.scope ? ' in area' : ''} (${t.commits} total) · `}
        <N>{t.renders}</N>
        {` renders · ${t.rendersPerScopeCommit}/commit · ${t.rendersWithoutDom} without DOM change`}
        {t.rendersFromOutside ? ` · ${t.rendersFromOutside} from outside` : ''}
      </Line>
      <Section
        title="Actions"
        rows={s.actions.map((a) => (
          <Line key={`${a.atSec}${a.what}`}>
            {`${a.atSec}s ${a.what} — `}
            <N>{a.renders}</N>
            {` renders, ${a.commits} commits`}
            {a.perChar ? ` (${a.perChar})` : ''}
            {a.latencyMs ? ` · ${a.latencyMs}ms` : ''}
            {a.topRoot ? ' · ' : ''}
            {a.topRoot ? <Why>{a.topRoot}</Why> : ''}
          </Line>
        ))}
      />
      <Section
        title="Watched"
        rows={Object.entries(rec.watch ?? {}).map(([name, w]) => (
          <Line key={name}>
            <N>{w.renders}</N>
            {` renders of ${name}${w.mounted !== 1 ? ` (${w.mounted} mounted)` : ''} `}
            <Why>
              {w.byRoot
                .map(([index, count]) => `${count}× ${index === null ? 'unknown root' : roots[index]?.name ?? '?'}`)
                .slice(0, 3)
                .join('; ')}
            </Why>
          </Line>
        ))}
      />
      <Section title="Roots" rows={rootRows(s.topRoots)} />
      <Section title="From outside the area" rows={rootRows(s.outsideRoots)} />
      <Section
        title="Causes"
        rows={s.topCauses.map((c) => (
          <Line key={c.key}>
            <N>{c.commits}</N>
            {` commits ← ${c.key}`}
            {c.keys ? <Why>{` · ${c.keys}`}</Why> : ''}
          </Line>
        ))}
      />
      <Section
        title="Components"
        rows={[
          ...appComponents.slice(0, 8).map((c) => (
            <Line key={c.name}>
              <N>{c.renders}</N>
              {` ${c.name}${c.memo ? ' (memo)' : ''}${c.withoutDom ? ` · ${c.withoutDom} no-DOM` : ''} `}
              <Why>{c.reasons.map(([r, k]) => `${k}× ${r}`).join('; ')}</Why>
            </Line>
          )),
          ...(hidden > 0 ? [<Line key="hidden">{<span class="muted">{`+ ${hidden} wrappers and components of packages`}</span>}</Line>] : []),
        ]}
      />
      {Object.entries(s.plugins).map(([name, plugin]) => (
        <Section key={name} title={name} rows={plugin.highlights.slice(0, 2).map((text) => <Line key={text}>{text}</Line>)} />
      ))}
      <Section title="Warnings" rows={s.warnings.slice(0, 3).map((w) => <Line key={w}>{w}</Line>)} />
      <div class="row section">
        {rec.id ? <span class="muted">{`saved ${rec.id}`}</span> : <span class="error">{rec.saveError ?? 'not saved'}</span>}
        {rec.id ? <button onClick={() => void navigator.clipboard?.writeText(rec.id ?? '')}>Copy id</button> : null}
        <button onClick={() => downloadJson(rec)}>Download</button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    </>
  );
}
