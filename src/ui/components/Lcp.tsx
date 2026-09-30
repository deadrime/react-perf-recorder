/** @jsxImportSource preact */
import type { JSX } from 'preact';
import type { LcpPhases, LcpStats, RecordingV2 } from '../../shared/schema';
import { candidateLines, lcpFindings, secs } from '../../shared/lcp';

/** Chrome's line between good and needs improvement. */
export const LCP_GOOD_MS = 2500;

const PHASES: Array<[keyof LcpPhases, string]> = [
  ['ttfb', 'TTFB'],
  ['loadDelay', 'load delay'],
  ['loadDuration', 'load'],
  ['renderDelay', 'render delay'],
];

/** The tag the paint was of, as the section and the timeline name it next to its component. */
export const lcpWho = (lcp: LcpStats) => lcp.element.component ?? lcp.element.node.split(' > ').pop() ?? 'an element';

/** The four parts of the paint as one bar, each as wide as its share; the largest is the one to read first. */
export function PhaseBar({ phases }: { phases: LcpPhases }): JSX.Element {
  const total = PHASES.reduce((sum, [key]) => sum + phases[key], 0) || 1;
  const largest = PHASES.reduce((most, [key]) => (phases[key] > phases[most] ? key : most), 'ttfb' as keyof LcpPhases);
  return (
    <div class="lcp-phases" data-rpr="lcp-phases">
      <div class="lcp-bar">
        {PHASES.filter(([key]) => phases[key] > 0).map(([key, name]) => (
          <span key={key} class="lcp-part" data-phase={key} style={`flex-grow:${phases[key] / total}`} title={`${name} ${phases[key]}ms`} />
        ))}
      </div>
      <div class="lcp-legend">
        {PHASES.map(([key, name]) => (
          <span key={key} class="lg" data-largest={key === largest ? 'true' : undefined}>
            <i class="lcp-part" data-phase={key} />
            {`${name} ${phases[key]}ms`}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Whether the picked element was found on the page now, in the words of the shifts' outline line. */
export const LcpFound = ({ found, id }: { found: boolean; id: string }) => (
  <p class="tl-outlined" data-rpr={id} data-found={found ? 1 : 0}>
    {found ? '◻ highlighted on the page' : 'not on the page now'}
  </p>
);

/**
 * The largest paint of a recording from the load: its element and the component that rendered it, the four phases,
 * and the findings in the words of the MCP section. The row picked highlights the element on the page.
 */
export function Lcp({
  rec,
  lcp,
  picked,
  onPick,
  found,
}: {
  rec: RecordingV2;
  lcp: LcpStats;
  picked: boolean;
  onPick: (on: boolean) => void;
  found: boolean | null;
}): JSX.Element {
  const findings = lcpFindings(rec, lcp);
  const { element } = lcp;
  return (
    <div class="lcp" data-rpr="lcp">
      <div class="shift" data-picked={picked ? 'true' : undefined}>
        <button
          type="button"
          class="shift-row"
          data-rpr="lcp-element"
          aria-pressed={picked}
          title={picked ? 'Take the highlight off the page' : 'Highlight the element on the page'}
          onClick={() => onPick(!picked)}
        >
          <span class="shift-head">
            <span class="badge" data-tone={lcp.ms > LCP_GOOD_MS ? 'warn' : undefined}>
              {secs(lcp.ms)}
            </span>
            <span class="who">{lcpWho(lcp)}</span>
            <span class="shift-move">{`${element.kind}${element.url ? ` · ${element.url}` : ''}`}</span>
          </span>
          {element.file ? <code class="shift-where">{element.file}</code> : null}
        </button>
        {picked && found !== null ? <LcpFound found={found} id="lcp-outlined" /> : null}
      </div>
      <PhaseBar phases={lcp.phases} />
      {findings.length ? (
        <ul class="lcp-findings" data-rpr="lcp-findings">
          {findings.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
      {lcp.candidates.length ? (
        <p class="muted lcp-before" title={candidateLines(lcp).join('\n')}>
          {`Largest before it: ${candidateLines(lcp).slice(-1)[0]}`}
        </p>
      ) : null}
      {lcp.inputAtMs !== undefined ? (
        <p class="muted">{`The browser looked no further after the first input or scroll, at ${secs(lcp.inputAtMs)}.`}</p>
      ) : null}
    </div>
  );
}
