/** One stylesheet for the panel's shadow root, in the order the components are drawn. */
export const STYLES = `
/* Base: the page's styles do not reach in, and ours do not reach out. */
:host { all: initial; }
/* Every colour the panel uses is named here and nowhere else, so the whole look is one block to change. */
:host {
  --card: rgba(24,24,28,.97);
  --sunken: #191920;
  --field: #1b1b20;
  --raised: #1d1d22;
  --chip: #23232a;
  --chip-strong: #2b2b34;
  --badge: #26262e;
  --hover: #24242c;
  --button: #2c2c33;
  --button-hover: #3a3a44;
  --row-hover: #2a2f3a;
  --row-active: #33415c;

  --edge: #3a3a44;
  --edge-strong: #45454f;
  --rule: #2f2f38;
  --rule-soft: #23232a;
  --grid: #2a2a32;
  --box-edge: #55555f;

  --text: #e8e8ea;
  --text-strong: #fff;
  --text-2: #c9c9d1;
  --label: #b9b9c2;
  --muted: #8c8c96;
  --muted-soft: #9a9aa4;
  --faint: #85858f;
  --faint-strong: #8e8e98;

  --accent: #7fb7ff;
  --accent-soft: #9fb7ff;
  --accent-strong: #4a7dff;
  --accent-fill: #3b6fe0;
  --focus: #7aa2ff;
  --number: #ffd60a;
  --warn: #ffb02e;
  --bad: #ff8a80;
  --good: #6fdc9b;
  --context: #c3a2ff;
  --lost: #ffcc00;
  --rec: #ff6b61;
  --rec-dot: #ff453a;
  --rec-fill: #b3261e;
  --rec-edge: #d0463c;
  --mark: #8a8a96;
  /* The outline over the page, by how often the component rendered; the overlay reads these from here. */
  --flash-wasted: #969aa0;
  --flash-new: #34c759;
  --flash-often: #ffcc00;
  --flash-hot: #ff453a;
  --density: #3d3d48;
  --pick: #0a84ff;

  /* What woke a commit, on the timeline: a bar takes its colour from the cause the report names. */
  --cause-input: #37d67a;
  --cause-timer: #ffb02e;
  --cause-effect: #ff7a59;
  --cause-navigation: #59c7ff;
  --cause-store: #4aa3ff;
  --cause-query: #b487ff;
  --cause-unknown: #7c7c88;
}
* { box-sizing: border-box; }
.rpr { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.box .tag { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
/* Whatever is a name, a number or a piece of code reads in the monospace face: it is copied, compared and searched. */
code, input[type="text"], .who, .what, .n, .badge, .kind, .flag, .sel, .chain, .site, .code, .stat-name, .stat-src,
.scope, .cause-key, .way-name, .way-cause, .cause-chip, .kpi-value, .saved, .action-at, header .live, .picker li, [class^="tl-"], .tl-detail * {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
button:focus-visible, summary:focus-visible, .reason-head:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }
button { font: inherit; color: inherit; background: var(--button); border: 1px solid var(--edge-strong); border-radius: 6px; padding: 3px 8px; cursor: pointer; }
button:hover { background: var(--button-hover); }
button[hidden] { display: none; }
input[type="text"] { width: 100%; font: inherit; color: inherit; background: var(--field); border: 1px solid var(--edge); border-radius: 6px; padding: 3px 6px; }
label.toggle { display: inline-flex; align-items: center; gap: 5px; color: var(--label); cursor: pointer; }
/* The browser's checkbox is a different size and colour in every OS; this one is ours everywhere. */
input[type="checkbox"] { appearance: none; -webkit-appearance: none; position: relative; flex: none; width: 13px; height: 13px; margin: 0; border: 1px solid var(--box-edge); border-radius: 4px; background: var(--field); cursor: pointer; }
input[type="checkbox"]:hover { border-color: var(--faint-strong); }
input[type="checkbox"]:checked { border-color: var(--accent-strong); background: var(--accent-fill); }
/* The tick is placed by its own middle, so it sits in the middle of the box however big the box is. */
input[type="checkbox"]:checked::after { content: ''; position: absolute; left: 50%; top: 45%; width: 3px; height: 6px; border: solid var(--text-strong); border-width: 0 2px 2px 0; transform: translate(-50%,-50%) rotate(45deg); }
input[type="checkbox"]:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.muted { color: var(--muted); }
[data-rpr="message"] { white-space: pre-line; }
.error { color: var(--bad); white-space: pre-wrap; }
.notice { color: var(--number); white-space: pre-wrap; }

/* PanelView: the card in a corner, and the dot it collapses to. */
.rpr { position: fixed; z-index: 2147483647; font-size: 12px; line-height: 1.45; color: var(--text); }
.rpr[data-corner="bottom-left"] { left: 12px; bottom: 12px; }
.rpr[data-corner="bottom-right"] { right: 12px; bottom: 12px; }
.rpr[data-corner="top-left"] { left: 12px; top: 12px; }
.rpr[data-corner="top-right"] { right: 12px; top: 12px; }
.rpr[hidden] { display: none; }
.dot { width: 28px; height: 28px; border-radius: 50%; padding: 0; background: var(--raised); box-shadow: 0 2px 8px rgba(0,0,0,.4); color: var(--muted-soft); cursor: grab; touch-action: none; }
.dot:active, .rpr[data-dragging="true"] .dot { cursor: grabbing; }
.rpr[data-recording="true"] .dot { color: var(--rec-dot); }
.rpr:not([data-collapsed="true"]) .dot { display: none; }
.rpr[data-collapsed="true"] .card { display: none; }
/* Wherever the panel is docked, the card stays on the screen: it opens into the room beside and below or above it. */
.card { width: 420px; max-width: calc(100vw - var(--rpr-x, 12px) - 24px); max-height: min(70vh, calc(100vh - var(--rpr-y, 12px) - 24px)); overflow: auto; background: var(--card); border: 1px solid var(--edge); border-radius: 10px; padding: 8px 10px; box-shadow: 0 8px 28px rgba(0,0,0,.45); }
/* The title bar is the drag handle, so it takes the card's own padding as grab area. */
header { display: flex; align-items: center; gap: 8px; margin: -8px -10px 6px; padding: 8px 10px 2px; cursor: move; user-select: none; touch-action: none; }
/* The name, with a pulse on a chart for a mark: red and beating while a recording runs. */
.brand { display: inline-flex; align-items: center; gap: 7px; }
.brand-mark { flex: none; width: 16px; height: 16px; }
.brand-mark rect { fill: color-mix(in srgb, var(--accent-strong) 22%, transparent); stroke: color-mix(in srgb, var(--accent) 55%, transparent); }
.brand-mark path { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.brand-name { font-weight: 700; color: var(--text-strong); letter-spacing: .01em; }
.rpr[data-recording="true"] .brand-mark rect { fill: color-mix(in srgb, var(--rec-dot) 25%, transparent); stroke: color-mix(in srgb, var(--rec-dot) 60%, transparent); }
.rpr[data-recording="true"] .brand-mark path { stroke: var(--rec-dot); }
.rpr[data-recording="true"] .brand-mark { animation: rpr-beat 1.2s ease-in-out infinite; }
@keyframes rpr-beat { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .rpr[data-recording="true"] .brand-mark { animation: none; } }
/* While recording the red mark says so, and the room goes to the running numbers. */
.rpr[data-recording="true"] .brand-name { display: none; }
header .live { flex: 1; color: var(--muted-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note { flex-wrap: nowrap; }
.note input { flex: 1; }

/* Timeline: tracks over one axis — the actions, every commit, and a lane per cascade root. */
/* Nothing here is selectable: a drag off the edge would select the whole panel. */
.tl-controls, .tl-overview, .tl-tracks { user-select: none; -webkit-user-select: none; }
.tl-controls { gap: 4px; margin: 2px 0 4px; }
.tl-controls button { padding: 0 6px; line-height: 16px; }
.tl-controls .toggle { color: var(--muted); }
.tl-right { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
.tl-overview { position: relative; height: 14px; margin: 0 0 3px 90px; background: var(--sunken); border-radius: 2px; cursor: crosshair; touch-action: none; }
.tl-over-bar { position: absolute; bottom: 0; width: 1%; background: var(--density); }
.tl-brush { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--focus) 16%, transparent); border: 1px solid color-mix(in srgb, var(--focus) 55%, transparent); border-radius: 2px; pointer-events: none; }
.tl-tracks { display: flex; align-items: flex-start; gap: 4px; }
.tl-labels { flex: 0 0 86px; }
.tl-label { display: flex; align-items: center; gap: 4px; font-size: 10px; line-height: 1; color: var(--label); overflow: hidden; white-space: nowrap; }
.tl-label .tl-name { overflow: hidden; text-overflow: ellipsis; }
.tl-label .muted { margin-left: auto; font-size: 9px; }
.tl-scroll { flex: 1; overflow-x: auto; overflow-y: hidden; cursor: grab; touch-action: pan-y; }
.tl-scroll:active { cursor: grabbing; }
.tl-strip { position: relative; min-width: 100%; padding-bottom: 12px; }
.tl-grid { position: absolute; top: 0; bottom: 12px; width: 1px; background: var(--grid); }
.tl-cursor { position: absolute; top: 0; bottom: 12px; width: 1px; z-index: 3; transform: translateX(-50%); background: color-mix(in srgb, var(--text-strong) 55%, transparent); pointer-events: none; }
.tl-lane { position: relative; box-shadow: inset 0 -1px 0 var(--rule-soft); }
/* The colour is the content box and is exactly as wide as the commit; the padding around it is the part that catches the pointer. */
.tl-lane .tl-bar { position: absolute; bottom: 0; box-sizing: content-box; min-width: 2px; margin-left: -4px; padding: 0 4px; border: 0; border-radius: 1px; background-clip: content-box; cursor: pointer; }
.tl-bar:hover { filter: brightness(1.35); }
.tl-bar[data-picked="true"] { filter: brightness(1.6); }
.tl-band { position: absolute; top: 0; bottom: 12px; transform: translateX(-50%); border-radius: 2px; background: color-mix(in srgb, var(--text-strong) 9%, transparent); pointer-events: none; }
.tl-strip[data-lit="true"] .tl-bar:not([data-lit="true"]) { opacity: .25 !important; }
.tl-actions { box-shadow: inset 0 -1px 0 var(--rule); }
.tl-mark { position: absolute; top: 3px; height: 7px; min-width: 3px; padding: 0; border: 0; border-radius: 2px; background: var(--mark); cursor: pointer; }
.tl-mark:hover, .tl-mark[data-picked="true"] { background: var(--text-strong); }
.tl-axis { position: relative; height: 12px; }
.tl-tick { position: absolute; top: 1px; color: var(--faint); font-size: 9px; transform: translateX(-50%); white-space: nowrap; }
.tl-tick[data-first="true"] { transform: none; }
.tl-detail { border-top: 1px solid var(--rule); margin-top: 4px; padding-top: 4px; }
.tl-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; color: var(--text); }
.tl-causes { color: var(--muted-soft); }
.tl-root { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; margin: 3px 0; color: var(--text-2); }
.tl-root .reason { flex-basis: 100%; margin: 0 0 0 10px; }
.tl-causes { margin: 3px 0; }
.tl-row { display: grid; grid-template-columns: 52px 1fr; align-items: baseline; gap: 6px; margin: 4px 0; }
.tl-row-label { color: var(--muted); font-size: 11px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.root-chip { display: inline-flex; align-items: baseline; gap: 4px; padding: 0 6px; border-radius: 4px; background: var(--chip); font-size: 11px; }
.root-chip .n, .cause-chip .n { color: var(--number); }
.tl-link { padding: 0 2px; border: 0; background: none; color: var(--accent); cursor: pointer; }
.tl-link:hover { background: none; text-decoration: underline; }
.tl-hint { margin-top: 2px; }

/* Controls: record, the area and the highlight toggle. */
.rec { color: var(--rec); }
.stop { color: var(--text-strong); background: var(--rec-fill); border-color: var(--rec-edge); }
.scope { background: var(--chip); color: var(--text-2); max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scope[data-lost="true"] { color: var(--lost); }
button.scope:disabled { cursor: default; }

/* Controls: what runs a recording on one row, the area it is about on the next. */
.controls { gap: 6px; }
.controls .reload { color: var(--label); }
header .highlight-toggle, header .fast-toggle { flex: none; cursor: pointer; }
header .fast-toggle[hidden] { display: none; }
button.icon { padding: 3px 7px; }
/* The area is one pill: Pick, or the area's name with copy and back-to-the-whole-app beside it. */
.area-pill { display: inline-flex; align-items: stretch; min-width: 0; border: 1px solid var(--edge-strong); border-radius: 6px; background: var(--button); overflow: hidden; }
.area-pill > button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 0; border-radius: 0; background: none; }
/* The flex display above outranks the plain rule for hidden buttons; a hidden one in the pill stays hidden. */
.area-pill[hidden], .area-pill > button[hidden] { display: none; }
/* Inside the pill a ring round the button would be cut by its edge into a stray line: it goes inside instead. */
.area-pill > button:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--focus); }
.pick-icon { flex: none; width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linecap: round; }
.area-pill > button:hover:not(:disabled) { background: var(--button-hover); }
.area-pill > button + button { border-left: 1px solid var(--edge); }
.area-pill[data-scoped="true"] { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.area-pill .scope { max-width: 130px; color: var(--text-strong); }
.area-pill[data-lost="true"] .scope { color: var(--lost); }
.area-pill button:disabled { cursor: default; opacity: .7; }

/* The report: the answer first, then what to read it against, then the parts that explain it, folded. */
.verdict { margin-top: 8px; }
.memo { padding: 5px 0; border-top: 1px solid var(--rule-soft); }
.memo:first-child { border-top: 0; }
.memo-head { display: flex; align-items: baseline; gap: 6px; }
.memo-head .kind { color: var(--muted); font-size: 11px; }
.memo-head .badge { margin-left: auto; }
.memo[data-every="true"] .who { color: var(--warn); }
.memo-why { margin: 2px 0 2px; color: var(--text-2); }
.memo .chain { color: var(--muted); font-size: 11px; }
.memo .site { width: 100%; color: var(--accent); }
.memo .site .copy-text { flex: 1; }
.memo .code { margin: 3px 0 1px; padding: 2px 8px; border-radius: 4px; background: var(--sunken); color: var(--label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmp { border: 1px solid var(--rule); border-radius: 8px; background: var(--raised); padding: 6px 10px 8px; }
.cmp-head { display: flex; justify-content: space-between; padding: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.cmp-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto 54px; align-items: baseline; column-gap: 6px; padding: 4px 0; border-top: 1px solid var(--rule-soft); font-variant-numeric: tabular-nums; cursor: default; }
.cmp-head + .cmp-row { border-top: 0; }
.cmp-what { display: flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; overflow: hidden; }
.cmp-verb { flex: none; font-size: 11px; color: var(--muted); }
.cmp-target { overflow: hidden; text-overflow: ellipsis; color: var(--text-strong); font-weight: 600; }
.cmp-in { flex: none; font-size: 11px; color: var(--muted); }
.cmp-before { color: var(--muted-soft); text-align: right; }
.cmp-arrow { color: var(--faint); font-size: 11px; }
.cmp-after { color: var(--text-strong); font-weight: 700; }
.cmp-after small { margin-left: 2px; font-size: 10px; font-weight: 400; color: var(--muted); }
.cmp-change { justify-self: end; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 600; color: var(--faint); }
.cmp-change[data-tone="good"] { color: var(--good); background: color-mix(in srgb, var(--good) 14%, transparent); }
.cmp-change[data-tone="bad"] { color: var(--bad); background: color-mix(in srgb, var(--bad) 14%, transparent); }
.cmp-foot { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--rule); font-size: 11px; color: var(--muted); }
.cmp-wasted { display: flex; align-items: baseline; gap: 5px; font-variant-numeric: tabular-nums; }
.cmp-wasted b { color: var(--text-2); }
.cmp-wasted .cmp-change { margin-left: auto; }
.cmp-note { color: var(--muted); }
.result-bar .repeat { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.result-bar .repeat:hover { background: color-mix(in srgb, var(--accent) 14%, var(--button)); }
.tl-outlined { margin: 6px 0 0; font-size: 11px; color: var(--pick); }
.tl-outlined[data-found="0"] { color: var(--muted); }
.replay-bar { height: 2px; margin: -2px -10px 6px; background: var(--rule-soft); }
.replay-bar i { display: block; height: 100%; background: var(--accent); transition: width .3s ease; }
.verdict-title { margin: 10px 0 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(74px, 1fr)); gap: 4px; }
.kpi { display: flex; flex-direction: column; padding: 5px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--raised); }
.kpi-value { font-size: 15px; font-weight: 700; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.kpi-label { font-size: 10px; color: var(--muted); }
.kpi[data-tone="warn"] { border-color: color-mix(in srgb, var(--warn) 35%, transparent); }
.kpi[data-tone="warn"] .kpi-value { color: var(--warn); }
.notices { margin-top: 8px; }
details.fold { margin-top: 10px; }
details.fold > summary { display: flex; align-items: baseline; gap: 6px; list-style: none; cursor: pointer; user-select: none; }
details.fold > summary::-webkit-details-marker { display: none; }
details.fold > summary::before { content: '▸'; width: 9px; color: var(--faint); }
details.fold[open] > summary::before { content: '▾'; }
.fold-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-strong); }
.fold-note { color: var(--muted); font-size: 11px; }
.fold-body { margin-top: 4px; }
.who { font-weight: 600; color: var(--text-strong); }
.action { padding: 4px 0; border-bottom: 1px solid var(--rule-soft); }
.action:last-child { border-bottom: 0; }
.action-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; }
.action-at { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.action-what { color: var(--text); margin-right: 2px; }
.action .reason { margin-left: 10px; }
.watched { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; margin: 3px 0; }
.plugin { padding: 5px 0; border-top: 1px solid var(--rule-soft); }
.plugin:first-child { border-top: 0; }
.plugin-name { font-size: 11px; font-weight: 600; color: var(--label); margin-bottom: 2px; }
.plugin-line { display: flex; align-items: baseline; gap: 8px; padding: 1px 0 1px 8px; }
.plugin-key { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); }
.plugin-value { margin-left: auto; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; text-align: right; }
.plugin-line[data-tone="warn"] .plugin-key, .plugin-line[data-tone="warn"] .plugin-value { color: var(--warn); }
/* The causes are the legend of the tracks' colours, and each one a switch that lights up its commits. */
.causes { display: flex; flex-direction: column; gap: 1px; margin-bottom: 6px; }
.cause { display: flex; align-items: baseline; gap: 6px; width: 100%; padding: 2px 6px; border: 1px solid transparent; border-radius: 6px; background: none; text-align: left; }
.cause:hover { background: var(--hover); }
.cause[aria-pressed="true"] { border-color: var(--edge-strong); background: var(--chip); }
.cause .n { color: var(--number); min-width: 2ch; text-align: right; }
.cause-key { color: var(--text); }
.swatch { flex: none; align-self: center; width: 8px; height: 8px; border-radius: 2px; }
.cause-chip { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; border-radius: 4px; background: var(--chip); color: var(--label); font-size: 10px; }
/* Whatever is scrolled, what can be done with the report stays at the bottom of the panel. */
.result-bar { position: sticky; bottom: -8px; z-index: 4; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 12px -10px -8px; padding: 8px 10px;
  border-top: 1px solid var(--rule); background: var(--card); }
.result-bar .saved { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.rpr[data-wide="true"] .card { width: min(640px, calc(100vw - 24px)); }

/* Roots and Components: a card per component — the numbers on the head, a row per reason under it. */
.stat { margin: 3px 0; padding: 3px 6px 4px; border: 1px solid var(--rule); border-radius: 6px; background: var(--raised); }
.stat-head { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.stat-name { font-weight: 700; color: var(--text-strong); }
.stat-src { margin-left: auto; max-width: 190px; color: var(--faint-strong); }
.stat-src:hover { color: var(--text-strong); }
/* A render's way down from its root: the cause, the root and its reason, then what each parent handed on. */
.ways { margin-top: 3px; padding-top: 3px; border-top: 1px dashed var(--rule-soft); }
.way { display: flex; align-items: baseline; gap: 6px; margin: 2px 0; }
.way-n { flex: none; min-width: 26px; color: var(--number); font-size: 11px; font-variant-numeric: tabular-nums; }
.way-steps { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 0; margin: 0; padding: 0; list-style: none; min-width: 0; }
.way-steps > li { display: inline-flex; align-items: baseline; gap: 4px; min-width: 0; }
.way-steps > li + li::before { content: '›'; margin: 0 5px; color: var(--faint); }
.way-cause { color: var(--muted); font-size: 11px; }
.way-name { color: var(--text-strong); }
.way-why { color: var(--muted); font-size: 11px; }
.way-step[data-equal="true"] .way-why { color: var(--warn); }
.way-step[data-skipped="true"] .way-name { color: var(--faint); }
.badge { padding: 0 5px; border-radius: 8px; background: var(--badge); color: var(--label); font-size: 10px; }
.badge[data-tone="count"] { color: var(--number); }
.badge[data-tone="warn"] { background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); }
/* A reason: how many renders it took, what kind it is, and what changed — the rest opens under it. */
.reason { margin-top: 3px; }
.reason-head { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
button.reason-head { width: 100%; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: left; }
.reason-head[data-clickable="true"] { cursor: pointer; }
.reason-head[data-clickable="true"]:hover { border-radius: 4px; background: var(--hover); }
.reason-head[data-clickable="true"]:hover .tw { color: var(--text-strong); }
.reason .tw { flex: none; width: 8px; color: var(--faint); }
.reason .n { color: var(--number); }
.kind { padding: 0 5px; border-radius: 4px; font-size: 10px; background: var(--chip-strong); color: var(--label); }
.kind[data-kind="store"] { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
.kind[data-kind="state"] { background: color-mix(in srgb, var(--number) 14%, transparent); color: var(--number); }
.kind[data-kind="context"] { background: color-mix(in srgb, var(--context) 16%, transparent); color: var(--context); }
.kind[data-kind="props"] { background: color-mix(in srgb, var(--good) 14%, transparent); color: var(--good); }
.what { color: var(--text); word-break: break-word; }
.flag { padding: 0 5px; border-radius: 4px; font-size: 10px; background: color-mix(in srgb, var(--bad) 16%, transparent); color: var(--bad); }
.reason-body { margin: 2px 0 4px 12px; padding-left: 6px; border-left: 1px solid var(--rule); }
.reason-body .sel { color: var(--text-2); word-break: break-all; }
.reason-body .chain { color: var(--accent-soft); word-break: break-word; }
/* A line that copies what it says: the text, and at its right an icon that shows on hover and ticks when it worked. */
.copy-line { display: flex; align-items: baseline; gap: 6px; min-width: 0; padding: 0; border: 0; background: none; text-align: left; }
.copy-line:hover { background: none; }
.copy-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy-line:hover .copy-text { text-decoration: underline; }
.copy-mark { flex: none; visibility: hidden; color: var(--muted); font-size: 11px; }
.copy-line:hover .copy-mark, .copy-line:focus-visible .copy-mark, .copy-line[data-copied="true"] .copy-mark { visibility: visible; }
.copy-line[data-copied="true"] .copy-mark { color: var(--good); }
.reason-body .site { width: 100%; color: var(--accent); }
.reason-body .site .copy-text { flex: 1; }
.reason-body .code { margin: 3px 0 1px 8px; padding: 2px 8px; border-radius: 4px; background: var(--sunken); color: var(--label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* A warning of the recording: it colours every number above it, so it is drawn to be read first. */
.notice-card { display: flex; align-items: flex-start; gap: 6px; margin: 3px 0; padding: 4px 6px; border: 1px solid color-mix(in srgb, var(--number) 32%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--number) 8%, transparent); color: var(--number); }
.notice-card[data-tone="bad"] { border-color: color-mix(in srgb, var(--bad) 36%, transparent); background: color-mix(in srgb, var(--bad) 10%, transparent); color: var(--bad); }
.notice-icon { flex: none; width: 13px; height: 13px; margin-top: 1px; border: 1px solid currentColor; border-radius: 50%; font-size: 9px; line-height: 11px; text-align: center; font-weight: 700; }
.notice-head { font-weight: 700; }
.notice-text { color: var(--label); }

/* The components being followed, and the roots leading while a recording runs. */
.watch { gap: 4px; }
.chip { padding: 1px 6px; border-radius: 10px; background: var(--chip); color: var(--text-2); }
.chip:disabled { cursor: default; opacity: .7; }
.live-roots { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; }
/* Three rows are kept from the first commit on: a root appearing must not shift the buttons under the pointer. */
.rpr[data-recording="true"] .live-roots { min-height: 62px; }
.live-root { display: flex; align-items: center; gap: 4px; height: 18px; overflow: hidden; white-space: nowrap; }
.live-root .what { overflow: hidden; text-overflow: ellipsis; }
.live-empty { align-self: center; margin: auto 0; color: var(--faint); font-size: 11px; }

/* Tree: the components around the area. */
.picker ul { list-style: none; margin: 4px 0; padding: 0; height: 280px; overflow: auto; user-select: none; }
/* Rows grow with their content and the list scrolls sideways: deep nesting must not eat the name or the file. */
.picker li { width: max-content; min-width: 100%; min-height: 20px; padding: 2px 6px; border-radius: 4px; cursor: pointer; display: flex; gap: 4px; align-items: center; }
.picker li:hover { background: var(--row-hover); }
.picker li[data-active="true"] { background: var(--row-active); }
.picker li[data-wrapper="true"] { color: var(--muted); }
.picker li.whole-app .name { font-family: system-ui, sans-serif; font-weight: 600; }
.picker li .toggle { width: 12px; flex: none; color: var(--muted-soft); text-align: center; }
.picker li .toggle:hover { color: var(--text-strong); }
.picker li .name { flex: none; white-space: nowrap; }
.picker li .src { flex: none; color: var(--muted); margin-left: auto; padding-left: 8px; white-space: nowrap; }
/* The row's own buttons show on hover and on the active row, so the list stays quiet. */
.picker li .copy, .picker li .watch-toggle { flex: none; margin-left: 8px; padding: 1px 4px; border-radius: 4px; font-size: 14px; line-height: 16px; color: var(--muted); visibility: hidden; }
.picker li .watch-toggle { padding-right: 2px; }
.picker li .copy { margin-left: -4px; padding-left: 2px; }
.picker li .watch-toggle[data-on="true"] { visibility: visible; color: var(--number); }
.picker li:hover .copy, .picker li[data-active="true"] .copy,
.picker li:hover .watch-toggle, .picker li[data-active="true"] .watch-toggle { visibility: visible; }
.picker li .copy:hover, .picker li .watch-toggle:hover { color: var(--text-strong); background: var(--button-hover); }
.picker li .copy[data-copied="true"] { visibility: visible; color: var(--good); }
button[data-copied="true"] { color: var(--good); }

/* The outline the picker draws over the page. */
.box { position: fixed; pointer-events: none; border: 2px solid var(--pick); background: color-mix(in srgb, var(--pick) 8%, transparent); z-index: 2147483646; border-radius: 3px; }
.box .tag { position: absolute; left: -2px; top: -18px; background: var(--pick); color: var(--text-strong); padding: 0 5px; border-radius: 3px 3px 0 0; font-size: 11px; white-space: nowrap; }
`;
