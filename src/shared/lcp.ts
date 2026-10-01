import type { LcpElement, LcpMount, LcpPhases, LcpStats, RecordingV2 } from './schema';
import { commitCausesOf, nodeText } from './shifts';

export const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/** `img.hero in HeroImage (src/Hero.tsx:12)`: the tag the paint was of, then who rendered it. */
export function elementText(e: LcpElement): string {
  const tag = e.node.split(' > ').pop();
  return e.component ? `${tag} in ${nodeText(e)}` : e.node;
}

/** `mounted in commit 3 (setTimeout)`: what put the element on the page, without the time. */
export function mountText(m: LcpMount, commitCauses?: (id: number) => string[]): string {
  if ('before' in m) return "in the page's HTML before React's first commit";
  const what =
    m.change === 'added'
      ? m.by
        ? `mounted with ${nodeText(m.by)}`
        : 'mounted'
      : m.change === 'text'
      ? 'its text set'
      : `its ${m.name ?? 'source'} set`;
  if ('dom' in m) return `${what} outside a React commit (an effect, a timer or a library)`;
  if (m.commit === null) return `${what} in ${m.first ? "React's first commit" : 'a commit'}`;
  const why = commitCauses?.(m.commit) ?? [];
  return `${what} in commit ${m.commit}${m.first ? ", React's first" : ''}${why.length ? ` (${why.slice(0, 2).join(', ')})` : ''}`;
}

const PHASE_WORDS: Record<keyof LcpPhases, string> = {
  ttfb: 'TTFB',
  loadDelay: 'load delay',
  loadDuration: 'load',
  renderDelay: 'render delay',
};

export const phasesText = (p: LcpPhases) => (Object.keys(PHASE_WORDS) as Array<keyof LcpPhases>).map((k) => `${PHASE_WORDS[k]} ${p[k]}ms`).join(', ');

/** What ran on the page between two moments of the recording: long frames and commits. */
function busyBetween(rec: Pick<RecordingV2, 'commits' | 'frames'>, from: number, to: number): string | null {
  const frames = rec.frames.loaf.filter((f) => f.atMs + f.duration > from && f.atMs < to);
  const commits = rec.commits.list.filter((c) => c.atMs >= from && c.atMs <= to);
  const parts: string[] = [];
  if (frames.length)
    parts.push(`${frames.length} long frame${frames.length > 1 ? 's' : ''} (${frames.reduce((s, f) => s + f.blocking, 0)}ms blocking)`);
  if (commits.length) {
    const ms = commits.reduce((s, c) => s + (c.ms ?? 0), 0);
    parts.push(`${commits.length} commit${commits.length > 1 ? 's' : ''}${ms >= 1 ? ` (${Math.round(ms)}ms rendering)` : ''}`);
  }
  return parts.length ? parts.join(' and ') : null;
}

/**
 * What the recording tells about the paint beyond web-vitals' four numbers, the finding for the largest part first:
 * the commit that mounted the element, a request that waited for it, a lazy image, what held the paint.
 */
export function lcpFindings(rec: Pick<RecordingV2, 'commits' | 'frames' | 'causes'>, lcp: LcpStats): string[] {
  const causes = commitCausesOf(rec);
  const { phases, mount, image } = lcp;
  const out: Array<{ weight: number; text: string }> = [];
  const mounted = mount && !('before' in mount) ? mount : null;
  if (mount && 'before' in mount) out.push({ weight: 0, text: `the element was ${mountText(mount)}: server-rendered` });
  const isImage = lcp.element.kind !== 'text';
  if (mounted) {
    const text = `${mountText(mounted, causes)} at ${secs(mounted.ms)}`;
    // Asked for within a few ms of the mount: nothing before it told the browser about the image.
    const waited = isImage && image?.requestMs !== undefined && image.requestMs >= mounted.ms - 5 && mounted.ms > phases.ttfb + 50;
    if (waited)
      out.push({
        weight: phases.loadDelay,
        text: `load delay ${phases.loadDelay}ms: the image was requested only when it was ${text}; a preload or server rendering starts it at the first byte`,
      });
    else if (!isImage && mounted.ms > phases.ttfb + 50)
      out.push({ weight: mounted.ms - phases.ttfb, text: `render delay ${phases.renderDelay}ms: the text was ${text}` });
    else out.push({ weight: 0, text: `the element was ${text}` });
  }
  if (image?.lazy)
    out.push({
      weight: phases.loadDelay || 1,
      text: 'the image has loading="lazy": the browser holds its request until layout, which the largest paint cannot afford',
    });
  if (image?.fetchPriority === 'low') out.push({ weight: phases.loadDelay || 1, text: 'the image has fetchpriority="low"' });
  if (image?.initiator === 'link') out.push({ weight: 0, text: 'the image was preloaded' });
  if (isImage && phases.loadDuration > 0) out.push({ weight: phases.loadDuration, text: `the image took ${phases.loadDuration}ms to arrive` });
  if (phases.renderDelay > 0) {
    const paintAt = lcp.atMs;
    // For text, the wait before its mount is the mount's finding: what came after it held the paint.
    const from = Math.max(paintAt - phases.renderDelay, mounted && !isImage ? mounted.atMs : -Infinity);
    // After a long task the paint's time is its frame's start, which can come before the mount it painted.
    const busy = paintAt > from && busyBetween(rec, from, paintAt);
    if (busy)
      out.push({
        weight: paintAt - from,
        text: `${Math.round(paintAt - from)}ms from ${isImage ? 'the image arriving' : 'the mount'} to the paint: ${busy} ran in between`,
      });
  }
  if (lcp.font) out.push({ weight: 1, text: `the text painted after web font ${lcp.font.url} arrived at ${secs(lcp.font.ms)}` });
  if (phases.ttfb >= 800) out.push({ weight: phases.ttfb, text: `TTFB ${phases.ttfb}ms: the server's first byte` });
  return out.sort((a, b) => b.weight - a.weight).map((f) => f.text);
}

/** `LCP 2.41s: img.hero in HeroImage (src/Hero.tsx:12), /hero.jpg` */
export function lcpLine(lcp: LcpStats): string {
  return `LCP ${secs(lcp.ms)}: ${elementText(lcp.element)}${lcp.element.url ? `, ${lcp.element.url}` : ''}`;
}

/** The summary's line: the paint, and the finding for its largest part; the rest is in section lcp. */
export function lcpSummaryLine(rec: RecordingV2): string | null {
  const lcp = rec.lcp;
  if (!lcp) return null;
  const [first] = lcpFindings(rec, lcp);
  return `${lcpLine(lcp)}${first ? `; ${first}` : ''}; section lcp`;
}

/** The candidates before the final one, one line each: a skeleton or a heading that was the largest before the content. */
export const candidateLines = (lcp: LcpStats) => lcp.candidates.map((c) => `${secs(c.ms)} ${elementText(c.element)} (${c.size}px²)`);
