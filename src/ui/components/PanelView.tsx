/** @jsxImportSource preact */
import { render, type JSX } from 'preact';
import type { Engine, Saved } from '../../core/engine';
import type { Corner } from '../storage';
import { Controls } from './Controls';
import { Result } from './Result';
import { Line, N, Why } from './Text';
import { Tree, type TreeProps } from './Tree';

export type Live = NonNullable<ReturnType<Engine['live']>>;

export interface PanelHandlers {
  record(): void;
  recordOnLoad(): void;
  stop(): void;
  pick(): void;
  editScope(): void;
  copyScope(): void;
  clearScope(): void;
  lastScope(): void;
  outlineScope(on: boolean): void;
  setHighlight(on: boolean): void;
  setNote(text: string): void;
  unwatch(name: string): void;
  setCollapsed(collapsed: boolean): void;
  dragStart(event: JSX.TargetedPointerEvent<HTMLElement>): void;
  dismissResult(): void;
}

export interface PanelViewProps {
  visible: boolean;
  collapsed: boolean;
  recording: boolean;
  busy: boolean;
  corner: Corner;
  shortcuts: { record: string; pick: string };
  scope: { name: string; lost: boolean } | null;
  lastScope: string | null;
  note: string;
  highlight: boolean;
  watched: readonly string[];
  live: Live | null;
  message: { text: string; kind: 'error' | 'notice' | 'muted' };
  tree: TreeProps | null;
  result: Saved | null;
  on: PanelHandlers;
}

const liveText = ({ live, busy }: PanelViewProps) => {
  if (!live) return busy ? 'saving…' : '';
  return `${(live.elapsedMs / 1000).toFixed(1)}s · C ${live.commitsInScope}/${live.commits} · R ${live.renders} · ${live.rendersPerSec}/s`;
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

/** Leading roots as they are: what is flashing right now, without stopping the recording. */
const LiveRoots = ({ p }: { p: PanelViewProps }) => (
  <div class="live-roots" data-rpr="live-roots">
    {(p.live?.topRoots ?? []).map((r) => (
      <Line key={r.name}>
        <N>{r.name}</N>
        {` ×${r.hits} · ${r.perHit}/hit `}
        <Why>{r.reason}</Why>
      </Line>
    ))}
  </div>
);

const View = (p: PanelViewProps): JSX.Element => (
  <div class="rpr" data-corner={p.corner} data-collapsed={String(p.collapsed && !p.recording)} data-recording={String(p.recording)} hidden={!p.visible}>
    <button class="dot" data-rpr="toggle" title={`react-perf-recorder (${p.shortcuts.record})`} onClick={() => p.on.setCollapsed(false)}>
      ●
    </button>
    <div class="card">
      <header onPointerDown={p.on.dragStart}>
        <span class="title">perf</span>
        <span class="live">{liveText(p)}</span>
        <button title="Collapse" data-rpr="collapse" onClick={() => p.on.setCollapsed(true)}>
          –
        </button>
      </header>
      <Controls p={p} />
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
      <Watching p={p} />
      <LiveRoots p={p} />
      <div class="picker" data-rpr="picker">
        {p.tree ? <Tree {...p.tree} /> : null}
      </div>
      <div class={p.message.kind} data-rpr="message">
        {p.message.text}
      </div>
      <div class="result" data-rpr="result">
        {p.result ? <Result rec={p.result} onDismiss={p.on.dismissResult} /> : null}
      </div>
    </div>
  </div>
);

/** The whole panel is one tree: the picker tree and the summary are parts of it, patched together with the rest. */
export function renderPanel(container: HTMLElement, props: PanelViewProps) {
  render(<View {...props} />, container);
}
