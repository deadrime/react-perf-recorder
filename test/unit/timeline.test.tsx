/** @jsxImportSource preact */
import { render } from 'preact';
import { Timeline } from '../../src/ui/components/Timeline';
import type { CommitRecord, RecordingV2 } from '../../src/shared/schema';

/** A long, busy recording: 3000 commits over five minutes, each with a root and a reason. */
const busy = (): RecordingV2 => {
  const list: CommitRecord[] = Array.from({ length: 3000 }, (_, i) => ({
    i,
    atMs: i * 100,
    renders: 1 + (i % 7),
    ms: 0.4,
    lane: 'Sync',
    causeIds: [0],
    roots: [{ i: i % 3, hits: 1 + (i % 2), reasonIds: [0] }],
  }));
  return {
    durationMs: 300_000,
    reasons: [{ i: 0, kind: 'state', hook: 0 }],
    commits: { list, truncated: false },
    causes: [{ i: 0, key: 'zustand:feed/tick', plugin: 'zustand', type: 'feed/tick', events: 3000, commits: 3000 }],
    actions: [],
    segments: [],
    roots: [0, 1, 2].map((i) => ({
      key: `Row${i}`,
      name: `Row${i}`,
      source: '',
      path: '',
      hits: 1000,
      instances: 1,
      cascade: 1000,
      perHit: 1,
      medianGapMs: 100,
      firstAtMs: 0,
      lastAtMs: 300_000,
      reasons: [[0, 1000]],
      causes: [],
      lanes: [],
      noDomChange: 0,
    })),
    outsideRoots: [],
  } as unknown as RecordingV2;
};

describe('the timeline of a long recording', () => {
  it('draws only what is on screen, however many commits there are', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(<Timeline rec={busy()} />, host);
    const bars = host.querySelectorAll('.tl-bar').length;
    expect(bars).toBeGreaterThan(0);
    // The actions, the commits and a lane per root — and a bar every couple of pixels, not one per commit.
    expect(host.querySelectorAll('.tl-lane').length).toBe(5);
    expect(bars).toBeLessThan(1200);
    render(null, host);
  });
});
