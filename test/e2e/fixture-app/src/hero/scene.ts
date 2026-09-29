import { STYLES } from '../../../../../src/ui/styles';
import board from './board.webp';
import panel from './panel.json';

/**
 * The hero: the real panel's markup, captured step by step on Orbit (capture.mjs), laid over a picture of the board
 * and played on one CSS timeline. It runs in an iframe of 1280×800 or 640×800, so the panel's own stylesheet — its
 * vh sizes, its fixed position — works as it does on a page of that size.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

/** The loop, in seconds. */
const T = 28;
const EASE = 'cubic-bezier(.45,0,.25,1)';

let keyframes = '';
let serial = 0;
const pct = (t: number) => `${((Math.min(Math.max(t, 0), T) / T) * 100).toFixed(3)}%`;

/** An animation over the whole loop from [time, declarations] stops; the first and last hold to the loop's ends. */
function track(stops: Array<[number, string]>, ease = EASE): string {
  const name = `k${serial++}`;
  const all: Array<[number, string]> = [[0, stops[0][1]], ...stops, [T, stops[stops.length - 1][1]]];
  keyframes += `@keyframes ${name}{${all.map(([t, d]) => `${pct(t)}{${d}}`).join('')}}\n`;
  return `animation:${name} ${T}s ${ease} infinite;`;
}

/** Shown over the given spans of the loop, with short fades: a switch of the panel reads as one, not as a dissolve. */
function during(spans: Array<[number, number]>, fade = 0.06, shown = 'opacity:1', hidden = 'opacity:0'): string {
  const stops: Array<[number, string]> = [];
  for (const [from, to] of spans) {
    if (from > 0) stops.push([from - fade, hidden]);
    stops.push([from, shown], [to, shown]);
    if (to < T) stops.push([to + fade, hidden]);
  }
  if (stops[0][0] > 0) stops.unshift([0, hidden]);
  return track(stops, 'linear');
}

/** A short pulse at `at`: a button pressed, a counter that moved. */
const pulse = (at: number, peak: string, rest: string, length = 0.3) =>
  track(
    [
      [at - 0.01, rest],
      [at + length * 0.35, peak],
      [at + length, rest],
    ],
    'ease-out'
  );

/** Adds a style to the first element whose markup contains `marker`. */
const styled = (html: string, marker: string, style: string) => {
  const at = html.indexOf(marker);
  if (at < 0) return html;
  const end = html.indexOf('>', at);
  return `${html.slice(0, end)} style="${style}"${html.slice(end)}`;
};

/** The panel's mobile rules are for a phone's screen, not for this picture of a desktop page shown on one. */
function withoutTouchRules(css: string): string {
  let out = css;
  for (const condition of ['@media (pointer: coarse)', '@media (max-width: 600px)']) {
    const start = out.indexOf(condition);
    if (start < 0) continue;
    let depth = 0;
    let i = out.indexOf('{', start);
    for (; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}' && --depth === 0) break;
    }
    out = out.slice(0, start) + out.slice(i + 1);
  }
  return out.replace(/:host/g, '.host');
}

// ---- When things happen, in seconds of the loop.
const at = {
  pick: 1.45,
  hoverCard: 2.75,
  card: 3.45,
  hoverRow: 4.9,
  row: 6.05,
  rec: 7.35,
  stop: 17.3,
  dismiss: 26.95,
};
const REC_FROM = 7.45;
const FRAME = 0.5;
const REPORT = 17.4;
const IDLE_AGAIN = 27.05;

const {
  board: page,
  clicks,
  html,
  rec,
  report,
} = panel as {
  board: { target: Rect; column: Rect; cards: Rect[] };
  clicks: Record<'pick' | 'card' | 'row' | 'rec' | 'stop' | 'dismiss', Point>;
  html: Record<'idle' | 'browsing' | 'child' | 'hoverParent' | 'parent' | 'report', string>;
  rec: string[];
  report: { card: Rect; scrollable: number; verdict: number; memo: number; causes: number };
};

// ---- The panel, one snapshot a step.
const press = (at: number) => pulse(at, 'transform:scale(.9);filter:brightness(1.5)', 'transform:none;filter:none', 0.28);

function panelSteps(): string {
  const steps: Array<{ html: string; spans: Array<[number, number]> }> = [];
  steps.push({
    html: styled(html.idle, 'data-rpr="pick"', press(at.pick)),
    spans: [
      [0, at.pick + 0.1],
      [IDLE_AGAIN, T],
    ],
  });
  steps.push({
    html: styled(html.browsing, 'data-rpr="picker"', pulse(at.pick + 0.1, 'opacity:.4', 'opacity:1', 0.3)),
    spans: [[at.pick + 0.1, at.card + 0.1]],
  });
  steps.push({ html: html.child, spans: [[at.card + 0.1, at.hoverRow]] });
  steps.push({ html: styled(html.hoverParent, 'data-name="BoardColumn"', press(at.row)), spans: [[at.hoverRow, at.row + 0.1]] });
  steps.push({ html: styled(html.parent, 'data-rpr="record"', press(at.rec)), spans: [[at.row + 0.1, REC_FROM]] });

  // The recording as it was, a snapshot every half second; a count that moved pops, a new cascade root slides in.
  let before = new Map<string, string>();
  rec.forEach((frame, i) => {
    const from = REC_FROM + i * FRAME;
    const to = i === rec.length - 1 ? REPORT : from + FRAME;
    let out = frame;
    const now = new Map([...frame.matchAll(/class="who">([^<]*)<\/span><span class="badge" data-tone="count">([^<]*)/g)].map((m) => [m[1], m[2]]));
    for (const [name, count] of now) {
      const row = `<div class="live-root"><span class="who">${name}</span>`;
      if (!before.has(name))
        out = out.replace(
          row,
          `<div class="live-root" style="${track([
            [from - 0.01, 'opacity:0;transform:translateX(-8px)'],
            [from + 0.3, 'opacity:1;transform:none'],
          ])}"><span class="who">${name}</span>`
        );
      else if (before.get(name) !== count)
        out = out.replace(
          `${row}<span class="badge" data-tone="count">`,
          `${row}<span class="badge" data-tone="count" style="display:inline-block;${pulse(
            from,
            'transform:scale(1.35);filter:brightness(1.6)',
            'transform:none;filter:none',
            0.4
          )}">`
        );
    }
    before = now;
    if (i === rec.length - 1) out = styled(out, 'data-rpr="stop"', press(at.stop));
    steps.push({ html: out, spans: [[from, to]] });
  });

  // The report: it comes in, then scrolls to what the tour shows. A margin, not a transform, so the sticky bar stays.
  const scroll = (y: number) => `margin-top:${-8 - y}px`;
  // Down to the other roots and the timeline, and no further than the card scrolls.
  const down = Math.min(report.memo - 70, report.scrollable);
  let out = styled(
    html.report,
    'data-rpr="result"',
    track([
      [REPORT, 'opacity:0;transform:translateY(8px)'],
      [REPORT + 0.35, 'opacity:1;transform:none'],
    ])
  );
  out = out.replace(
    '<div class="card"><header>',
    `<div class="card"><header style="${track([
      [REPORT, scroll(0)],
      [21.4, scroll(0)],
      [22.2, scroll(down)],
      [IDLE_AGAIN, scroll(down)],
      [IDLE_AGAIN + 0.01, scroll(0)],
    ])}">`
  );
  out = out.replace('<button type="button">Dismiss</button>', `<button type="button" style="${press(at.dismiss)}">Dismiss</button>`);
  steps.push({ html: out, spans: [[REPORT, IDLE_AGAIN]] });

  return steps.map((s, i) => `<div class="step${i === steps.length - 1 ? ' last' : ''}" style="${during(s.spans, 0.03)}">${s.html}</div>`).join('');
}

// ---- The outlines the recorder draws over the page while it records.
const LIT = 0.32;
const FADE = 0.42;
const COLOURS = { wasted: '150,150,160', fresh: '52,199,89', often: '255,204,0', hot: '255,69,58' };

function flashes(): string {
  const events: Array<{ at: number; rect: Rect; name: string; wasted: boolean }> = [];
  let before = new Map<string, number>();
  let hit = 0;
  rec.forEach((frame, i) => {
    const now = new Map(
      [...frame.matchAll(/class="who">([^<]*)<\/span><span class="badge" data-tone="count">×(\d+)/g)].map((m) => [m[1], Number(m[2])])
    );
    const perHit = (name: string) => Number(new RegExp(`class="who">${name}</span>.*?>(\\d+)/hit<`).exec(frame)?.[1] ?? 1);
    const when = Math.max(REC_FROM + 0.05, REC_FROM + i * FRAME - 0.22);
    for (const [name, count] of now) {
      const added = count - (before.get(name) ?? 0);
      for (let k = 0; k < added; k++) {
        const t = when + k * 0.12;
        if (name === 'IssueCard') {
          // A presence update renders a few cards; the one whose viewers changed draws new DOM, the others nothing.
          const n = Math.min(perHit(name), page.cards.length);
          for (let j = 0; j < n; j++) events.push({ at: t, rect: page.cards[(hit * 2 + j * 2) % page.cards.length], name, wasted: j > 0 });
          hit++;
        } else events.push({ at: t, rect: page.column, name, wasted: false });
      }
    }
    before = now;
  });
  // ×N counts a streak of renders of one element, as the recorder's overlay does.
  const last = new Map<Rect, { at: number; n: number }>();
  return events
    .map(({ at: t, rect, name, wasted }) => {
      const prev = last.get(rect);
      const n = prev && t - prev.at < LIT + FADE ? prev.n + 1 : 1;
      last.set(rect, { at: t, n });
      const rgb = wasted ? COLOURS.wasted : n < 3 ? COLOURS.fresh : n < 10 ? COLOURS.often : COLOURS.hot;
      const anim = track(
        [
          [t - 0.01, 'opacity:0'],
          [t, 'opacity:1'],
          [t + LIT, 'opacity:1'],
          [t + LIT + FADE, 'opacity:0'],
        ],
        'linear'
      );
      return `<div class="flash" style="left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;--c:${rgb};${anim}"><b>${name} ×${n}</b></div>`;
    })
    .join('');
}

// ---- The picker's box: on the card under the cursor, then over the column when the tree's row is hovered.
function pickBox(): string {
  const box = (r: Rect) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
  const { target, column } = page;
  const style = track([
    [at.hoverCard - 0.01, `${box(target)};opacity:0;transform:scale(1.04)`],
    [at.hoverCard + 0.18, `${box(target)};opacity:1;transform:none`],
    [at.hoverRow + 0.05, `${box(target)};opacity:1;transform:none`],
    [at.hoverRow + 0.45, `${box(column)};opacity:1;transform:none`],
    [at.row + 0.1, `${box(column)};opacity:1;transform:none`],
    [at.row + 0.25, `${box(column)};opacity:0;transform:none`],
  ]);
  const tag = (name: string, spans: Array<[number, number]>) => `<span class="tag" style="${during(spans, 0.01)}">${name}</span>`;
  return `<div class="box pick" style="${style}">${tag('Tooltip', [[0, at.hoverRow + 0.15]])}${tag('BoardColumn', [[at.hoverRow + 0.15, T]])}</div>`;
}

// ---- The cursor and the rings its clicks leave.
function cursor(): string {
  const rest: Point = { x: 1010, y: 560 };
  const aside: Point = { x: 560, y: 430 };
  const away: Point = { x: 1040, y: 470 };
  const move: Array<[number, Point]> = [
    [0.4, rest],
    [1.3, clicks.pick],
    [1.9, clicks.pick],
    [2.75, clicks.card],
    [4.0, clicks.card],
    [4.9, clicks.row],
    [6.5, clicks.row],
    [7.2, clicks.rec],
    [7.9, clicks.rec],
    [8.9, aside],
    [15.8, aside],
    [16.9, clicks.stop],
    [17.7, clicks.stop],
    [18.6, away],
    [25.9, away],
    [26.8, clicks.dismiss],
    [27.3, clicks.dismiss],
    [28, rest],
  ];
  const style = track(move.map(([t, p]) => [t, `transform:translate(${p.x}px,${p.y}px)`]));
  const downs = Object.values(at);
  const squash = track(
    downs.flatMap(
      (t): Array<[number, string]> => [
        [t - 0.08, 'transform:none'],
        [t, 'transform:scale(.8)'],
        [t + 0.14, 'transform:none'],
      ]
    )
  );
  const rings = (Object.keys(at) as Array<keyof typeof at>)
    .filter((k) => k !== 'hoverCard' && k !== 'hoverRow')
    .map((k) => {
      const p = clicks[k as keyof typeof clicks];
      return `<i class="ring" style="left:${p.x}px;top:${p.y}px;${track(
        [
          [at[k] - 0.01, 'opacity:0;transform:scale(.3)'],
          [at[k], 'opacity:1;transform:scale(.3)'],
          [at[k] + 0.5, 'opacity:0;transform:scale(1.6)'],
        ],
        'ease-out'
      )}"></i>`;
    })
    .join('');
  return `${rings}<div class="cursor" style="${style}"><svg style="${squash}" width="22" height="26" viewBox="0 0 22 26"><path d="M2 1.5v19.2l5-4.6 3.3 7.6 3.5-1.5-3.2-7.4h6.9z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg></div>`;
}

// ---- The camera: the whole page while picking, a little closer while recording, into the panel for the report.
function camera(stops: Array<[number, number, number, number]>) {
  return track(stops.map(([t, s, x, y]) => [t, `transform:scale(${s}) translate(${-x}px,${-y}px)`]));
}

export function sceneDocument(): string {
  keyframes = '';
  serial = 0;
  const steps = panelSteps();
  const outlines = flashes();
  const box = pickBox();
  const pointer = cursor();
  const view = report.card.y + report.card.h;
  const wide = camera([
    [7.5, 1, 0, 0],
    [8.4, 1.12, 0, 86],
    [17.5, 1.12, 0, 86],
    [18.4, 1.5, 0, view - 533],
    [25.1, 1.5, 0, view - 533],
    [25.9, 1, 0, 0],
  ]);
  const narrow = camera([
    [1.5, 1.25, 0, 160],
    [2.2, 1.25, 420, 60],
    [3.8, 1.25, 420, 60],
    [4.4, 1.25, 0, 160],
    [7.5, 1.25, 0, 160],
    [8.2, 1.25, 420, 60],
    [11.4, 1.25, 420, 60],
    [12.1, 1.25, 0, 160],
    [17.5, 1.25, 0, 160],
    [18.4, 1.45, 0, view - 552],
    [25.1, 1.45, 0, view - 552],
    [25.9, 1.25, 0, 160],
  ]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${withoutTouchRules(STYLES)}
html, body { margin: 0; height: 100%; overflow: hidden; background: #0f0f13; }
.cam { position: absolute; left: 0; top: 0; width: 1280px; height: 800px; transform-origin: 0 0; ${wide} }
@media (max-width: 900px) { .cam { ${narrow} } }
.bg { position: absolute; inset: 0; background: url("${board}") 0 0 / 1280px 800px no-repeat; }
.step { opacity: 0; }
.step.last { opacity: 1; }
.picker li[data-hover="true"] { background: var(--row-hover); }
.picker li[data-hover="true"] .copy, .picker li[data-hover="true"] .watch-toggle { visibility: visible; }
.box.pick { opacity: 0; transform-origin: 50% 50%; }
.flash { position: absolute; opacity: 0; box-shadow: inset 0 0 0 1.5px rgb(var(--c)); pointer-events: none; z-index: 2147483645; }
.flash b { position: absolute; left: 0; top: -14px; height: 14px; padding: 0 3px; background: rgba(var(--c), .9); color: #000;
  font: 400 11px/14px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.cursor { position: absolute; left: -2px; top: -2px; z-index: 2147483647; filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); transform: translate(1010px, 560px); }
.cursor svg { display: block; transform-origin: 3px 3px; }
.ring { position: absolute; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 2px solid rgba(10,132,255,.9);
  background: rgba(10,132,255,.15); opacity: 0; z-index: 2147483647; pointer-events: none; }
${keyframes}
/* Without motion: the report, as it is left at the end of a recording. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; }
  .cursor, .ring { display: none; }
}
</style></head><body><div class="cam"><div class="bg"></div>${outlines}<div class="host">${box}${steps}</div>${pointer}</div></body></html>`;
}
