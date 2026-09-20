/** @jsxImportSource preact */
import { type JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Owner } from '../core/engine';
import type { TreeActions, TreeRow } from './picker';

export interface TreeProps {
  rows: TreeRow[];
  active: number;
  showLibrary: boolean;
  watched: readonly string[];
  actions: TreeActions;
  onShowLibrary(on: boolean): void;
  onWatch(name: string): void;
  onCopy(owner: Owner): void;
}

const ARROW = { open: '▾', closed: '▸' } as const;

/** Full steps while the tree is shallow, narrow ones below: a long path of providers must not eat the width. */
const indentOf = (depth: number) => `${4 + Math.min(depth, 10) * 10 + Math.max(0, depth - 10) * 3}px`;

const stop = (event: Event, run: () => void) => {
  event.stopPropagation();
  run();
};

function Row({ p, i }: { p: TreeProps; i: number }): JSX.Element {
  const r = p.rows[i];
  const watching = p.watched.includes(r.owner.name);
  return (
    <li
      data-active={String(i === p.active)}
      data-wrapper={String(r.owner.wrapper)}
      data-name={r.owner.name}
      style={{ paddingLeft: indentOf(r.depth) }}
      onClick={() => p.actions.select(i)}
      onMouseEnter={() => p.actions.hover(i)}
    >
      <span class="toggle" data-rpr="expand" onClick={(e) => stop(e, () => p.actions.toggle(i))}>
        {r.toggle ? ARROW[r.toggle] : ''}
      </span>
      <span class="name">{r.owner.name}</span>
      <span class="src" title={r.owner.source}>
        {r.owner.source}
      </span>
      <span
        class="watch-toggle"
        data-rpr="watch-toggle"
        data-on={String(watching)}
        title="Follow this component through the recording"
        onClick={(e) => stop(e, () => p.onWatch(r.owner.name))}
      >
        {watching ? '◉' : '◎'}
      </span>
      <span class="copy" data-rpr="copy-row" title="Copy for an AI assistant" onClick={(e) => stop(e, () => p.onCopy(r.owner))}>
        ⧉
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
  useLayoutEffect(() => focusActive(list.current));
  return (
  <>
    <div class="row">
      <span class="muted">Record inside:</span>
      <label class="toggle" title="Show styling wrappers, providers and components of packages">
        <input type="checkbox" checked={p.showLibrary} onChange={(e) => p.onShowLibrary((e.target as HTMLInputElement).checked)} />
        show library
      </label>
    </div>
    <ul data-rpr="tree" ref={list} onMouseLeave={() => p.actions.leave()}>
      {p.rows.map((_, i) => (
        <Row p={p} i={i} />
      ))}
    </ul>
  </>
  );
}

/** The active row into view: vertically by hand, because scrollIntoView also drags the view away from the path. */
function focusActive(list: HTMLUListElement | null) {
  const current = list?.querySelector('[data-active="true"]');
  if (!list || !current) return;
  const box = list.getBoundingClientRect();
  const row = current.getBoundingClientRect();
  if (row.top < box.top) list.scrollTop -= box.top - row.top;
  else if (row.bottom > box.bottom) list.scrollTop += row.bottom - box.bottom;
  // Horizontally only when the indent has pushed the active name out of sight: the rows above must not be cut.
  const name = current.querySelector('.name');
  const offset = name ? name.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft : 0;
  if (offset > list.clientWidth * 0.6) list.scrollLeft = offset - 24;
}
