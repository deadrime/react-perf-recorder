/** @jsxImportSource preact */
import type { JSX } from 'preact';
import type { PanelViewProps } from './PanelView';

const scopeText = (p: PanelViewProps) => {
  if (!p.scope) return 'Whole app';
  return p.scope.lost ? `${p.scope.name} (unmounted)` : p.scope.name;
};

/** The row that runs a recording and says which part of the page it is about. */
export function Controls({ p }: { p: PanelViewProps }): JSX.Element {
  return (
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
}
