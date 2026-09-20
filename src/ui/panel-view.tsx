/** @jsxImportSource preact */
import { render, type JSX } from 'preact';
import type { Engine, Saved } from '../core/engine';
import { Result } from './result-view';
import type { Corner } from './storage';
import { Tree, type TreeProps } from './tree-view';

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

const liveText = (p: PanelViewProps) => {
  if (!p.live) return p.busy ? 'saving…' : '';
  const seconds = (p.live.elapsedMs / 1000).toFixed(1);
  return `${seconds}s · C ${p.live.commitsInScope}/${p.live.commits} · R ${p.live.renders} · ${p.live.rendersPerSec}/s`;
};

const scopeText = (p: PanelViewProps) => {
  if (!p.scope) return 'Whole app';
  return p.scope.lost ? `${p.scope.name} (unmounted)` : p.scope.name;
};

/** Names being followed, each removable; during a recording they are shown but not editable. */
const Watching = ({ p }: { p: PanelViewProps }) => (
  <div class="row watch" data-rpr="watch">
    {p.watched.length ? <span class="muted">Watching:</span> : null}
    {p.watched.map((name) => (
      <button class="chip" data-rpr="watched" data-name={name} title="Stop following this component" disabled={p.recording} onClick={() => p.on.unwatch(name)}>
        {`${name} ×`}
      </button>
    ))}
  </div>
);

/** Leading roots as they are: what is flashing right now, without stopping the recording. */
const LiveRoots = ({ p }: { p: PanelViewProps }) => (
  <div class="live-roots" data-rpr="live-roots">
    {(p.live?.topRoots ?? []).map((r) => (
      <div class="line">
        <span class="n">{r.name}</span>
        {` ×${r.hits} · ${r.perHit}/hit `}
        <span class="why">{r.reason}</span>
      </div>
    ))}
  </div>
);

const Controls = ({ p }: { p: PanelViewProps }) => (
  <div class="row">
    <button class="rec" data-rpr="record" title={`Start recording (${p.shortcuts.record})`} hidden={p.recording || p.busy} onClick={p.on.record}>
      ● Rec
    </button>
    <button
      class="rec"
      data-rpr="record-on-load"
      title="Reload the page and record from its first render"
      hidden={p.recording || p.busy}
      onClick={p.on.recordOnLoad}
    >
      ⟳ Load
    </button>
    <button class="stop" data-rpr="stop" title={`Stop (${p.shortcuts.record})`} hidden={!p.recording} onClick={p.on.stop}>
      ■ Stop
    </button>
    <button data-rpr="pick" title={`Pick an area (${p.shortcuts.pick})`} disabled={p.recording} onClick={p.on.pick}>
      ⌖ Area
    </button>
    <button
      class="scope"
      data-rpr="scope"
      data-lost={String(Boolean(p.scope?.lost))}
      title="Click to change the area, hover to outline it"
      disabled={p.recording}
      onClick={p.on.editScope}
      onMouseEnter={() => p.on.outlineScope(true)}
      onMouseLeave={() => p.on.outlineScope(false)}
    >
      {scopeText(p)}
    </button>
    <button
      data-rpr="copy-scope"
      title="Copy the area as text for an AI assistant: component, file, path, DOM"
      hidden={!p.scope}
      onClick={p.on.copyScope}
    >
      ⧉
    </button>
    <button data-rpr="clear-scope" title="Record the whole app" hidden={!p.scope || p.recording} onClick={p.on.clearScope}>
      ×
    </button>
    <button
      data-rpr="last-scope"
      title={p.lastScope ? `Find ${p.lastScope} again` : ''}
      hidden={Boolean(p.scope) || !p.lastScope || p.recording}
      onClick={p.on.lastScope}
    >
      ↺
    </button>
    <label class="toggle" title="Outline renders in the area, also between recordings">
      <input type="checkbox" data-rpr="highlight" checked={p.highlight} onChange={(e) => p.on.setHighlight((e.target as HTMLInputElement).checked)} />
      highlight
    </label>
  </div>
);

const View = (p: PanelViewProps): JSX.Element => (
  <div
    class="rpr"
    data-corner={p.corner}
    data-collapsed={String(p.collapsed && !p.recording)}
    data-recording={String(p.recording)}
    hidden={!p.visible}
  >
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
