// @vitest-environment node
import { aggregateEvents } from '../../src/shared/aggregate';
import { compareRecordings } from '../../src/shared/compare';
import { summarize } from '../../src/shared/summary';
import type { SessionEvent, SessionMeta } from '../../src/shared/schema';

const meta: SessionMeta = {
  schema: 'react-perf-recorder/session',
  version: 1,
  id: '20260919-120000-app-panel-abcd',
  status: 'recording',
  createdAt: '2026-09-19T12:00:00.000Z',
  updatedAt: '2026-09-19T12:00:10.000Z',
  source: 'panel',
  page: { url: 'http://localhost:5173/trade', title: 't', viewport: '1920×919', dpr: 1, userAgent: 'x' },
  scope: null,
  conditions: { viewport: '1920×919' },
  plugins: [],
  events: 0,
  reloads: 0,
};

const events = (renders: number): SessionEvent[] => [
  { k: 'root', i: 0, key: 'Row|src/Row.tsx:1|Table', name: 'Row', source: 'src/Row.tsx:1', path: 'Table' },
  { k: 'reason', i: 0, text: 'external store #2 selectRow' },
  { k: 'action', action: { id: 1, kind: 'click', atMs: 100, endMs: 100, target: { tag: 'button', testId: 'refresh' } } },
  { k: 'commit', t: 110, n: renders, event: 'click', roots: [[0, renders, [0]]], causes: ['zustand:rows/set'] },
  { k: 'commit', t: 900, n: renders, roots: [[0, renders, [0]]], causes: ['zustand:rows/set'] },
  { k: 'end', atMs: 1000 },
];

describe('partial recordings and comparison', () => {
  it('rebuilds a summary from streamed events', () => {
    const rec = aggregateEvents(meta, events(30));
    expect(rec.partial).toBe(true);
    expect(rec.totals).toMatchObject({ commits: 2, renders: 60 });
    expect(rec.roots[0]).toMatchObject({ name: 'Row', hits: 2, cascade: 60, reasons: [['external store #2 selectRow', 2]] });
    const summary = summarize(rec);
    expect(summary.actions[0]).toMatchObject({ what: 'click «refresh»', renders: 60 });
    expect(summary.topCauses[0]).toMatchObject({ key: 'zustand:rows/set', commits: 2 });
  });

  it('compares roots, causes and the same action before and after', () => {
    const before = aggregateEvents(meta, events(30));
    const after = aggregateEvents({ ...meta, id: '20260919-120100-app-panel-beef' }, events(3));
    const result = compareRecordings(before, after);
    expect(result.roots[0]).toMatchObject({ root: 'Row', status: 'changed', perHit: { before: 30, after: 3, delta: -27, pct: -90 } });
    expect(result.actions[0]).toMatchObject({ action: 'click «refresh»', renders: { before: 60, after: 6 } });
    expect(result.warnings).toContain('a partial recording is compared: hook names, components and plugin sections may be missing');
    expect(result.comparable).toBe(true);
  });

  it('warns when the runs were taken differently', () => {
    const before = aggregateEvents(meta, events(30));
    const after = aggregateEvents({ ...meta, page: { ...meta.page, viewport: '390×719' }, conditions: { viewport: '390×719' } }, events(30));
    const result = compareRecordings(before, after);
    expect(result.comparable).toBe(false);
    expect(result.warnings[0]).toMatch(/viewport differs/);
  });
});
