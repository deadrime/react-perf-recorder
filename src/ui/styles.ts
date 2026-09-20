/** One stylesheet for the panel's shadow root, in the order the components are drawn. */
export const STYLES = `
/* Base: the page's styles do not reach in, and ours do not reach out. */
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
button { font: inherit; color: inherit; background: #2c2c33; border: 1px solid #45454f; border-radius: 6px; padding: 3px 8px; cursor: pointer; }
button:hover { background: #3a3a44; }
button[hidden] { display: none; }
input[type="text"] { width: 100%; font: inherit; color: inherit; background: #1b1b20; border: 1px solid #3a3a44; border-radius: 6px; padding: 3px 6px; }
label.toggle { display: inline-flex; align-items: center; gap: 4px; color: #b9b9c2; cursor: pointer; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.muted { color: #8c8c96; }
.error { color: #ff8a80; white-space: pre-wrap; }
.notice { color: #ffd60a; white-space: pre-wrap; }

/* PanelView: the card in a corner, and the dot it collapses to. */
.rpr { position: fixed; z-index: 2147483647; font-size: 11px; line-height: 1.45; color: #e8e8ea; }
.rpr[data-corner="bottom-left"] { left: 12px; bottom: 12px; }
.rpr[data-corner="bottom-right"] { right: 12px; bottom: 12px; }
.rpr[data-corner="top-left"] { left: 12px; top: 12px; }
.rpr[data-corner="top-right"] { right: 12px; top: 12px; }
.rpr[hidden] { display: none; }
.dot { width: 28px; height: 28px; border-radius: 50%; padding: 0; background: #1d1d22; box-shadow: 0 2px 8px rgba(0,0,0,.4); color: #9a9aa4; }
.rpr[data-recording="true"] .dot { color: #ff453a; }
.rpr:not([data-collapsed="true"]) .dot { display: none; }
.rpr[data-collapsed="true"] .card { display: none; }
.card { width: 420px; max-height: 70vh; overflow: auto; background: rgba(24,24,28,.97); border: 1px solid #3a3a44; border-radius: 10px; padding: 8px 10px; box-shadow: 0 8px 28px rgba(0,0,0,.45); }
header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; cursor: move; user-select: none; }
header .title { font-weight: 700; color: #fff; }
header .live { flex: 1; color: #9a9aa4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note { flex-wrap: nowrap; }
.note input { flex: 1; }

/* Controls: record, the area and the highlight toggle. */
.rec { color: #ff6b61; }
.stop { color: #fff; background: #b3261e; border-color: #d0463c; }
.scope { background: #23232a; color: #c9c9d1; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scope[data-lost="true"] { color: #ffcc00; }
button.scope:disabled { cursor: default; }

/* Text: one line of a report, used by the live roots and by the summary. */
.section { margin-top: 8px; }
.section h4 { margin: 0 0 3px; font-size: 11px; color: #fff; font-weight: 700; }
.line { margin: 2px 0; white-space: pre-wrap; word-break: break-word; }
.line .n { color: #ffd60a; }
.line .why { color: #9fb7ff; }
.line button { padding: 0 6px; margin-left: 4px; }

/* The components being followed, and the roots leading while a recording runs. */
.watch { gap: 4px; }
.chip { padding: 1px 6px; border-radius: 10px; background: #23232a; color: #c9c9d1; }
.chip:disabled { cursor: default; opacity: .7; }
.live-roots { margin: 4px 0; }
.live-roots .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Tree: the components around the area. */
.picker ul { list-style: none; margin: 4px 0; padding: 0; max-height: 280px; overflow: auto; }
/* Rows grow with their content and the list scrolls sideways: deep nesting must not eat the name or the file. */
.picker li { width: max-content; min-width: 100%; padding: 2px 6px; border-radius: 4px; cursor: pointer; display: flex; gap: 4px; align-items: baseline; }
.picker li:hover { background: #2a2f3a; }
.picker li[data-active="true"] { background: #33415c; }
.picker li[data-wrapper="true"] { color: #8c8c96; }
.picker li .toggle { width: 12px; flex: none; color: #9a9aa4; text-align: center; }
.picker li .toggle:hover { color: #fff; }
.picker li .name { flex: none; white-space: nowrap; }
.picker li .src { flex: none; color: #8c8c96; margin-left: auto; padding-left: 8px; white-space: nowrap; }
/* The row's own buttons show on hover and on the active row, so the list stays quiet. */
.picker li .copy, .picker li .watch-toggle { flex: none; color: #8c8c96; visibility: hidden; }
.picker li .watch-toggle[data-on="true"] { visibility: visible; color: #ffd60a; }
.picker li:hover .copy, .picker li[data-active="true"] .copy,
.picker li:hover .watch-toggle, .picker li[data-active="true"] .watch-toggle { visibility: visible; }
.picker li .copy:hover, .picker li .watch-toggle:hover { color: #fff; }

/* The outline the picker draws over the page. */
.box { position: fixed; pointer-events: none; border: 2px solid #0a84ff; background: rgba(10,132,255,.08); z-index: 2147483646; border-radius: 3px; }
.box .tag { position: absolute; left: -2px; top: -18px; background: #0a84ff; color: #fff; padding: 0 5px; border-radius: 3px 3px 0 0; font-size: 11px; white-space: nowrap; }
`;
