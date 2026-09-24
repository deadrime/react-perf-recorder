// @vitest-environment node
import { aggregateEvents } from '../../src/shared/aggregate';
import { compareDigests, compareRecordings, digestOf } from '../../src/shared/compare';
import { summarize, waysOf, wayText } from '../../src/shared/summary';
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
  { k: 'reason', info: { i: 0, kind: 'store', hook: 2, selector: 'selectRow', text: 'external store #2 selectRow' } },
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
    expect(rec.roots[0]).toMatchObject({ name: 'Row', hits: 2, cascade: 60, reasons: [[0, 2]] });
    expect(rec.reasons[0]).toMatchObject({ kind: 'store', hook: 2, selector: 'selectRow' });
    const summary = summarize(rec);
    expect(summary.actions[0]).toMatchObject({ what: 'click «refresh»', renders: 60 });
    expect(summary.topCauses[0]).toMatchObject({ key: 'zustand:rows/set', commits: 2 });
  });

  it('folds ways through the same components into one, props of each link together', () => {
    const rec = aggregateEvents(meta, events(3));
    rec.roots[0].causes = [['core:timer setInterval', 3]];
    rec.reasons.push(
      { i: 10, kind: 'parent', changed: ['renders'] },
      { i: 11, kind: 'parent', changed: ['over', 'renders'] },
      { i: 12, kind: 'parent', equal: true }
    );
    const ways = waysOf(rec, [
      {
        n: 2,
        links: [
          { name: 'Row', root: 0, reason: 0 },
          { name: 'Due', reason: 11 },
        ],
      },
      {
        n: 1,
        links: [
          { name: 'Row', root: 0, reason: 0 },
          { name: 'Due', reason: 10 },
        ],
      },
      {
        n: 1,
        links: [
          { name: 'Row', root: 0, reason: 0 },
          { name: 'Item', reason: 12 },
          { name: 'Due', reason: 10 },
        ],
      },
    ]);
    expect(ways.map(wayText)).toEqual([
      'core:timer setInterval › Row · external store #2 selectRow › Due · props over, renders',
      'core:timer setInterval › Row · external store #2 selectRow › Item · props equal › Due · prop renders',
    ]);
    expect(ways.map((w) => w.n)).toEqual([3, 1]);
    expect(ways[1].steps[1]).toMatchObject({ equal: true });
  });

  it('leaves out a plugin that found nothing of its library', () => {
    const rec = aggregateEvents(meta, events(3));
    rec.plugins = { 'react-query': { version: 1, highlights: [] }, zustand: { version: 1, highlights: ['rows: 2 updates'] } };
    expect(Object.keys(summarize(rec).plugins)).toEqual(['zustand']);
  });

  it('compares roots, causes and the same action before and after', () => {
    const before = aggregateEvents(meta, events(30));
    const after = aggregateEvents({ ...meta, id: '20260919-120100-app-panel-beef' }, events(3));
    const result = compareRecordings(before, after);
    expect(result.roots[0]).toMatchObject({ root: 'Row', status: 'changed', perHit: { before: 30, after: 3, delta: -27, pct: -90 } });
    // The reaction to the click only: the commit at 900ms came from no event and is background.
    expect(result.actions[0]).toMatchObject({ action: 'click «refresh»', per: 'action', renders: { before: 30, after: 3 } });
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

  it('warns when only one run drew the highlight', () => {
    const before = aggregateEvents(meta, events(30));
    const after = aggregateEvents(meta, events(30));
    after.overhead = { ...after.overhead, highlight: true };
    const result = compareRecordings(before, after);
    expect(result.comparable).toBe(false);
    expect(result.warnings.some((w) => w.startsWith('highlight was on only after'))).toBe(true);
  });

  it('compares the same actions by their median, however many times each was done', () => {
    const clicks = (times: number, renders: number): SessionEvent[] => [
      { k: 'root', i: 0, key: 'List|src/List.tsx:1|App', name: 'List', source: 'src/List.tsx:1', path: 'App' },
      ...Array.from({ length: times }, (_, i): SessionEvent[] => [
        {
          k: 'action',
          action: {
            id: i + 1,
            kind: 'click',
            atMs: 100 + i * 2000,
            endMs: 100 + i * 2000,
            target: { tag: 'button', text: 'Add', component: 'Todo' },
          },
        },
        { k: 'commit', t: 110 + i * 2000, n: renders + (i % 2), event: 'click', roots: [[0, renders, []]] },
      ]).flat(),
      { k: 'commit', t: 50, n: 4, roots: [[0, 4, []]] },
      { k: 'end', atMs: 100 + times * 2000 },
    ];
    const before = digestOf(aggregateEvents(meta, clicks(3, 40)));
    const after = digestOf(aggregateEvents({ ...meta, id: 'b' }, clicks(6, 6)));
    expect(before.actions[0]).toMatchObject({ what: 'click «Add» in Todo', n: 3, per: 'action', renders: 40 });
    const result = compareDigests(before, after);
    expect(result.comparable).toBe(true);
    expect(result.actions[0]).toMatchObject({ times: { before: 3, after: 6 }, renders: { before: 40, after: 6.5, pct: -84 } });
    expect(result.unmatched).toEqual({ before: [], after: [] });
    expect(compareDigests(before, { ...after, area: 'Todo' }).comparable).toBe(false);
  });
});
