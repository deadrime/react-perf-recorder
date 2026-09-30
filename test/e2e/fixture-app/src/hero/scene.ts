import { STYLES } from '../../../../../src/ui/styles';
import board from './board.webp';
import panel from './panel.json';
import pinned from './pinned.webp';
import { NARROW, NARROW_QUERY, WIDE } from './size';

/**
 * The hero: the real panel's markup, captured step by step on Orbit (capture.mjs), laid over a picture of the board
 * and played on one CSS timeline. It runs in an iframe (size.ts), so the landing's styles cannot reach in and the
 * panel's own stylesheet works as it does on the page it was captured on.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

/** The loop, in seconds. */
const T = 43;
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
  memo: 26.6,
  memoClose: 30.3,
  bar: 35.6,
  dismiss: 41.6,
};
const REC_FROM = 7.45;
const FRAME = 0.5;
const REPORT = 17.4;
/** The camera leaves the panel for the page, where the picked commit's components are outlined. */
const PAGE_AGAIN = 36.8;
const IDLE_AGAIN = at.dismiss + 0.1;

type Layout = Record<'kpis' | 'rendered' | 'memos' | 'memosSummary' | 'others' | 'timeline' | 'tracks', Rect> & {
  card: Rect;
  scrollable: number;
  bar: Rect | null;
  detail: Rect | null;
};

const {
  view: { width: W, height: H },
  board: page,
  clicks: captured,
  html,
  rec,
  report,
} = panel as {
  view: { width: number; height: number };
  board: { target: Rect; column: Rect; cards: Rect[] };
  clicks: Record<'pick' | 'card' | 'row' | 'rec' | 'stop' | 'dismiss', Point>;
  html: Record<'idle' | 'browsing' | 'child' | 'hoverParent' | 'parent' | 'report' | 'reportMemos' | 'reportCommit', string>;
  rec: string[];
  report: { plain: Layout; memos: Layout; commit: Layout };
};

// ---- The report's tour: how far its card is scrolled at each stop, and what the ring shows.
const card = report.plain.card;
const scrolls = {
  memos: Math.min(report.memos.scrollable, report.memos.memos.y - 50),
  others: Math.min(report.plain.scrollable, report.plain.others.y - 60),
  timeline: Math.min(report.plain.scrollable, report.plain.tracks.y - 90),
  commit: Math.min(report.commit.scrollable, report.commit.tracks.y - 20),
};
/** Where a part of the report is on the page with the card scrolled by `scroll`, cut to the card's visible part. */
const onPage = (r: Rect, scroll: number): Rect => {
  const top = Math.max(card.y + r.y - scroll, card.y + 4);
  const bottom = Math.min(card.y + r.y - scroll + r.h, card.y + card.h - 46);
  return { x: r.x - 5, y: top - 5, w: r.w + 10, h: Math.max(0, bottom - top) + 10 };
};
const barOf = report.commit.bar ?? { x: 116, y: report.plain.tracks.y + 58, w: 3, h: 13 };
const clicks: Record<Exclude<keyof typeof at, 'hoverCard' | 'hoverRow'>, Point> = {
  ...captured,
  memo: { x: 96, y: card.y + report.plain.memosSummary.y + 8 },
  memoClose: { x: 96, y: card.y + report.memos.memosSummary.y + 8 - scrolls.memos },
  bar: { x: barOf.x + 1, y: card.y + barOf.y + 6 - scrolls.timeline },
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
  const scrolled = track([
    [REPORT, scroll(0)],
    [26.9, scroll(0)],
    [27.6, scroll(scrolls.memos)],
    [at.memoClose + 0.2, scroll(scrolls.memos)],
    [at.memoClose + 0.7, scroll(scrolls.others)],
    [34.0, scroll(scrolls.others)],
    [34.7, scroll(scrolls.timeline)],
    [at.bar + 0.3, scroll(scrolls.timeline)],
    [at.bar + 0.9, scroll(scrolls.commit)],
    [IDLE_AGAIN, scroll(scrolls.commit)],
    [IDLE_AGAIN + 0.01, scroll(0)],
  ]);
  const reportStep = (markup: string) => markup.replace('<div class="card"><header>', `<div class="card"><header style="${scrolled}">`);
  const plain = reportStep(
    styled(
      html.report,
      'data-rpr="result"',
      track([
        [REPORT, 'opacity:0;transform:translateY(8px)'],
        [REPORT + 0.35, 'opacity:1;transform:none'],
      ])
    )
  );
  steps.push({
    html: plain,
    spans: [
      [REPORT, at.memo + 0.05],
      [at.memoClose + 0.05, at.bar + 0.05],
    ],
  });
  steps.push({ html: reportStep(html.reportMemos), spans: [[at.memo + 0.05, at.memoClose + 0.05]] });
  const commit = reportStep(html.reportCommit).replace(
    '<button type="button">Dismiss</button>',
    `<button type="button" style="${press(at.dismiss)}">Dismiss</button>`
  );
  steps.push({ html: commit, spans: [[at.bar + 0.05, IDLE_AGAIN]] });

  return steps.map((s) => `<div class="step${s.html === plain ? ' still' : ''}" style="${during(s.spans, 0.03)}">${s.html}</div>`).join('');
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

// ---- A ring over the part of the report the caption is about.
function spotlight(): string {
  const box = (r: Rect) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
  const { plain, memos, commit } = report;
  const stops: Array<[number, Rect, number]> = [
    [18.0, onPage(plain.kpis, 0), 1],
    [21.4, onPage(plain.kpis, 0), 1],
    [21.9, onPage(plain.rendered, 0), 1],
    [26.0, onPage(plain.rendered, 0), 1],
    [26.3, onPage(plain.memosSummary, 0), 1],
    [26.9, onPage(memos.memos, 0), 1],
    [27.6, onPage(memos.memos, scrolls.memos), 1],
    [30.1, onPage(memos.memos, scrolls.memos), 1],
    [30.3, onPage(memos.memos, scrolls.memos), 0],
    [30.8, onPage(plain.others, scrolls.others), 0],
    [31.0, onPage(plain.others, scrolls.others), 1],
    [34.0, onPage(plain.others, scrolls.others), 1],
    [34.7, onPage(plain.tracks, scrolls.timeline), 1],
    [at.bar + 0.3, onPage(plain.tracks, scrolls.timeline), 1],
    [at.bar + 0.9, onPage(commit.detail ?? commit.tracks, scrolls.commit), 1],
    [PAGE_AGAIN + 0.6, onPage(commit.detail ?? commit.tracks, scrolls.commit), 1],
    [PAGE_AGAIN + 1.0, onPage(commit.detail ?? commit.tracks, scrolls.commit), 0],
  ];
  const style = track([
    [REPORT + 0.3, `${box(stops[0][1])};opacity:0`],
    ...stops.map(([t, r, o]): [number, string] => [t, `${box(r)};opacity:${o}`]),
  ]);
  return `<div class="spot" style="${style}"></div>`;
}

// ---- What each step shows, in a line or two: the loop is the tool's first introduction.
const CAPTIONS: Array<{ from: number; to: number; step: string; title: string; text: string }> = [
  { from: 0, to: 3.5, step: '1 of 3 · Pick', title: 'Pick an area', text: 'Hover the page: the box shows the component a click takes.' },
  {
    from: 3.5,
    to: 7.3,
    step: '1 of 3 · Pick',
    title: 'Move up the tree',
    text: 'The tree opens on the pick. One row up, BoardColumn takes the whole column.',
  },
  {
    from: 7.3,
    to: 17.35,
    step: '2 of 3 · Record',
    title: 'Use the app, then Stop',
    text: 'Outlines mark every render on the page; the panel names the component that started each cascade.',
  },
  {
    from: 17.35,
    to: 21.4,
    step: '3 of 3 · Report',
    title: 'What the recording caught',
    text: 'Commits in the area, renders, and the wasted ones: renders that changed nothing on the page.',
  },
  {
    from: 21.4,
    to: 26.0,
    step: '3 of 3 · Report',
    title: 'Why it rendered',
    text: 'The store hook behind IssueCard, its selector, and the line to change.',
  },
  {
    from: 26.0,
    to: 30.6,
    step: '3 of 3 · Report',
    title: 'Memos that miss',
    text: 'useMemo and useCallback that never reuse their value, and what makes them start over.',
  },
  { from: 30.6, to: 34.0, step: '3 of 3 · Report', title: 'Other roots', text: 'Every other cascade in the area, each with its own cause.' },
  {
    from: 34.0,
    to: at.bar + 0.1,
    step: '3 of 3 · Report',
    title: 'Timeline',
    text: 'Every commit and what woke it: a worker message, a presence update, a heartbeat.',
  },
  {
    from: at.bar + 0.1,
    to: IDLE_AGAIN,
    step: '3 of 3 · Report',
    title: 'Where it renders',
    text: 'Pick a commit: every component it rendered is outlined on the page.',
  },
];

function captions(): string {
  return CAPTIONS.map(({ from, to, step, title, text }, i) => {
    // The first one comes back as the loop ends, so the strip is never empty.
    const spans: Array<[number, number]> =
      i === 0
        ? [
            [from, to],
            [IDLE_AGAIN + 0.2, T],
          ]
        : [[from, to]];
    const shown = during(spans, 0.2, 'opacity:1;transform:none', 'opacity:0;transform:translateY(4px)');
    const progress = track(
      [
        [from, 'transform:scaleX(0)'],
        [to, 'transform:scaleX(1)'],
        [to + 0.01, 'transform:scaleX(0)'],
      ],
      'linear'
    );
    // Without motion the report stands still, and so does its caption.
    const still = i === 3 ? ' still' : '';
    return `<div class="caption${still}" style="${shown}"><small>${step}</small><p><b>${title}.</b> ${text}</p><i style="${progress}"></i></div>`;
  }).join('');
}

// ---- The cursor and the rings its clicks leave.
function cursor(): string {
  const rest: Point = { x: W * 0.8, y: H * 0.7 };
  const aside: Point = { x: W * 0.45, y: H * 0.5 };
  // Off the panel, out of the camera's frame while it reads the report.
  const away: Point = { x: W - 50, y: H * 0.4 };
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
    [25.8, away],
    [26.45, clicks.memo],
    [26.9, clicks.memo],
    [27.6, { x: clicks.memo.x, y: clicks.memo.y - scrolls.memos }],
    [29.7, clicks.memoClose],
    [30.3, clicks.memoClose],
    [31.2, away],
    [34.8, away],
    [35.45, clicks.bar],
    [35.9, clicks.bar],
    [36.5, { x: clicks.bar.x, y: clicks.bar.y - (scrolls.commit - scrolls.timeline) }],
    [37.6, aside],
    [40.6, aside],
    [41.45, clicks.dismiss],
    [42.2, clicks.dismiss],
    [T, rest],
  ];
  const style = track(move.map(([t, p]) => [t, `transform:translate(${p.x}px,${p.y}px)`]));
  const downs = Object.values(at).filter((t) => t !== at.hoverCard && t !== at.hoverRow);
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
  const ring = spotlight();
  const strip = captions();
  const pins = during([[at.bar + 0.05, IDLE_AGAIN]], 0.15);
  const zoom = 1.4;
  const wide = camera([
    [3.5, 1, 0, 0],
    [4.1, 1.15, 0, H - H / 1.15],
    [7.4, 1.15, 0, H - H / 1.15],
    [8.0, 1, 0, 0],
    [17.5, 1, 0, 0],
    [18.4, zoom, 0, H - WIDE.stage / zoom],
    [PAGE_AGAIN, zoom, 0, H - WIDE.stage / zoom],
    [PAGE_AGAIN + 0.8, 1, 0, 0],
  ]);
  // A phone's window is narrower than the board: the camera goes where the action is.
  const low = H - NARROW.stage;
  const right = W - NARROW.width;
  const narrow = camera([
    [1.5, 1, 0, low],
    [2.2, 1, right, 0],
    [3.8, 1, right, 0],
    [4.4, 1, 0, low],
    [7.5, 1, 0, low],
    [8.2, 1, right, 0],
    [11.4, 1, right, 0],
    [12.1, 1, 0, low],
    [17.5, 1, 0, low],
    [18.4, 1.1, 0, H - NARROW.stage / 1.1],
    [PAGE_AGAIN, 1.1, 0, H - NARROW.stage / 1.1],
    [PAGE_AGAIN + 0.8, 1, 0, low],
  ]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${withoutTouchRules(STYLES)}
html, body { margin: 0; overflow: hidden; background: #0f0f13; }
/* The card's height as captured: the iframe is taller than the page was, by the caption strip. */
.card { max-height: ${card.h}px; max-width: none; }
.stage { position: relative; height: ${WIDE.stage}px; overflow: hidden; }
/* A transform even at rest: it is what keeps the panel's fixed position inside the scene. */
.cam { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 0 0; transform: scale(1); ${wide} }
.bg { position: absolute; inset: 0; background: url("${board}") 0 0 / ${W}px ${H}px no-repeat; }
.step { opacity: 0; }
.step.still { opacity: 1; }
.picker li[data-hover="true"] { background: var(--row-hover); }
.picker li[data-hover="true"] .copy, .picker li[data-hover="true"] .watch-toggle { visibility: visible; }
.box.pick { opacity: 0; transform-origin: 50% 50%; }
.flash { position: absolute; opacity: 0; box-shadow: inset 0 0 0 1.5px rgb(var(--c)); pointer-events: none; z-index: 2147483645; }
.flash b { position: absolute; left: 0; top: -14px; height: 14px; padding: 0 3px; background: rgba(var(--c), .9); color: #000;
  font: 400 11px/14px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.cursor { position: absolute; left: -2px; top: -2px; z-index: 2147483647; filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); transform: translate(${
    W * 0.8
  }px, ${H * 0.7}px); }
.cursor svg { display: block; transform-origin: 3px 3px; }
.pins { position: absolute; inset: 0; opacity: 0; background: url("${pinned}") 0 0 / ${W}px ${H}px no-repeat; pointer-events: none; }
.spot { position: absolute; opacity: 0; border: 2px solid #4aa8ff; border-radius: 9px; z-index: 2147483647; pointer-events: none;
  box-shadow: 0 0 0 4px rgba(10,132,255,.22), 0 0 30px rgba(10,132,255,.35); }
.ring { position: absolute; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 2px solid rgba(10,132,255,.9);
  background: rgba(10,132,255,.15); opacity: 0; z-index: 2147483647; pointer-events: none; }
.captions { position: relative; height: ${WIDE.caption}px; border-top: 1px solid #2a2a32; background: #141419; }
.caption { position: absolute; inset: 0; padding: 16px 22px 0; opacity: 0; color: #b9b9c2;
  font: 16.5px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.caption small { display: block; margin-bottom: 6px; color: #4aa8ff; font: 600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .08em; text-transform: uppercase; }
.caption p { margin: 0; }
.caption b { color: #fff; font-weight: 700; }
.caption i { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: #4aa8ff; transform-origin: 0 50%; transform: scaleX(0); }
.caption.still { opacity: 1; }
@media ${NARROW_QUERY} {
  .stage { height: ${NARROW.stage}px; }
  .cam { transform: translate(0, ${-low}px); ${narrow} }
  .captions { height: ${NARROW.caption}px; }
  .caption { padding: 16px 20px 0; font-size: 20px; }
  .caption small { font-size: 14px; margin-bottom: 8px; }
}
${keyframes}
/* Without motion: the report, as it is left at the end of a recording. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; }
  .cursor, .ring, .spot, .caption i { display: none; }
}
</style></head><body><div class="stage"><div class="cam"><div class="bg"></div>${outlines}<div class="pins" style="${pins}"></div><div class="host">${box}${steps}</div>${ring}${pointer}</div></div><div class="captions">${strip}</div></body></html>`;
}
