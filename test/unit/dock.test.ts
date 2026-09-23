// @vitest-environment node
import { dockOf, dockStyle } from '../../src/ui/dock';

const view = { width: 1280, height: 800 };
const dot = (left: number, top: number) => ({ left, top, width: 28, height: 28 });

describe('where the panel sticks', () => {
  it('takes the nearest edge at the usual gap, and stays where it was left along it', () => {
    // Nearer the top than the left: it hangs from the top edge, at the place it was dropped across it.
    expect(dockOf(dot(300, 240), view)).toEqual({ corner: 'top-left', offset: { x: 300, y: 12 } });
    // Nearer the right than the bottom: the right edge takes it, at the height it was dropped at.
    expect(dockOf(dot(1100, 600), view)).toEqual({ corner: 'bottom-right', offset: { x: 12, y: 800 - 628 } });
    // The quarter its middle is in decides the corner it hangs from, and which way the card will open.
    expect(dockOf(dot(640, 380), view).corner).toBe('top-right');
    expect(dockOf(dot(600, 390), view).corner).toBe('bottom-left');
  });

  it('is the same gap from every edge', () => {
    expect(dockOf(dot(600, 40), view).offset.y).toBe(12);
    expect(dockOf(dot(600, 740), view).offset.y).toBe(12);
    expect(dockOf(dot(40, 400), view).offset.x).toBe(12);
    expect(dockOf(dot(1220, 400), view).offset.x).toBe(12);
  });

  it('never leaves it half off the screen', () => {
    expect(dockOf(dot(-30, -40), view).offset).toEqual({ x: 12, y: 12 });
    expect(dockOf(dot(1400, 900), view).offset).toEqual({ x: 12, y: 12 });
    // A viewport smaller than the panel still gives positive offsets.
    expect(dockOf({ left: 0, top: 0, width: 500, height: 400 }, { width: 400, height: 300 }).offset).toEqual({ x: 12, y: 12 });
  });

  it('writes the dock as a style, and nothing at all before the first drag', () => {
    expect(dockStyle('bottom-left', { x: 40, y: 12 })).toBe('--rpr-x:40px;--rpr-y:12px;left:40px;right:auto;bottom:12px;top:auto');
    expect(dockStyle('top-right', { x: 12, y: 300 })).toBe('--rpr-x:12px;--rpr-y:300px;right:12px;left:auto;top:300px;bottom:auto');
    expect(dockStyle('bottom-left', undefined)).toBeUndefined();
  });
});
