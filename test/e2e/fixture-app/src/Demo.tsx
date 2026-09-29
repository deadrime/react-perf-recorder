import { useState, type CSSProperties, type ReactNode } from 'react';
import { href, useNoPanel } from './base';
import { ADVANCED } from './advanced';
import { BASICS } from './basics';
import { BUGS, SCENARIOS, enabledBugs, isBlindCase } from './bugs';
import { PanelDemo } from './PanelDemo';

/**
 * The fixture doubles as the demo: every seeded bug is a card that opens the app with that bug on, says what to do
 * and what the recording should name. The app itself stays unstyled on purpose — the point is what it renders, not
 * how it looks — so all the styling lives here.
 */
export const REPO = 'https://github.com/deadrime/react-perf-recorder';
const NPM = 'https://www.npmjs.com/package/react-perf-recorder';
const SITE = 'https://zhenya.dev/';
const INSTALL = 'npm i -D -E react-perf-recorder';

// The docs take `body` and the `.demo` base from here too; everything else is the front page's own.
export const DEMO_STYLES = `
body { margin: 0; background: #131317; }
/* The hero's glow reaches past the column; the page never scrolls sideways for it. */
.landing { overflow-x: clip; }
.demo { --line: #2c2c35; --card: #1b1b21; --muted: #a3a3ad; --blue: #0a84ff; --yellow: #ffd60a;
  --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  position: relative; max-width: 1140px; margin: 0 auto; padding: 0 24px 40px; color: #e8e8ea; font: 15px/1.6 var(--sans); }
.demo h1, .demo h2, .demo h3 { color: #fff; }
.demo p { margin: 0 0 10px; color: var(--muted); }
.demo code { font-family: var(--mono); font-size: .92em; color: var(--yellow); }
.demo a { color: inherit; }
.demo kbd { padding: 1px 6px; border: 1px solid #3a3a44; border-bottom-width: 2px; border-radius: 5px; background: #202027;
  font: 12px var(--mono); color: #e8e8ea; white-space: nowrap; }

.demo .top { display: flex; align-items: center; gap: 20px; padding: 18px 0; }
.demo .brand { display: flex; align-items: center; gap: 9px; margin-right: auto; font: 600 15px var(--mono); color: #fff; text-decoration: none; }
.demo .mark { width: 22px; height: 22px; fill: rgba(10,132,255,.16); stroke: var(--blue); stroke-width: 1.3; stroke-linecap: round;
  stroke-linejoin: round; }
.demo .top nav { display: flex; gap: 4px; }
.demo .top nav a { padding: 6px 12px; border-radius: 8px; color: var(--muted); font-size: 14px; text-decoration: none; }
.demo .top nav a:hover { color: #fff; background: rgba(255,255,255,.06); }

.demo .hero { position: relative; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: 56px; align-items: center;
  padding: 56px 0 96px; }
.demo .hero::before { content: ''; position: absolute; inset: -80px -200px auto 30%; height: 640px; z-index: -1; pointer-events: none;
  background: radial-gradient(closest-side, rgba(10,132,255,.20), transparent), radial-gradient(closest-side at 80% 70%, rgba(191,90,242,.14), transparent); }
.demo .eyebrow { display: inline-flex; flex-wrap: wrap; gap: 6px; margin: 0 0 18px; }
.demo .eyebrow span { padding: 3px 10px; border: 1px solid var(--line); border-radius: 99px; background: rgba(255,255,255,.03);
  font-size: 12.5px; color: #cfcfd6; }
.demo .hero h1 { margin: 0 0 18px; font-size: clamp(36px, 5vw, 58px); text-wrap: balance; line-height: 1.04; letter-spacing: -.035em; font-weight: 750; }
.demo .hero h1 em { font-style: normal; background: linear-gradient(90deg, #4aa8ff, #bf5af2); -webkit-background-clip: text; background-clip: text;
  color: transparent; }
.demo .hero .lead { max-width: 56ch; margin-bottom: 26px; font-size: 17.5px; line-height: 1.6; color: #c4c4cc; }
.demo .install { display: flex; align-items: center; gap: 10px; max-width: 460px; margin-bottom: 18px; padding: 6px 6px 6px 16px;
  border: 1px solid var(--line); border-radius: 12px; background: #0f0f13; }
.demo .install code { flex: 1; min-width: 0; overflow-x: auto; color: #e8e8ea; font-size: 14px; white-space: nowrap; scrollbar-width: none; }
.demo .install code::before { content: '$ '; color: #6d6d78; }
.demo .install button { flex: none; padding: 7px 12px; border: 1px solid #3a3a44; border-radius: 8px; background: #202027; color: #e8e8ea;
  font: 13px var(--sans); cursor: pointer; }
.demo .install button:hover { border-color: var(--blue); }
.demo .links { display: flex; flex-wrap: wrap; gap: 10px; }
.demo .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border: 1px solid #3a3a44; border-radius: 10px;
  color: #e8e8ea; font-weight: 600; font-size: 14.5px; text-decoration: none; transition: border-color .15s, background .15s; }
.demo .btn:hover { border-color: #5a5a66; background: rgba(255,255,255,.04); }
.demo .btn.primary { border-color: var(--blue); background: var(--blue); color: #fff; box-shadow: 0 6px 24px rgba(10,132,255,.3); }
.demo .btn.primary:hover { background: #2891ff; }
.demo .btn svg { width: 16px; height: 16px; fill: currentColor; }
.demo .fine { margin: 18px 0 0; font-size: 13.5px; color: #85858f; }

.demo .shot { position: relative; margin: 0; justify-self: center; width: 100%; max-width: 420px; }
.demo .shot > a { display: block; text-decoration: none; }
.demo .shot figcaption { margin-top: 10px; text-align: center; font-size: 13px; color: #85858f; }
.demo .shot figcaption a { color: #4aa8ff; text-decoration: none; }

/*
 * The hero's flow, scripted rather than screenshotted, on one 22s loop: pick a child then its parent from the real
 * component tree, watch a real-looking recording bar tick, then a quick tour of the report. Nothing is cropped and
 * nothing sits at an angle, because none of it is an image — every element shares one linear 22s timeline, and each
 * handoff is a quick blink (not a slow dissolve) so no two overlapping labels are ever both half-visible at once.
 * See PanelDemo.tsx for the markup this styles.
 */
@property --num { syntax: '<integer>'; inherits: false; initial-value: 0; }

.pd-stage { --pd-warn: #ffd60a; --pd-red: #ff453a; --pd-green: #34c759; --pd-amber: #ffcc00; --pd-hot: #ff453a; --pd-pick: #0a84ff;
  position: relative; height: 532px; overflow: hidden; border: 1px solid #3a3a44; border-radius: 14px; background: #101014;
  box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 6px rgba(255,255,255,.025); font: 13px/1.4 var(--sans); color: #e8e8ea; }
.pd-layer { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 16px; }

/* Scenes 1+2: an Orbit board column renders behind a dock that picks (tree) then records it. */
.pd-page-layer { padding-bottom: 315px; animation: pdPageLayer 22s linear infinite; }
.pd-orbit { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding-top: 4px; }
.pd-orbit-col { position: relative; width: 100%; max-width: 220px; padding: 10px; border: 1px solid #3a3a44; border-radius: 10px;
  background: #1a1a1f; display: flex; flex-direction: column; gap: 6px; }
.pd-orbit-head { display: flex; align-items: center; gap: 6px; padding-bottom: 6px; border-bottom: 1px solid #29292f;
  font-size: 12px; font-weight: 600; }
.pd-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--pd-green); }
.pd-muted { color: var(--muted); font-weight: 400; }
.pd-pts { margin-left: auto; }
.pd-orbit-card { padding: 7px 9px; border: 1px solid #3a3a44; border-radius: 8px; background: #1f1f27; display: flex; flex-direction: column; gap: 5px; }
.pd-orbit-card .pd-card-top { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; }
.pd-card-title { margin: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  font-size: 11px; line-height: 1.3; color: #e8e8ea; }
.pd-card-bottom { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.pd-chip-mini { padding: 1px 5px; border-radius: 5px; background: rgba(255,255,255,.06); color: #b9b9c2; font-size: 9px; }
.pd-chip-mini--warn { background: rgba(255,214,10,.16); color: var(--pd-warn); }
.pd-avatar { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: #3b6fe0; color: #fff;
  font-size: 8px; font-weight: 700; }
.pd-orbit-card-wrap { position: relative; }

.pd-pickbox { position: absolute; border: 2px solid var(--pd-pick); border-radius: 8px; pointer-events: none;
  background: color-mix(in srgb, var(--pd-pick) 8%, transparent); opacity: 0; }
.pd-pickbox--child { inset: -4px; animation: pdPickChild 22s linear infinite; }
.pd-pickbox--parent { inset: -4px; animation: pdPickParent 22s linear infinite; }
.pd-picktag { position: absolute; left: -2px; top: -18px; background: var(--pd-pick); color: #fff; padding: 0 5px; border-radius: 3px 3px 0 0;
  font: 11px var(--mono); white-space: nowrap; }

.pd-cursor { position: absolute; z-index: 5; width: 18px; height: 18px; fill: #fff; pointer-events: none;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); animation: pdCursor 22s linear infinite; }

.pd-dock { position: absolute; left: 0; right: 0; bottom: 0; height: 287px; max-width: 260px; margin: 0 auto; }
.pd-dock-mode { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 10px; border: 1px solid #3a3a44;
  border-radius: 10px; background: #17171c; box-shadow: 0 10px 30px rgba(0,0,0,.4); overflow: hidden; opacity: 0; }
.pd-mode-idle { justify-content: center; gap: 10px; animation: pdModeIdle 22s linear infinite; }
.pd-mode-tree { animation: pdModeTree 22s linear infinite; }
.pd-mode-record { animation: pdModeRecord 22s linear infinite; }
.pd-dock-head { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; }
.pd-dock-head .mark { width: 14px; height: 14px; }
.pd-dock-buttons { display: flex; gap: 6px; }
.pd-pulse-pick { animation: pdPickPulse 22s linear infinite; }

/* Scene 1 (tree): the picked area's name, the tree itself, and the Cancel/Confirm row underneath it. */
.pd-tree-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.pd-pick-icon-lg { width: 13px; height: 13px; fill: none; stroke: var(--pd-pick); stroke-width: 1.2; stroke-linecap: round; }
.pd-tree-area { position: relative; flex: 1; min-width: 0; height: 15px; font-size: 12px; }
.pd-tree-area-child, .pd-tree-area-parent { position: absolute; left: 0; top: 0; white-space: nowrap; opacity: 0; }
.pd-tree-area-child { animation: pdAreaChild 22s linear infinite; }
.pd-tree-area-parent { animation: pdAreaParent 22s linear infinite; }
.pd-icon-btn { display: grid; place-items: center; width: 16px; height: 16px; font-style: normal; color: var(--muted); font-size: 11px; }
.pd-tree-actions { display: flex; gap: 6px; margin-bottom: 6px; }
.pd-tree-filters { display: flex; gap: 10px; margin-bottom: 5px; font-size: 10px; color: var(--muted); }
.pd-tree-filters label { display: flex; align-items: center; gap: 3px; }
.pd-tree-filters input { width: 9px; height: 9px; }
.pd-tree-rows { display: flex; flex-direction: column; overflow: hidden; }
.pd-tree-row { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; padding: 1px 4px; border-radius: 4px;
  font-size: 9.5px; line-height: 1.3; color: #cfcfd6; }
.pd-tree-bold { color: #fff; font-weight: 600; }
.pd-tree-loc { flex: none; color: #6d6d78; font: 8.5px var(--mono); }
.pd-depth-0 { padding-left: 0; } .pd-depth-1 { padding-left: 7px; } .pd-depth-2 { padding-left: 14px; } .pd-depth-3 { padding-left: 21px; }
.pd-depth-4 { padding-left: 28px; } .pd-depth-5 { padding-left: 35px; } .pd-depth-6 { padding-left: 42px; }
.pd-row-tooltip { animation: pdRowTooltip 22s linear infinite; }
.pd-row-boardcolumn { animation: pdRowBoardcolumn 22s linear infinite; }
.pd-tree-hint, .pd-tree-keys { margin: 2px 0 0; font-size: 8.5px; color: #6d6d78; }

/* Scene 2 (record): the compact bar a real recording shows, ticking. */
.pd-rec-top { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; font-size: 10.5px; }
.pd-rec-time { flex: none; color: #fff; }
.pd-rec-top .pd-muted { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pd-mini-toggle { flex: none; margin-left: auto; display: flex; align-items: center; gap: 3px; font-size: 10px; color: var(--muted); }
.pd-mini-toggle input { width: 10px; height: 10px; }
.pd-rec-list { flex: 1; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.pd-rec-row { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 6px 8px; border: 1px solid #3a3a44; border-radius: 7px;
  background: #1a1a1f; font-size: 10.5px; color: #cfcfd6; opacity: 0; transform: translateY(4px); }
.pd-rec-row-1 { animation: pdRecRow1 22s linear infinite; }
.pd-rec-row-2 { animation: pdRecRow2 22s linear infinite; }
.pd-rec-bottom { margin-top: 8px; display: flex; gap: 6px; }

.pd-orbit-card-wrap .pd-orbit-card { animation: pdCardFlash 22s linear infinite; }

/* Scene 3: the report, its stats counted, its cause found. */
.pd-report-layer { opacity: 0; animation: pdReportLayer 22s linear infinite; }
.pd-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-weight: 600; }
.pd-head .mark { width: 16px; height: 16px; margin-right: 6px; vertical-align: -3px; }
.pd-opts { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--muted); font-weight: 400; }
.pd-opts label { display: flex; align-items: center; gap: 4px; }
.pd-opts input { width: 11px; height: 11px; }
.pd-collapse { flex: none; display: grid; place-items: center; width: 18px; height: 18px; border: 1px solid #3a3a44; border-radius: 5px; font-style: normal; }

.pd-buttons { display: flex; gap: 6px; margin-bottom: 12px; }
.pd-b { display: flex; align-items: center; gap: 5px; padding: 6px 10px; border: 1px solid #3a3a44; border-radius: 8px;
  font-size: 12px; font-weight: 600; background: #1d1d22; color: #e8e8ea; white-space: nowrap; }
.pd-rec-b { color: var(--pd-red); }
.pd-stop-b { color: #fff; background: #b3261e; border-color: #d0463c; animation: pdStopFlash 22s linear infinite; }
.pd-confirm-b { color: #fff; background: #3b6fe0; border-color: #4a7dff; animation: pdConfirmFlash 22s linear infinite; }
.pd-area-b { margin-left: auto; }
.pd-pick-icon, .pd-dock-mode .pd-pick-icon { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linecap: round; }

.pd-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 14px; }
.pd-stat { padding: 8px 4px 8px 10px; border: 1px solid #3a3a44; border-radius: 8px; background: #1a1a1f; }
.pd-stat b { display: block; font-size: 17px; font-weight: 700; }
.pd-stat span { font-size: 10.5px; color: var(--muted); }
.pd-stat--warn { border-color: rgba(255, 214, 10, .4); }
.pd-stat--warn b { color: var(--pd-warn); }
.pd-num { counter-reset: pdnum var(--num); }
.pd-num::before { content: counter(pdnum); }
.pd-stat .pd-num { animation: pdCountReport 22s linear infinite; }
.pd-rec-time .pd-num, .pd-rec-top .pd-num { animation: pdCountRec 22s linear infinite; }

.pd-kicker { margin: 0 0 6px; font: 700 10px var(--mono); letter-spacing: .06em; color: #8a8a94; text-transform: uppercase; }
.pd-card { padding: 10px; margin: 0 0 10px; border: 1px solid #3a3a44; border-radius: 10px; background: #1a1a1f; }
.pd-card--main { animation: pdHighlight 22s linear infinite; }
.pd-report-layer .pd-card-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px; }
.pd-chip { color: var(--muted); font-size: 11px; }
.pd-warn-chip { padding: 1px 6px; border-radius: 5px; background: rgba(255, 214, 10, .16); color: var(--pd-warn); font-size: 11px; }
.pd-loc { margin: 3px 0 6px; text-align: right; font: 11px var(--mono); color: #8a8a94; }
.pd-reason { margin: 0; font-size: 11.5px; color: #9c9ca6; animation: pdReason 22s linear infinite; }
.pd-tag { padding: 1px 6px; border-radius: 5px; background: rgba(10, 132, 255, .16); color: #4aa8ff; }
.pd-indent { display: block; margin-top: 2px; padding-left: 14px; color: #67b7ff; font: 11px var(--mono); }

.pd-reveal-otherroots { animation: pdRevealA 22s linear infinite; }
.pd-timeline { margin-bottom: 8px; animation: pdRevealB 22s linear infinite; }
.pd-tl-row { display: flex; gap: 6px; padding: 6px 0; font-size: 11.5px; line-height: 1.5; color: #b9b9c2; }
.pd-tl-dot { flex: none; width: 8px; height: 8px; margin-top: 3px; border-radius: 2px; background: var(--pd-warn); }

.pd-zoom { display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid #29292f; font-size: 11px; color: var(--muted);
  animation: pdRevealC 22s linear infinite; }
.pd-zoom label { display: flex; align-items: center; gap: 4px; margin-left: auto; }

/* Scene 1 (idle, 0–6%): the dock shows Rec / Page load / Pick, Pick pulses; the cursor is still hidden. */
@keyframes pdModeIdle { 0%, 5% { opacity: 1; } 7%, 100% { opacity: 0; } }
@keyframes pdPickPulse { 0%, 2% { box-shadow: none; } 4% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--pd-pick) 35%, transparent); } 6%, 100% { box-shadow: none; } }
/* The cursor: appears by the Pick button, moves onto the child card, then down to the BoardColumn tree row, then to Confirm — then hides until the loop repeats. */
@keyframes pdCursor {
  0%, 5% { opacity: 0; left: 158px; top: 208px; }
  7% { opacity: 1; left: 158px; top: 208px; }
  12%, 18% { opacity: 1; left: 128px; top: 108px; }
  21%, 27% { opacity: 1; left: 70px; top: 198px; }
  29% { opacity: 1; left: 150px; top: 172px; }
  31%, 100% { opacity: 0; left: 150px; top: 172px; }
}
/* Scene 1 (tree, 8–30%): the tree opens, a child is picked, then its parent — box, tag, row and area name all crossfade together. */
@keyframes pdModeTree { 0%, 6% { opacity: 0; } 8%, 29% { opacity: 1; } 31%, 100% { opacity: 0; } }
@keyframes pdPickChild { 0%, 8% { opacity: 0; } 10%, 19% { opacity: 1; } 21%, 100% { opacity: 0; } }
@keyframes pdAreaChild { 0%, 8% { opacity: 0; } 10%, 19% { opacity: 1; } 21%, 100% { opacity: 0; } }
@keyframes pdRowTooltip { 0%, 9% { background: transparent; } 11%, 20% { background: rgba(10,132,255,.16); } 22%, 100% { background: transparent; } }
@keyframes pdPickParent { 0%, 21% { opacity: 0; } 23%, 30% { opacity: 1; } 32%, 100% { opacity: 0; } }
@keyframes pdAreaParent { 0%, 21% { opacity: 0; } 23%, 30% { opacity: 1; } 32%, 100% { opacity: 0; } }
@keyframes pdRowBoardcolumn { 0%, 22% { background: transparent; } 24%, 31% { background: rgba(10,132,255,.16); } 33%, 100% { background: transparent; } }
@keyframes pdConfirmFlash { 0%, 27% { filter: none; } 29% { filter: brightness(1.4); } 31%, 100% { filter: none; } }
/* Scene 2 (record, 31–58%): the timer and commit counters tick, wasted-render rows stagger in, the card flashes like a live highlight, then Stop. */
@keyframes pdModeRecord { 0%, 30% { opacity: 0; } 32%, 58% { opacity: 1; } 60%, 100% { opacity: 0; } }
@keyframes pdCountRec { 0%, 32% { --num: 0; } 40%, 100% { --num: var(--target); } }
@keyframes pdRecRow1 { 0%, 37% { opacity: 0; transform: translateY(4px); } 40%, 55% { opacity: 1; transform: translateY(0); } 58%, 100% { opacity: 0; transform: translateY(4px); } }
@keyframes pdRecRow2 { 0%, 44% { opacity: 0; transform: translateY(4px); } 47%, 55% { opacity: 1; transform: translateY(0); } 58%, 100% { opacity: 0; transform: translateY(4px); } }
@keyframes pdCardFlash {
  0%, 33% { border-color: #3a3a44; box-shadow: none; }
  35% { border-color: var(--pd-green); box-shadow: 0 0 0 2px var(--pd-green); }
  38% { border-color: #3a3a44; box-shadow: none; }
  42% { border-color: var(--pd-green); box-shadow: 0 0 0 2px var(--pd-green); }
  46% { border-color: #3a3a44; box-shadow: none; }
  49% { border-color: var(--pd-amber); box-shadow: 0 0 0 2px var(--pd-amber); }
  52% { border-color: #3a3a44; box-shadow: none; }
  55% { border-color: var(--pd-hot); box-shadow: 0 0 0 2px var(--pd-hot); }
  58%, 100% { border-color: #3a3a44; box-shadow: none; }
}
@keyframes pdStopFlash { 0%, 54% { filter: none; } 56% { filter: brightness(1.35); } 58%, 100% { filter: none; } }
/* Scenes 1+2 give way to scene 3: the page fades out, the report fades in over it. */
@keyframes pdPageLayer { 0%, 56% { opacity: 1; } 61%, 97% { opacity: 0; } 100% { opacity: 1; } }
@keyframes pdReportLayer { 0%, 58% { opacity: 0; } 63%, 95% { opacity: 1; } 100% { opacity: 0; } }
/* Scene 3 (63–95%): a quick tour — stats count up, the wasted-render card lights up and gives its reason, then other roots, the timeline and the zoom row reveal in turn. */
@keyframes pdCountReport { 0%, 64% { --num: 0; } 70%, 100% { --num: var(--target); } }
@keyframes pdHighlight {
  0%, 71% { border-color: #3a3a44; box-shadow: none; background: #1a1a1f; }
  76% { border-color: var(--pd-warn); box-shadow: 0 0 0 3px rgba(255, 214, 10, .16); background: #22200f; }
  82%, 100% { border-color: #3a3a44; box-shadow: none; background: #1a1a1f; }
}
@keyframes pdReason { 0%, 73% { opacity: 0; transform: translateY(4px); } 80%, 100% { opacity: 1; transform: translateY(0); } }
@keyframes pdRevealA { 0%, 79% { opacity: 0; transform: translateY(6px); } 84%, 100% { opacity: 1; transform: translateY(0); } }
@keyframes pdRevealB { 0%, 83% { opacity: 0; transform: translateY(6px); } 88%, 100% { opacity: 1; transform: translateY(0); } }
@keyframes pdRevealC { 0%, 87% { opacity: 0; transform: translateY(6px); } 92%, 100% { opacity: 1; transform: translateY(0); } }

/* A still "after" frame instead of a loop: the report only, counted, and left there. */
@media (prefers-reduced-motion: reduce) {
  .pd-page-layer { display: none; }
  .pd-report-layer, .pd-stat .pd-num, .pd-card--main, .pd-reason, .pd-reveal-otherroots, .pd-timeline, .pd-zoom {
    animation: none !important;
  }
  .pd-report-layer { opacity: 1; }
  .pd-stat .pd-num { --num: var(--target); }
  .pd-reason, .pd-reveal-otherroots, .pd-timeline, .pd-zoom { opacity: 1; transform: none; }
}


.demo .section { margin: 0 0 96px; scroll-margin-top: 16px; }
.demo .kicker { margin: 0 0 8px; font: 600 12.5px var(--mono); text-transform: uppercase; letter-spacing: .08em; color: #4aa8ff; }
.demo .section > h2 { margin: 0 0 12px; font-size: clamp(26px, 3.2vw, 36px); line-height: 1.15; letter-spacing: -.025em; }
.demo .section > p { max-width: 72ch; font-size: 16px; }
.demo .section > p + .grid, .demo .section > p + .steps { margin-top: 28px; }

.demo .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.demo .feature { padding: 22px; border: 1px solid var(--line); border-radius: 14px; background: var(--card); }
.demo .feature i { display: grid; place-items: center; width: 38px; height: 38px; margin-bottom: 14px; border-radius: 10px;
  background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); }
.demo .feature i svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.demo .feature h3 { margin: 0 0 6px; font-size: 16.5px; }
.demo .feature p { margin: 0; font-size: 14.5px; }
.demo .feature .chip { display: inline-block; margin-top: 12px; padding: 2px 8px; border-radius: 6px;
  background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--c); font: 12px var(--mono); }

.demo .steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none;
  counter-reset: step; }
.demo .steps > li { position: relative; display: flex; flex-direction: column; min-width: 0; padding: 22px; border: 1px solid var(--line);
  border-radius: 14px; background: var(--card); counter-increment: step; }
.demo .steps > li::before { content: counter(step); display: grid; place-items: center; width: 28px; height: 28px; margin-bottom: 14px;
  border-radius: 50%; background: rgba(10,132,255,.16); color: #4aa8ff; font: 600 13px var(--mono); }
.demo .steps h3 { margin: 0 0 6px; font-size: 16.5px; }
.demo .steps p { font-size: 14.5px; }
.demo pre { margin: auto 0 0; padding: 12px 14px; overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: #0f0f13;
  color: #e8e8ea; font: 12.5px/1.6 var(--mono); }
.demo pre .c { color: #6d6d78; }
.demo pre .k { color: #ff7ab2; }
.demo pre .s { color: #fc9e5b; }
.demo pre .f { color: #67b7ff; }
.demo .agent { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; align-items: center; margin-top: 14px; padding: 26px;
  border: 1px solid rgba(191,90,242,.35); border-radius: 14px;
  background: linear-gradient(120deg, rgba(191,90,242,.12), rgba(10,132,255,.06) 60%), var(--card); }
.demo .agent h3 { margin: 0 0 6px; font-size: 18px; }
.demo .agent p { margin: 0; font-size: 14.5px; }
.demo .agent pre { margin: 0; }
.demo .stores { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 18px; font-size: 14px; color: var(--muted); }
.demo .stores a { padding: 3px 10px; border: 1px solid var(--line); border-radius: 99px; color: #e8e8ea; font: 13px var(--mono); text-decoration: none; }
.demo .stores a:hover { border-color: var(--blue); }

.demo .how { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 24px; margin: 22px 0 22px; padding: 0; list-style: none; }
.demo .how li { font-size: 14.5px; color: var(--muted); }
.demo .how b { color: #fff; font-weight: 600; }
.demo .sandbox { display: flex; align-items: center; gap: 16px; margin: 0 0 40px; padding: 18px 20px; border: 1px solid rgba(10,132,255,.5);
  border-radius: 14px; background: linear-gradient(100deg, rgba(10,132,255,.16), rgba(10,132,255,.04)); text-decoration: none;
  transition: background .15s; }
.demo .sandbox:hover { background: linear-gradient(100deg, rgba(10,132,255,.24), rgba(10,132,255,.08)); }
.demo .sandbox b { display: block; color: #fff; font-size: 16px; }
.demo .sandbox span { color: #c4c4cc; font-size: 14.5px; }
.demo .sandbox .go { margin-left: auto; color: #4aa8ff; font-size: 22px; }
.demo .sandboxes { display: grid; gap: 12px; margin: 0 0 40px; }
.demo .sandboxes .sandbox { margin: 0; }
.demo .group { display: flex; align-items: baseline; gap: 12px; margin: 0 0 6px; }
.demo .group h3 { margin: 0; font-size: 19px; }
.demo .group small { color: #85858f; font: 13px var(--mono); }
.demo .group + p { max-width: 72ch; margin-bottom: 18px; font-size: 14.5px; }
.demo .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 12px; margin-bottom: 44px;
  counter-reset: card; }
.demo .card { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 16px 18px 16px; border: 1px solid var(--line);
  border-radius: 12px; background: var(--card); color: inherit; text-decoration: none; counter-increment: card;
  transition: border-color .15s, transform .15s, background .15s; }
.demo .card::before { content: counter(card, decimal-leading-zero); font: 12px var(--mono); color: #6d6d78; }
.demo .card::after { content: '→'; position: absolute; top: 14px; right: 16px; color: #4aa8ff; opacity: 0; transition: opacity .15s, transform .15s; }
.demo .card:hover { border-color: rgba(10,132,255,.6); background: #1f1f27; transform: translateY(-2px); }
.demo .card:hover::after { opacity: 1; transform: translateX(3px); }
.demo .card h2 { margin: 0; padding-right: 18px; font-size: 15.5px; line-height: 1.35; }
.demo .card .what { margin: 0; font-size: 14px; line-height: 1.5; }

.demo .foot { padding: 36px 0 0; border-top: 1px solid var(--line); font-size: 14px; color: #85858f; }
.demo .foot a { color: var(--muted); text-decoration: none; }
.demo .foot a:hover { color: #fff; }
.demo .foot .brand { color: #fff; }
.demo .foot-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 24px 48px; margin-bottom: 32px; }
.demo .foot-top p { max-width: 36ch; margin: 10px 0 0; font-size: 14px; }
.demo .foot-top nav { display: grid; grid-template-columns: repeat(2, auto); gap: 8px 40px; }
.demo .foot-bottom { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; padding: 18px 0 0;
  border-top: 1px solid var(--line); font-size: 13.5px; }
.demo .foot-bottom a { color: #cfcfd6; }
.demo .foot-bottom .site { color: #4aa8ff; }

@media (max-width: 900px) {
  .demo .hero { grid-template-columns: minmax(0, 1fr); gap: 40px; padding: 28px 0 48px; }
  .demo .grid, .demo .steps, .demo .how { grid-template-columns: minmax(0, 1fr); }
  .demo .agent { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .demo .section { margin-bottom: 72px; }
}
/* A phone: the code wraps rather than hide its ends behind a sideways scroll. */
@media (max-width: 600px) {
  .demo { padding: 0 16px 32px; }
  .demo .top { padding: 14px 0; }
  .demo .top nav .wide { display: none; }
  .demo .hero h1 { font-size: 38px; }
  .demo .hero .lead { font-size: 16.5px; }
  .demo .links .btn { flex: 1 1 auto; justify-content: center; }
  .demo pre { font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .demo .agent, .demo .feature, .demo .steps > li { padding: 18px; }
  .demo .install { padding-left: 12px; }
  .demo .install code { font-size: 13px; }
  .pd-stage { height: 512px; font-size: 12px; }
  .pd-layer { padding: 12px; }
  .pd-page-layer { padding-bottom: 267px; }
  .pd-dock { height: 265px; }
  .pd-orbit-col { max-width: 180px; }
  .pd-tree-row, .pd-tree-loc { font-size: 8.5px; }
  .pd-cursor { width: 15px; height: 15px; }
  .pd-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pd-tl-row { font-size: 11px; }
  /* One column is long on a phone: the icon and the number sit beside the title, not above it. */
  .demo .feature { display: grid; grid-template-columns: 38px minmax(0, 1fr); column-gap: 14px; align-items: center; }
  .demo .feature i { margin: 0 0 10px; }
  .demo .feature h3 { margin-bottom: 10px; }
  .demo .feature p, .demo .feature .chip { grid-column: 1 / -1; justify-self: start; }
  .demo .steps > li { padding-left: 60px; }
  .demo .steps > li::before { position: absolute; top: 16px; left: 18px; }
  .demo .sandbox { padding: 16px; }
}
`;

/** The strip sits on the app's own page, which is left unstyled on purpose: it may not touch anything but itself. */
const STRIP_STYLES = `
.strip { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; margin-bottom: 6px; padding: 3px 10px;
  background: #1d1d22; color: #b9b9c2; border-bottom: 1px solid #3a3a44;
  font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.strip a { color: #0a84ff; text-decoration: none; }
.strip b { color: #fff; }
.strip .try { color: #ffd60a; }
`;

// The panel's own mark, so the page and the panel read as one thing.
const Mark = () => (
  <svg className="mark" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="0.5" y="0.5" width="15" height="15" rx="4" />
    <path d="M2.5 9h2.5l1.5-4 2.5 7 1.5-3h3" fill="none" />
  </svg>
);

const GitHubIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const Copy = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  return (
    <button type="button" onClick={copy} aria-label={`Copy ${text}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

// Stroke icons at 24×24, one per thing the report says.
const FEATURES: { icon: ReactNode; color: string; title: string; text: string; chip: string }[] = [
  {
    icon: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />,
    color: '#0a84ff',
    title: 'The root to fix',
    text: 'The component that started each render cascade, with its reason and the hook chain down to the line of code.',
    chip: 'state #0 · useOverdueByClock › useSecond',
  },
  {
    icon: <path d="M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v6M15 18l3 3 3-3M3 6l3-3 3 3" />,
    color: '#bf5af2',
    title: 'The way a render came down',
    text: 'From the cause through each parent to the component, with the props each one handed on — and where a memo would stop it.',
    chip: 'CardWithClock › Item · props equal',
  },
  {
    icon: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    color: '#ff9f0a',
    title: 'Wasted renders',
    text: 'Renders after which nothing in the DOM changed, and remounts: the work React did for nothing, counted per component.',
    chip: '4 for nothing',
  },
  {
    icon: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
    color: '#ffd60a',
    title: 'What caused the commit',
    text: 'The store action and the keys it changed, the query, timer, socket message or click behind every commit.',
    chip: 'zustand:clockStore.setState',
  },
  {
    icon: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    color: '#30d158',
    title: 'A timeline',
    text: 'Actions and commits on one track. Pick a commit to see its cascade as a tree and its components outlined on the page.',
    chip: 'core:input click · 9 renders',
  },
  {
    icon: <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" />,
    color: '#64d2ff',
    title: 'Before → after',
    text: 'Repeat reloads the page and does the same actions again, so a fix is measured, not guessed. Memos that miss show up too.',
    chip: '↻ Repeat',
  },
];

const Feature = ({ icon, color, title, text, chip }: (typeof FEATURES)[number]) => (
  <div className="feature" style={{ '--c': color } as CSSProperties}>
    <i>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {icon}
      </svg>
    </i>
    <h3>{title}</h3>
    <p>{text}</p>
    <span className="chip">{chip}</span>
  </div>
);

/**
 * The front page is the textbook cases only. The chat with its seeded bugs (`/app`, `/bug/<flag>`) is still served —
 * the e2e tests record it, and a link or a recording can point at it — but it is not how a person meets the tool:
 * a real app's bug is learnt faster from the two-widget version of the same mistake.
 */
export const Catalogue = () => {
  useNoPanel();
  return (
    <>
      <style>{DEMO_STYLES}</style>
      <div className="landing">
        <div className="demo">
          <div className="top">
            <a className="brand" href={href()}>
              <Mark />
              react-perf-recorder
            </a>
            <nav>
              <a className="wide" href="#try">
                Try it
              </a>
              <a className="wide" href={href('docs/benchmarks')}>
                Benchmarks
              </a>
              <a href={href('docs')}>Docs</a>
              <a href={REPO}>GitHub</a>
            </nav>
          </div>

          <header className="hero" data-testid="hero">
            <div>
              <p className="eyebrow">
                <span>Vite plugin</span>
                <span>MCP server for agents</span>
                <span>React 18.2+ · 19.1+</span>
              </p>
              <h1>
                See <em>why</em> your React app re‑renders
              </h1>
              <p className="lead">
                Press Rec, use the app, press Stop. The report names the component that started each render cascade and why — the hook and its line,
                the store action, the props that broke <code>memo</code>. An AI agent reads the same recordings over MCP.
              </p>
              <div className="install">
                <code>{INSTALL}</code>
                <Copy text={INSTALL} />
              </div>
              <div className="links">
                <a className="btn primary" href="#try">
                  Try it on this page ↓
                </a>
                <a className="btn" href={href('docs')}>
                  Read the docs
                </a>
                <a className="btn" href={REPO}>
                  <GitHubIcon />
                  GitHub
                </a>
              </div>
              <p className="fine">Runs only in the Vite dev server and never ships to a build.</p>
            </div>
            <figure className="shot">
              <a href={href('basics/context')} aria-label="Open the case this report was recorded on">
                <PanelDemo />
              </a>
              <figcaption>
                A real report, recorded on <a href={href('basics/context')}>one of the cases below</a>
              </figcaption>
            </figure>
          </header>

          <section className="section">
            <p className="kicker">The report</p>
            <h2>Not how long it took — why it happened</h2>
            <p>
              React DevTools shows that a component rendered and how long it took. The recorder follows the render back to what started it and says it
              in words you can act on, down to the file and line to change.
            </p>
            <div className="grid">
              {FEATURES.map((feature) => (
                <Feature key={feature.title} {...feature} />
              ))}
            </div>
          </section>

          <section className="section">
            <p className="kicker">Set up</p>
            <h2>Three steps to the first recording</h2>
            <p>Nothing to wrap your app in and no code to change: the plugin puts the panel on the dev page.</p>
            <ol className="steps">
              <li>
                <h3>Install</h3>
                <p>A dev dependency, pinned to an exact version.</p>
                <pre>{INSTALL}</pre>
              </li>
              <li>
                <h3>Add the plugin</h3>
                <p>Next to the React plugin in the Vite config.</p>
                <pre>
                  <span className="c">// vite.config.ts</span>
                  {'\n'}
                  <span className="k">import</span>
                  {' { perfRecorder } '}
                  <span className="k">from</span> <span className="s">'react-perf-recorder/vite'</span>;{'\n\n'}
                  {'plugins: ['}
                  <span className="f">react</span>
                  {'(), '}
                  <span className="f">perfRecorder</span>
                  {'()]'}
                </pre>
              </li>
              <li>
                <h3>Record</h3>
                <p>
                  Open the dev page: the panel sits in a corner. <kbd>Alt+Shift+R</kbd> starts and stops a recording, <kbd>Alt+Shift+S</kbd> picks an
                  area of the page to record alone.
                </p>
              </li>
            </ol>
            <div className="agent">
              <div>
                <h3>With Claude Code</h3>
                <p>
                  One command adds a skill, an agent and the MCP server. The agent records the scenario — or reads the one you recorded — and answers
                  with the cascade root, the hook behind it and the file to change, then proves the fix with a second recording.
                </p>
              </div>
              <pre>
                <span className="c"># in your project</span>
                {'\nnpx react-perf-recorder init-claude'}
              </pre>
            </div>
            <div className="stores">
              Store plugins name the action behind a render:
              <a href={href('docs/plugins')}>zustand</a>
              <a href={href('docs/plugins')}>redux</a>
              <a href={href('docs/plugins')}>react-query</a>
              <a href={href('docs/plugins')}>proxy-memoize</a>
            </div>
          </section>

          <section className="section" id="try">
            <p className="kicker">Try it here</p>
            <h2>Record a real re-render bug, right in this tab</h2>
            <p>
              This site has the recorder on it — a build made for the demo, so recordings stay in the tab (Download keeps one). Each case is a page of
              its own: the broken and the fixed version of one widget side by side, with the renders counted on every row.
            </p>
            <ul className="how">
              <li>
                <b>Open a case.</b> The panel is in the corner; <kbd>Alt+Shift+R</kbd> opens and closes it, and it can be dragged anywhere.
              </li>
              <li>
                <b>Press ● Rec,</b> press the button on the page, press ■ Stop. The summary names the cascade roots and why they rendered.
              </li>
              <li>
                <b>Turn on highlights</b> to see renders outlined live, and ⌖ Pick to record one of the two versions only.
              </li>
            </ul>
            {/* Apps with no bug on: real-looking ones to try the recorder on, with no answer waiting to be found. */}
            <div className="sandboxes">
              <a className="sandbox" href={href('app')} data-testid="sandbox">
                <div>
                  <b>▷ Sandbox</b>
                  <span>A small team chat with a store, a live feed and a form. Open it and record whatever you like.</span>
                </div>
                <span className="go" aria-hidden="true">
                  →
                </span>
              </a>
              <a className="sandbox" href={href('orbit/')} data-testid="sandbox-orbit">
                <div>
                  <b>▷ Orbit, a larger app</b>
                  <span>
                    An issue tracker with 480 issues, teammates editing them live, Redux, zustand, React Query and forms. The clean app the agent
                    benchmark injects its bugs into.
                  </span>
                </div>
                <span className="go" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
            <div className="group">
              <h3>The textbook ones</h3>
              <small>{Object.keys(BASICS).length} cases</small>
            </div>
            <p>
              Two versions of one widget side by side, one of them wrong. Turn on <code>highlights</code> and press the button.
            </p>
            <div className="cards">
              {Object.entries(BASICS).map(([id, basic]) => (
                <a className="card" href={href(`basics/${id}`)} key={id} data-basic={id}>
                  <h2>{basic.title}</h2>
                  <p className="what">{basic.what}</p>
                </a>
              ))}
            </div>
            <div className="group">
              <h3>Harder ones</h3>
              <small>{Object.keys(ADVANCED).length} cases</small>
            </div>
            <p>
              Mistakes of more than one step, the way they come in real code: effects in a chain, a measurement kept in state, a list too big for a
              keystroke, a query read whole. The recording explains them where the counters alone would not.
            </p>
            <div className="cards" data-testid="advanced">
              {Object.entries(ADVANCED).map(([id, item]) => (
                <a className="card" href={href(`advanced/${id}`)} key={id} data-advanced={id}>
                  <h2>{item.title}</h2>
                  <p className="what">{item.what}</p>
                </a>
              ))}
            </div>
          </section>

          <footer className="foot" data-testid="footer">
            <div className="foot-top">
              <div>
                <a className="brand" href={href()}>
                  <Mark />
                  react-perf-recorder
                </a>
                <p>Record why a React app re-renders, read it yourself or hand it to an agent. MIT license.</p>
              </div>
              <nav>
                <a href={href('docs')}>Docs</a>
                <a href={REPO}>GitHub</a>
                <a href={href('docs/panel')}>The panel</a>
                <a href={NPM}>npm</a>
                <a href={href('docs/mcp')}>MCP server</a>
                <a href={`${REPO}/issues`}>Issues</a>
              </nav>
            </div>
            <div className="foot-bottom">
              <span>
                Made by{' '}
                <a className="site" href={SITE}>
                  zhenya.dev
                </a>
              </span>
              <span>
                Powered by <a href="https://react.dev/">React</a>, <a href="https://vite.dev/">Vite</a> and the recorder itself: every case runs it
                live
              </span>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
};

/** On every page but the front one: what is being shown here, and the way back to the cards. */
export const BugStrip = ({ note }: { note?: string }) => {
  const on = enabledBugs();
  if (isBlindCase) return null;
  return (
    <>
      <style>{STRIP_STYLES}</style>
      <div className="strip" data-testid="strip">
        <a href={href()}>← all cases</a>
        {note ? (
          <span>
            <b>{note}</b>
          </span>
        ) : on.length === 0 ? (
          <span>sandbox — a small team chat to try the recorder on: record anything, nothing here is broken on purpose</span>
        ) : (
          on.map((id) => (
            <span key={id}>
              <b>{id}</b> · <span className="try">{SCENARIOS[BUGS[id].scenario].long}</span>
            </span>
          ))
        )}
      </div>
    </>
  );
};
