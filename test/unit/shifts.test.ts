import { aggregateEvents } from '../../src/shared/aggregate';
import { compareRecordings } from '../../src/shared/compare';
import type { LayoutShift, SessionMeta, ShiftCause } from '../../src/shared/schema';
import { clsOf, runText, shiftRuns } from '../../src/shared/shifts';
import { nearest, nodePath, ShiftWatcher, whereOf } from '../../src/core/shifts';

const shift = (atMs: number, value: number, more: Partial<LayoutShift> = {}): LayoutShift => ({
  atMs,
  value,
  hadRecentInput: false,
  cause: { unknown: true },
  sources: [{ component: 'List', file: 'src/List.tsx:4', node: 'main > ul', from: [0, 100, 300, 400], to: [0, 220, 300, 400] }],
  ...more,
});

describe('CLS as web-vitals counts it', () => {
  it('keeps a window open while shifts come less than a second apart, and starts a new one at exactly a second', () => {
    expect(clsOf([shift(0, 0.1), shift(999, 0.1)]).value).toBe(0.2);
    const apart = clsOf([shift(0, 0.1), shift(1000, 0.15)]);
    expect(apart.value).toBe(0.15);
    expect(apart.windowAtMs).toBe(1000);
  });

  it('closes a window at five seconds, however close the shifts', () => {
    const steady = Array.from({ length: 11 }, (_, i) => shift(i * 500, 0.1));
    // 0..4500 is one window of ten; the one at 5000 starts the next.
    expect(clsOf(steady).value).toBe(1);
  });

  it('leaves out shifts after an input, and counts none when all of them came after one', () => {
    const all = clsOf([shift(0, 0.3, { hadRecentInput: true }), shift(100, 0.2, { hadRecentInput: true })]);
    expect(all.value).toBe(0);
    expect(all.windowAtMs).toBeNull();
    expect(all.excluded).toBe(0.5);
    expect(all.count).toBe(2);
  });

  it('takes one huge shift as the whole CLS', () => {
    expect(clsOf([shift(0, 0.01), shift(3000, 0.9), shift(9000, 0.02)]).value).toBe(0.9);
  });

  it('counts as a near miss what a slower device would likely count: animations, and inputs 300–500 ms before', () => {
    const animated: ShiftCause = { animation: 'inline-style' };
    const totals = clsOf([
      shift(0, 0.05, { hadRecentInput: true, sinceInputMs: 40, cause: animated }),
      shift(20, 0.04, { hadRecentInput: true, sinceInputMs: 60 }),
      shift(400, 0.03, { hadRecentInput: true, sinceInputMs: 420 }),
    ]);
    expect(totals.nearMiss).toBe(0.08);
    expect(totals.excluded).toBe(0.12);
  });
});

describe('reading shifts', () => {
  it('makes one line of an element shifting frame after frame for one reason', () => {
    const cause: ShiftCause = {
      animation: 'inline-style',
      by: { component: 'Sheet', file: 'src/Sheet.tsx:9', node: 'div.sheet', where: 'self', change: 'attribute', name: 'style' },
    };
    const frames = Array.from({ length: 12 }, (_, i) =>
      shift(1000 + i * 16, 0.01, {
        hadRecentInput: i < 8,
        sinceInputMs: 100 + i * 16,
        cause,
        sources: [
          {
            component: 'Sheet',
            file: 'src/Sheet.tsx:9',
            node: 'div.sheet',
            from: [0, 800 - i * 20, 400, 20 + i * 20],
            to: [0, 780 - i * 20, 400, 40 + i * 20],
          },
        ],
      })
    );
    const runs = shiftRuns([...frames, shift(5000, 0.05)]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ count: 12, value: 0.12, counted: 0.04, excluded: 8 });
    const line = runText(runs[0]);
    expect(line).toContain('Sheet (src/Sheet.tsx:9) moved up 240px over 12 frames');
    expect(line).toContain('style written on it from script frame after frame');
    expect(line).toContain('4 counted, 8 excluded after an input');
  });

  it('names the component a commit mounted above the element, and the commit with its causes', () => {
    const cause: ShiftCause = {
      commit: 3,
      atMs: 1200,
      by: { component: 'PromoBanner', file: 'src/PromoBanner.tsx:2', node: 'div.promo', where: 'before', change: 'added' },
    };
    const rec = {
      causes: [{ i: 0, key: 'react-query:fetch products', plugin: 'react-query', type: 'fetch products', events: 1, commits: 1 }],
      commits: { list: [{ i: 3, atMs: 1200, renders: 4, causeIds: [0] }], truncated: false },
    };
    const line = runText(shiftRuns([shift(1206, 0.089, { cause })])[0], rec);
    expect(line).toBe(
      '0.089 List (src/List.tsx:4) moved down 120px at 1.21s: PromoBanner (src/PromoBanner.tsx:2) mounted above it in commit 3 (react-query:fetch products); counted'
    );
  });
});

describe('where a change is from the element that moved', () => {
  beforeEach(() => {
    document.body.innerHTML = `<main id="page"><header id="top"></header><div id="slot"></div><ul id="list" class="list"><li id="row">a</li></ul></main><footer id="end"></footer>`;
  });
  const $ = (id: string) => document.getElementById(id)!;

  it('tells an element above from one below, one inside and an ancestor', () => {
    const list = $('list');
    expect(whereOf({ node: $('slot'), how: 'added' }, list)).toBe('before');
    expect(whereOf({ node: $('end'), how: 'added' }, list)).toBeNull();
    expect(whereOf({ node: $('row'), how: 'text' }, list)).toBe('inside');
    expect(whereOf({ node: $('page'), how: 'attribute' }, list)).toBe('ancestor');
    expect(whereOf({ node: list, how: 'attribute' }, list)).toBe('self');
    // A node removed right before the list leaves the list itself as the next sibling.
    expect(whereOf({ node: list, how: 'removed' }, list)).toBe('before');
    // Removed at the end of the page's main: what follows main moves, not what is in it.
    expect(whereOf({ node: $('page'), how: 'removed', atEnd: true }, $('end'))).toBe('before');
    expect(whereOf({ node: $('page'), how: 'removed', atEnd: true }, list)).toBeNull();
  });

  it('picks the change nearest the element: the one right above it over one further up', () => {
    const list = $('list');
    const found = nearest(
      [
        { node: $('top'), how: 'added' as const, id: 'top' },
        { node: $('slot'), how: 'added' as const, id: 'slot' },
        { node: $('row'), how: 'text' as const, id: 'row' },
      ],
      list
    );
    expect(found).toMatchObject({ where: 'before', candidate: { id: 'slot' } });
  });

  it('writes a short DOM path without hashed class names', () => {
    document.body.innerHTML = '<main><div class="css-1x2y3z sheet"><p data-testid="note">x</p></div></main>';
    expect(nodePath(document.querySelector('p'))).toBe('main > div.sheet > p[data-testid="note"]');
  });
});

describe('the watcher on a page', () => {
  let deliver: ((entries: unknown[]) => void) | null = null;
  const original = globalThis.PerformanceObserver;

  beforeEach(() => {
    class FakeObserver {
      static supportedEntryTypes = ['layout-shift'];
      constructor(callback: (list: { getEntries(): unknown[] }) => void) {
        deliver = (entries) => callback({ getEntries: () => entries });
      }
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    globalThis.PerformanceObserver = FakeObserver as unknown as typeof PerformanceObserver;
  });
  afterEach(() => {
    globalThis.PerformanceObserver = original;
    deliver = null;
  });

  const rect = (y: number) => ({ x: 0, y, width: 300, height: 100 } as DOMRectReadOnly);
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

  it('blames the element a commit added above the one that moved, and a style written between commits on it', async () => {
    document.body.innerHTML = '<div id="slot"></div><ul id="list"></ul><div id="sheet"></div>';
    const shifts: LayoutShift[] = [];
    const watcher = new ShiftWatcher({ t0: 0, projectRoot: '', wrapperPattern: /^$/, ownHost: null, onShift: (s) => shifts.push(s) });
    watcher.start();
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });

    document.getElementById('slot')!.innerHTML = '<div class="promo">sale</div>';
    watcher.noteRecords(observer.takeRecords(), true);
    watcher.commitDone(7);
    await nextFrame();
    deliver!([
      {
        startTime: performance.now(),
        value: 0.08,
        hadRecentInput: false,
        sources: [{ node: document.getElementById('list'), previousRect: rect(0), currentRect: rect(40) }],
      },
    ]);

    document.getElementById('sheet')!.style.height = '120px';
    watcher.noteRecords(observer.takeRecords(), false);
    await nextFrame();
    deliver!([
      {
        startTime: performance.now(),
        value: 0.02,
        hadRecentInput: true,
        sources: [{ node: document.getElementById('sheet'), previousRect: rect(500), currentRect: rect(380) }],
      },
    ]);
    observer.disconnect();

    expect(shifts[0].cause).toMatchObject({ commit: 7, by: { node: 'div#slot > div.promo', where: 'before', change: 'added' } });
    expect(shifts[0].sources[0]).toMatchObject({ node: 'ul#list', from: [0, 0, 300, 100], to: [0, 40, 300, 100] });
    // The commit's change was painted with the first shift: the second frame has only the style.
    expect(shifts[1].cause).toMatchObject({
      animation: 'inline-style',
      by: { node: 'div#sheet', where: 'self', change: 'attribute', name: 'style' },
    });
    const stats = watcher.result([]);
    expect(stats.cls).toMatchObject({ value: 0.08, excluded: 0.02, nearMiss: 0.02 });
    watcher.stop();
  });

  it('blames an image with no size when it loads a frame after it was mounted', async () => {
    document.body.innerHTML = '<div id="slot"><img class="photo" alt=""></div><ul id="list"></ul>';
    const shifts: LayoutShift[] = [];
    const watcher = new ShiftWatcher({ t0: 0, projectRoot: '', wrapperPattern: /^$/, ownHost: null, onShift: (s) => shifts.push(s) });
    watcher.start();
    document.querySelector('img')!.dispatchEvent(new Event('load'));
    await nextFrame();
    deliver!([
      {
        startTime: performance.now(),
        value: 0.05,
        hadRecentInput: false,
        sources: [{ node: document.getElementById('list'), previousRect: rect(0), currentRect: rect(160) }],
      },
    ]);
    watcher.stop();
    expect(shifts[0].cause).toMatchObject({ resource: 'image', by: { node: 'div#slot > img.photo', where: 'before', change: 'loaded' } });
    expect(runText(shiftRuns(shifts)[0])).toContain('div#slot > img.photo loaded with no size set above it');
  });
});

describe('shifts in a partial recording and in a comparison', () => {
  const meta: SessionMeta = {
    schema: 'react-perf-recorder/session',
    version: 1,
    id: '20260930-120000-app-panel-abcd',
    status: 'recording',
    createdAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-09-30T12:00:10.000Z',
    source: 'panel',
    page: { url: 'http://localhost:5173/', title: 't', viewport: '1280×720', dpr: 1, userAgent: 'x' },
    scope: null,
    conditions: { viewport: '1280×720' },
    plugins: [],
    events: 0,
    reloads: 0,
  };

  it('rebuilds them from streamed events, and compares CLS and each element that moved', () => {
    const before = aggregateEvents(meta, [
      { k: 'shift', shift: shift(100, 0.2) },
      { k: 'end', atMs: 1000 },
    ]);
    const after = aggregateEvents(meta, [
      { k: 'shift', shift: shift(100, 0.02) },
      { k: 'end', atMs: 1000 },
    ]);
    expect(before.shifts?.cls.value).toBe(0.2);
    const diff = compareRecordings(before, after);
    expect(diff.shifts?.cls).toMatchObject({ before: 0.2, after: 0.02 });
    expect(diff.shifts?.moved[0]).toMatchObject({ key: 'List (src/List.tsx:4)', before: 0.2, after: 0.02 });
    expect(aggregateEvents(meta, [{ k: 'end', atMs: 1000 }]).shifts).toBeUndefined();
  });
});
