/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Owner } from '../../core/engine';
import type { TreeActions, TreeRow } from '../picker';

export interface TreeProps {
  rows: TreeRow[];
  active: number;
  showLibrary: boolean;
  showProviders: boolean;
  watched: readonly string[];
  actions: TreeActions;
  onShow(what: 'library' | 'providers', on: boolean): void;
  onWatch(name: string): void;
  onCopy(owner: Owner): void;
  /** The copy button that just worked, by `rowCopyKey`. */
  copied?: string | null;
}

/** Which row a copy came from: its component and where it is written, the same for the row across rebuilds. */
export const rowCopyKey = (owner: Owner) => `row:${owner.name}:${owner.source}`;

interface RowProps {
  row: TreeRow;
  active: boolean;
  watching: boolean;
  onSelect(): void;
  onHover(): void;
  onToggle(): void;
  onWatch(): void;
  onCopy(): void;
  copied: boolean;
}

const ARROW = { open: '▾', closed: '▸' } as const;

/** Full steps while the tree is shallow, narrow ones below: a long path of providers must not eat the width. */
const indentOf = (depth: number) => `${4 + Math.min(depth, 10) * 10 + Math.max(0, depth - 10) * 3}px`;

const stop = (event: Event, run: () => void) => {
  event.stopPropagation();
  run();
};

function Row({ row, active, watching, onSelect, onHover, onToggle, onWatch, onCopy, copied }: RowProps): JSX.Element {
  const { owner } = row;
  return (
    <li
      data-active={String(active)}
      data-wrapper={String(owner.wrapper || owner.provider || owner.library)}
      data-name={owner.name}
      style={{ paddingLeft: indentOf(row.depth) }}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <span class="toggle" data-rpr="expand" onClick={(e) => stop(e, onToggle)}>
        {row.toggle ? ARROW[row.toggle] : ''}
      </span>
      <span class="name">{owner.name}</span>
      {/* The file's name is what tells rows apart; the folders repeat on every row and are in the title. */}
      <span class="src" title={owner.source}>
        {owner.source.slice(owner.source.lastIndexOf('/') + 1)}
      </span>
      <span
        class="watch-toggle"
        data-rpr="watch-toggle"
        data-on={String(watching)}
        title="Follow this component through the recording"
        role="button"
        aria-label={`Follow ${owner.name} through the recording`}
        aria-pressed={watching}
        onClick={(e) => stop(e, onWatch)}
      >
        {watching ? '◉' : '◎'}
      </span>
      <span
        class="copy"
        data-rpr="copy-row"
        data-copied={copied ? 'true' : undefined}
        title={copied ? 'Copied' : 'Copy for an AI assistant'}
        role="button"
        aria-label={copied ? `${owner.name} copied` : `Copy ${owner.name} for an AI assistant`}
        onClick={(e) => stop(e, onCopy)}
      >
        {copied ? '✓' : '⧉'}
      </span>
    </li>
  );
}

/**
 * The component tree of the picker. Preact patches the rows in place — moving the area with the arrows must not throw
 * the list away, or the place it is scrolled to goes with it. It lives in the panel's shadow root and never in the
 * page, so the app's own React knows nothing about it.
 */
export function Tree(p: TreeProps): JSX.Element {
  const list = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => followActive(list.current));
  return (
    <>
      <div class="row">
        {/* These filter the tree below; what gets recorded is decided by the area, not by what the tree shows. */}
        <span class="muted">Show:</span>
        <label class="toggle" title="Show components that come from packages, and the app's own unnamed wrappers">
          <input
            type="checkbox"
            data-rpr="show-library"
            checked={p.showLibrary}
            onChange={(e) => p.onShow('library', (e.target as HTMLInputElement).checked)}
          />
          packages
        </label>
        <label class="toggle" title="Show the components that only hand a context down">
          <input
            type="checkbox"
            data-rpr="show-providers"
            checked={p.showProviders}
            onChange={(e) => p.onShow('providers', (e.target as HTMLInputElement).checked)}
          />
          providers
        </label>
      </div>
      <ul data-rpr="tree" ref={list} onMouseLeave={() => p.actions.leave()}>
        {p.rows.map((row, i) => (
          <Row
            key={i}
            row={row}
            active={i === p.active}
            watching={p.watched.includes(row.owner.name)}
            onSelect={() => p.actions.select(i)}
            onHover={() => p.actions.hover(i)}
            onToggle={() => p.actions.toggle(i)}
            onWatch={() => p.onWatch(row.owner.name)}
            onCopy={() => p.onCopy(row.owner)}
            copied={p.copied === rowCopyKey(row.owner)}
          />
        ))}
      </ul>
    </>
  );
}

/** The active row into view: vertically by hand, because scrollIntoView also drags the view away from the path. */
function followActive(list: HTMLUListElement | null) {
  const current = list?.querySelector('[data-active="true"]');
  if (!list || !current) return;
  const box = list.getBoundingClientRect();
  const row = current.getBoundingClientRect();
  if (row.top < box.top) list.scrollTop -= box.top - row.top;
  else if (row.bottom > box.bottom) list.scrollTop += row.bottom - box.bottom;
  // Horizontally only when the indent has pushed the active name out of sight: the rows above must not be cut.
  const name = current.querySelector('.name');
  const offset = name ? name.getBoundingClientRect().left - box.left + list.scrollLeft : 0;
  if (offset > list.clientWidth * 0.6) list.scrollLeft = offset - 24;
}
