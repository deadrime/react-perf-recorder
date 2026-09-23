import type { Corner, Offset } from './storage';

/**
 * Where the dropped panel lands: on its nearest edge, at the gap, where it was let go along that edge.
 * The corner it hangs from also sets which way the card opens.
 */
export interface Dock {
  corner: Corner;
  /** Distance from the corner's own two edges to the panel, in pixels; the edge it took is at the gap. */
  offset: Offset;
}

/** The gap the panel keeps from the edge it is stuck to, and the one an undragged corner sits at. */
export const GAP = 12;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/** How far the panel is from the view's edge on one axis: the side of it the corner is on. */
const away = (start: number, size: number, room: number, near: boolean) => (near ? start : room - (start + size));

/** Where it sits along the edge it took: where it was left, with the panel kept whole on the screen. */
const along = (distance: number, size: number, room: number, gap: number) => Math.round(clamp(distance, gap, room - size - gap));

export function dockOf(rect: { left: number; top: number; width: number; height: number }, view: { width: number; height: number }, gap = GAP): Dock {
  const left = rect.left + rect.width / 2 < view.width / 2;
  const top = rect.top + rect.height / 2 < view.height / 2;
  const x = away(rect.left, rect.width, view.width, left);
  const y = away(rect.top, rect.height, view.height, top);
  // The nearer edge takes it and keeps the gap; the other axis holds the place along that edge.
  const sideways = x <= y;
  return {
    corner: `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`,
    offset: {
      x: sideways ? gap : along(x, rect.width, view.width, gap),
      y: sideways ? along(y, rect.height, view.height, gap) : gap,
    },
  };
}

const across = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const;

/**
 * The inline style that holds a dock: both edges of the corner, each at the distance the panel was left at.
 * `--rpr-x` and `--rpr-y` go with it, so the card can keep itself inside the screen wherever the panel sits.
 */
export function dockStyle(corner: Corner, offset: Offset | undefined): string | undefined {
  if (!offset) return undefined;
  const [y, x] = corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return `--rpr-x:${offset.x}px;--rpr-y:${offset.y}px;${x}:${offset.x}px;${across[x]}:auto;${y}:${offset.y}px;${across[y]}:auto`;
}
