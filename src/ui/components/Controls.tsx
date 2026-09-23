/** @jsxImportSource preact */
import type { JSX } from 'preact';
import type { PanelViewProps } from './PanelView';

const scopeText = (p: PanelViewProps) => {
  if (!p.scope) return 'Whole app';
  return p.scope.lost ? `${p.scope.name} (unmounted)` : p.scope.name;
};

/**
 * A crosshair drawn rather than typed: the ⌖ glyph sits on the text's baseline in every font differently, and in a
 * button of its own it never came out in the middle.
 */
const PickIcon = () => (
  <svg class="pick-icon" viewBox="0 0 12 12" aria-hidden="true">
    <circle cx="6" cy="6" r="3.5" />
    <path d="M6 0.5v3M6 8.5v3M0.5 6h3M8.5 6h3" />
  </svg>
);

/**
 * One row: record and the area, the area a single pill, so what a recording is about sits next to the button that
 * starts it.
 */
export function Controls({ p }: { p: PanelViewProps }): JSX.Element {
  const scoped = Boolean(p.scope);
  return (
    <div class="row controls">
      <button type="button" class="rec" data-rpr="record" title={`Start recording (${p.shortcuts.record})`} hidden={p.recording || p.busy} onClick={p.on.record}>
        ● Rec
      </button>
      <button
        type="button"
        class="reload"
        data-rpr="record-on-load"
        title="Reload the page and record it from its first render"
        hidden={p.recording || p.busy}
        onClick={p.on.recordOnLoad}
      >
        ↺ Page load
      </button>
      <button type="button" class="stop" data-rpr="stop" title={`Stop (${p.shortcuts.record})`} hidden={!p.recording} onClick={p.on.stop}>
        ■ Stop
      </button>
      <span class="area-pill" data-scoped={scoped ? 'true' : undefined} data-lost={String(Boolean(p.scope?.lost))}>
        <button
          type="button"
          data-rpr="pick"
          title={`${scoped ? 'Pick another area' : 'Pick an area — the whole app is recorded until you do'} (${p.shortcuts.pick})`}
          aria-label={scoped ? 'Pick another area' : 'Pick an area'}
          disabled={p.recording}
          onClick={p.on.pick}
        >
          <PickIcon />
          {scoped ? null : 'Pick'}
        </button>
        <button
          type="button"
          class="scope"
          data-rpr="scope"
          data-lost={String(Boolean(p.scope?.lost))}
          title="The area: click to move it through the tree, hover to outline it"
          // No area means the whole app: that needs no button of its own, and × is how to get back to it.
          hidden={!scoped}
          disabled={p.recording}
          onClick={p.on.editScope}
          onMouseEnter={() => p.on.outlineScope(true)}
          onMouseLeave={() => p.on.outlineScope(false)}
        >
          {scopeText(p)}
        </button>
        <button
          type="button"
          class="icon"
          data-rpr="copy-scope"
          data-copied={p.copied === 'scope' ? 'true' : undefined}
          title={p.copied === 'scope' ? 'Copied — paste it into the chat with the assistant' : 'Copy the area as text for an AI assistant: component, file, path, DOM'}
          aria-label={p.copied === 'scope' ? 'Area copied' : 'Copy the area for an AI assistant'}
          hidden={!scoped}
          onClick={p.on.copyScope}
        >
          {p.copied === 'scope' ? '✓' : '⧉'}
        </button>
        <button
          type="button"
          class="icon"
          data-rpr="clear-scope"
          title="Back to the whole app"
          aria-label="Back to the whole app"
          hidden={!scoped || p.recording}
          onClick={p.on.clearScope}
        >
          ×
        </button>
      </span>
    </div>
  );
}

/** What the outlines on the page mean: said where they are switched on, since nothing on the page can say it. */
const HIGHLIGHT_LEGEND =
  'Outline renders on the page, also between recordings. Green: a few renders in a row, yellow: often, red: all the ' +
  'time; grey: the render changed nothing in the DOM. ×N counts the renders of that streak.';

/** The outlines are on or off for the page, recording or not, so the switch sits in the header rather than with the recording's controls. */
export function HighlightToggle({ p }: { p: PanelViewProps }): JSX.Element {
  return (
    <label class="toggle highlight-toggle" title={HIGHLIGHT_LEGEND}>
      <input type="checkbox" data-rpr="highlight" checked={p.highlight} onChange={(e) => p.on.setHighlight((e.target as HTMLInputElement).checked)} />
      highlight
    </label>
  );
}

/** Sampled reasons for the next recording: said where it is switched on, since the report can only say it was. */
export function FastToggle({ p }: { p: PanelViewProps }): JSX.Element {
  return (
    <label
      class="toggle fast-toggle"
      title="Faster recording of big lists: the reason of a render its parent caused is worked out for 50 instances of a component a commit, not all of them. Counts of renders stay exact; the report marks the components whose reasons are a sample."
      hidden={p.recording}
    >
      <input type="checkbox" data-rpr="fast" checked={p.fast} onChange={(e) => p.on.setFast((e.target as HTMLInputElement).checked)} />
      fast
    </label>
  );
}
