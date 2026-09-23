// @vitest-environment node
import { buildSegments } from '../../src/shared/segments';
import type { ActionRecord } from '../../src/shared/schema';

const typing: ActionRecord = { id: 1, kind: 'typing', atMs: 100, endMs: 400, chars: 4, target: { tag: 'input', name: 'amount' } };
const click: ActionRecord = { id: 2, kind: 'click', atMs: 3000, endMs: 3000, target: { tag: 'button', testId: 'open' } };

describe('buildSegments', () => {
  it('splits reaction from background and counts per typed char', () => {
    const commits = [
      { i: 0, t: 110, n: 40, event: 'input', roots: [[0, 40]] as Array<[number, number]> },
      { i: 0, t: 150, n: 10, event: 'message', roots: [[1, 10]] as Array<[number, number]> },
      { i: 0, t: 210, n: 40, event: 'input', roots: [[0, 40]] as Array<[number, number]> },
      { i: 0, t: 300, n: 40, event: 'input', roots: [[0, 40]] as Array<[number, number]> },
      { i: 0, t: 390, n: 40, event: 'input', roots: [[0, 40]] as Array<[number, number]> },
      { i: 0, t: 2500, n: 5, roots: [[1, 5]] as Array<[number, number]> },
      { i: 0, t: 3001, n: 7, event: 'click', roots: [[2, 7]] as Array<[number, number]> },
    ];
    const [a, b] = buildSegments([typing, click], commits, [
      { atMs: 3000, type: 'click', duration: 64, inputDelay: 2, processing: 50, presentation: 12, interactionId: 9 },
    ]);
    expect(a).toMatchObject({
      action: 1,
      commits: 5,
      renders: 170,
      reaction: { commits: 4, renders: 160 },
      background: { commits: 1, renders: 10 },
      perChar: { renders: 40, commits: 1, maxRenders: 40 },
    });
    expect(a.topRoots[0]).toEqual([0, 160]);
    // The commit at 2.5 s comes after more than a second of quiet: it belongs to no action.
    expect(b).toMatchObject({ action: 2, commits: 1, renders: 7, latency: { duration: 64 } });
  });
});
