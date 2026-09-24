/** @jsxImportSource preact */
import { render, type JSX } from 'preact';
import type { Engine, Saved } from '../../core/engine';
import { dockStyle } from '../dock';
import type { Corner, Offset } from '../storage';
import { Controls, FastToggle, HighlightToggle } from './Controls';
import type { Comparison } from './Compare';
import { Result } from './Result';
import { whatOf } from './Stats';
import { Tree, type TreeProps } from './Tree';

export type Live = NonNullable<ReturnType<Engine['live']>>;

/** The note field is off; the panel then sends no label, so a note typed long ago cannot ride along unseen. */
export const NOTE_IN_PANEL = false;

export interface PanelHandlers {
  record(): void;
  recordOnLoad(): void;
  /** Reload and do the report's actions again, recording. */
  repeat(): void;
  stop(): void;
  pick(): void;
  editScope(): void;
  copyScope(): void;
  clearScope(): void;
  outlineScope(on: boolean): void;
  setHighlight(on: boolean): void;
  setFast(on: boolean): void;
  setNote(text: string): void;
  unwatch(name: string): void;
  setCollapsed(collapsed: boolean): void;
  /** The dot was clicked rather than dragged. */
  openFromDot(): void;
  setWide(wide: boolean): void;
  dragStart(event: JSX.TargetedPointerEvent<HTMLElement>): void;
  dismissResult(): void;
  /**
   * Outlines on the page the roots of what is picked on the report's timeline — `[root index, hits]` — or takes the
   * outlines away with null. Says how many components it found on the page now.
   */
  outlineRoots(entries: Array<{ i: number; hits: number }> | null): number;
}

export interface PanelViewProps {
  visible: boolean;
  collapsed: boolean;
  recording: boolean;
  busy: boolean;
  corner: Corner;
  /** Where the panel sits relative to its corner, once it has been dragged somewhere. */
  offset?: Offset;
  /** The report in a wider panel. */
  wide: boolean;
  /** The key of the copy button that just worked: it shows a tick for a moment. */
  copied: string | null;
  shortcuts: { record: string; pick: string };
  scope: { name: string; lost: boolean } | null;
  note: string;
  highlight: boolean;
  fast: boolean;
  watched: readonly string[];
  live: Live | null;
  message: { text: string; kind: 'error' | 'notice' | 'muted' };
  tree: TreeProps | null;
  result: Saved | null;
  /** The result against the recording before it, when there is something to set side by side. */
  compared: Comparison | null;
  replaying: { at: number; of: number } | null;
  on: PanelHandlers;
}

/** The running line in the header, in words: a letter per number saved no room and cost every reader a guess. */
const liveText = ({ live, busy, scope, replaying }: PanelViewProps) => {
  if (!live) return busy ? 'saving…' : '';
  if (replaying) return `replaying ${replaying.at} of ${replaying.of} · ${live.renders} renders`;
  const commits = scope ? `${live.commitsInScope}/${live.commits} commits in area` : `${live.commits} commits`;
  return `${(live.elapsedMs / 1000).toFixed(1)}s · ${commits} · ${live.renders} renders · ${live.rendersPerSec}/s`;
};

/** Names being followed, each removable; during a recording they are shown but not editable. */
const Watching = ({ p }: { p: PanelViewProps }) => (
  <div class="row watch" data-rpr="watch">
    {p.watched.length ? <span class="muted">Watching:</span> : null}
    {p.watched.map((name) => (
      <button
        key={name}
        class="chip"
        data-rpr="watched"
        data-name={name}
        title="Stop following this component"
        disabled={p.recording}
        onClick={() => p.on.unwatch(name)}
      >
        {`${name} ×`}
      </button>
    ))}
  </div>
);

/**
 * Leading roots as they are: what is flashing right now, without stopping the recording. It sits above the buttons
 * on purpose: in a bottom corner the panel grows upwards, so everything under a block that fills in stays put.
 */
const LiveRoots = ({ p }: { p: PanelViewProps }) => (
  <div class="live-roots" data-rpr="live-roots">
    {/* The block keeps its height from the first moment, so say why it is empty rather than leave a hole. */}
    {p.live && !p.live.topRoots.length ? (
      <span class="live-empty">{p.scope ? 'Nothing has rendered in the area yet' : 'Nothing has rendered yet'}</span>
    ) : null}
    {(p.live?.topRoots ?? []).map((r) => (
      <div class="live-root" key={r.name}>
        <span class="who">{r.name}</span>
        <span class="badge" data-tone="count">{`×${r.hits}`}</span>
        <span class="badge">{`${r.perHit}/hit`}</span>
        {r.info ? (
          <span class="kind" data-kind={r.info.kind}>
            {r.info.kind}
          </span>
        ) : null}
        <span class="what" title={r.reason}>
          {r.info ? whatOf(r.info) : r.reason}
        </span>
      </div>
    ))}
  </div>
);

const View = (p: PanelViewProps): JSX.Element => (
  <div
    class="rpr"
    data-corner={p.corner}
    data-collapsed={String(p.collapsed && !p.recording)}
    data-recording={String(p.recording)}
    data-wide={p.wide && p.result ? 'true' : undefined}
    hidden={!p.visible}
    style={dockStyle(p.corner, p.offset)}
  >
    {/* The dot is dragged by itself and sticks to the nearest edge; a press that does not move still opens it. */}
    <button
      class="dot"
      data-rpr="toggle"
      title={`react-perf-recorder (${p.shortcuts.record}) — drag to move it`}
      onPointerDown={p.on.dragStart}
      onClick={() => p.on.openFromDot()}
    >
      ●
    </button>
    <div class="card">
      <header onPointerDown={p.on.dragStart}>
        {/* A pulse on a chart: the mark turns red and beats while a recording runs, so the state reads at a glance. */}
        <span class="brand">
          <svg class="brand-mark" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="0.5" y="0.5" width="15" height="15" rx="4" />
            <path d="M2.5 9h2.5l1.5-4 2.5 7 1.5-3h3" />
          </svg>
          <span class="brand-name">Perf Recorder</span>
        </span>
        <span class="live">{liveText(p)}</span>
        <FastToggle p={p} />
        <HighlightToggle p={p} />
        <button type="button" title="Collapse" aria-label="Collapse the panel" data-rpr="collapse" onClick={() => p.on.setCollapsed(true)}>
          –
        </button>
      </header>
      {p.replaying ? (
        <div
          class="replay-bar"
          data-rpr="replay-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={p.replaying.of}
          aria-valuenow={p.replaying.at}
        >
          <i style={{ width: `${(p.replaying.at / Math.max(1, p.replaying.of)) * 100}%` }} />
        </div>
      ) : null}
      <LiveRoots p={p} />
      <Controls p={p} />
      {NOTE_IN_PANEL ? (
        <label class="row note">
          <span class="muted">Note</span>
          <input
            type="text"
            data-rpr="note"
            placeholder="what you are testing, e.g. typing the amount"
            title="Saved with the recording and shown in the list of recordings, so you and the agent can tell them apart"
            value={p.note}
            onInput={(e) => p.on.setNote((e.target as HTMLInputElement).value)}
          />
        </label>
      ) : null}
      <Watching p={p} />
      <div class="picker" data-rpr="picker">
        {p.tree ? <Tree {...p.tree} copied={p.copied} /> : null}
      </div>
      <div class={p.message.kind} data-rpr="message">
        {p.message.text}
      </div>
      <div class="result" data-rpr="result">
        {p.result ? (
          <Result
            rec={p.result}
            compared={p.compared}
            onRepeat={p.on.repeat}
            onOutline={p.on.outlineRoots}
            onDismiss={p.on.dismissResult}
            wide={p.wide}
            onWide={() => p.on.setWide(!p.wide)}
          />
        ) : null}
      </div>
    </div>
  </div>
);

/** The whole panel is one tree: the picker tree and the summary are parts of it, patched together with the rest. */
export function renderPanel(container: HTMLElement, props: PanelViewProps) {
  render(<View {...props} />, container);
}
