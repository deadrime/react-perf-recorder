import { aggregateEvents } from '../../src/shared/aggregate';
import { compareRecordings } from '../../src/shared/compare';
import { lcpFindings, lcpSummaryLine, mountText } from '../../src/shared/lcp';
import { pageNodes, type LcpStats, type RecordingV2, type SessionMeta } from '../../src/shared/schema';
import { LcpWatcher, shortUrl } from '../../src/core/lcp';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

describe('the LCP watcher on a page', () => {
  let deliver: ((entries: unknown[]) => void) | null = null;
  let deliverResources: ((entries: unknown[]) => void) | null = null;
  const original = globalThis.PerformanceObserver;

  beforeEach(() => {
    class FakeObserver {
      static supportedEntryTypes = ['largest-contentful-paint', 'resource'];
      constructor(private callback: (list: { getEntries(): unknown[] }) => void) {}
      observe({ type }: { type: string }) {
        const give = (entries: unknown[]) => this.callback({ getEntries: () => entries });
        if (type === 'resource') deliverResources = give;
        else deliver = give;
      }
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
    deliverResources = null;
  });

  const paint = (element: Element | null, startTime: number, size = 1000, url = '') => ({
    startTime,
    size,
    element,
    url,
    renderTime: startTime,
    loadTime: 0,
  });
  const watcher = (more: { fromLoad?: boolean; t0?: number; ownHost?: Element | null; fresh?: boolean } = {}) => {
    const streamed: LcpStats[] = [];
    const w = new LcpWatcher({
      t0: more.t0 ?? 0,
      projectRoot: '',
      wrapperPattern: /^$/,
      ownHost: more.ownHost ?? null,
      fromLoad: more.fromLoad ?? true,
      onLcp: (lcp) => streamed.push(lcp),
    });
    w.start(more.fresh ?? true);
    return { w, streamed };
  };

  it('names the commit that put the image in, and a skeleton painted before it as a candidate', async () => {
    document.body.innerHTML = '<main><p class="skeleton">Loading products</p><div id="slot"></div></main>';
    const { w, streamed } = watcher();
    // The app's first commit, which put the skeleton in.
    w.commitDone(0);
    deliver!([paint(document.querySelector('.skeleton'), performance.now(), 800)]);
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    // Built first and put in at once, as React inserts a subtree.
    const figure = document.createElement('figure');
    figure.className = 'hero';
    figure.innerHTML = '<img alt="" src="/hero.jpg" loading="lazy">';
    document.getElementById('slot')!.appendChild(figure);
    w.noteRecords(observer.takeRecords(), true);
    w.commitDone(4);
    observer.disconnect();
    await nextFrame();
    deliver!([paint(document.querySelector('img'), performance.now(), 204800, `${location.origin}/hero.jpg`)]);
    const lcp = w.result()!;
    w.stop();
    expect(lcp.element).toMatchObject({ node: 'div#slot > figure.hero > img', kind: 'image', url: '/hero.jpg' });
    expect(lcp.mount).toMatchObject({ commit: 4, change: 'added', by: { node: 'main > div#slot > figure.hero' } });
    expect(lcp.image).toMatchObject({ lazy: true });
    expect(lcp.candidates).toHaveLength(1);
    expect(lcp.candidates[0].element).toMatchObject({ node: 'main > p.skeleton', kind: 'text' });
    // Each paint streams the whole story so far: a recording cut by a reload keeps the last one.
    expect(streamed.at(-1)).toEqual(lcp);
  });

  it('takes a source written into an image already there for what made it appear', async () => {
    document.body.innerHTML = '<img id="photo" alt="">';
    const { w } = watcher();
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, attributes: true });
    document.getElementById('photo')!.setAttribute('src', '/big.jpg');
    w.noteRecords(observer.takeRecords(), false);
    observer.disconnect();
    await nextFrame();
    deliver!([paint(document.getElementById('photo'), performance.now(), 5000, '/big.jpg')]);
    expect(w.result()!.mount).toMatchObject({ dom: true, change: 'attribute', name: 'src' });
    w.stop();
  });

  it('does not blame a change no frame has painted yet', () => {
    document.body.innerHTML = '<h1 id="title">Hello</h1>';
    const { w } = watcher();
    // Painted from the HTML; the text is written again before its paint is reported, and painted only after.
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, characterData: true, childList: true });
    document.getElementById('title')!.textContent = 'Hello again';
    w.noteRecords(observer.takeRecords(), true);
    w.commitDone(0);
    observer.disconnect();
    deliver!([paint(document.getElementById('title'), performance.now())]);
    expect(w.result()!.mount).toEqual({ before: true });
    w.stop();
  });

  it('leaves the section out of a recording that did not start with the load, unless the paint came during it', () => {
    document.body.innerHTML = '<h1>Hi</h1><p>there</p>';
    const t0 = performance.now();
    const before = watcher({ fromLoad: false, t0 });
    deliver!([paint(document.querySelector('h1'), t0 - 500)]);
    expect(before.w.result()).toBeUndefined();
    expect(before.streamed).toHaveLength(0);
    before.w.stop();

    const during = watcher({ fromLoad: false, t0 });
    deliver!([paint(document.querySelector('h1'), t0 - 500), paint(document.querySelector('p'), t0 + 200, 3000)]);
    const lcp = during.w.result()!;
    expect(lcp).toMatchObject({ atMs: 200, element: { node: 'p' } });
    // No commit of the recording put it there, and without the load nothing says it was in the HTML.
    expect(lcp.mount).toBeUndefined();
    during.w.stop();
  });

  it('stops noting changes at the first input, and says when it came', async () => {
    document.body.innerHTML = '<div id="slot"></div>';
    const { w } = watcher();
    // A scroll by script and a synthetic key stop nothing; a person's tap does.
    window.dispatchEvent(new Event('wheel'));
    window.dispatchEvent(new KeyboardEvent('keydown'));
    const tap = new Event('pointerdown');
    Object.defineProperty(tap, 'isTrusted', { value: true });
    window.dispatchEvent(tap);
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, childList: true });
    document.getElementById('slot')!.innerHTML = '<p>Late text</p>';
    w.noteRecords(observer.takeRecords(), true);
    w.commitDone(1);
    observer.disconnect();
    await nextFrame();
    deliver!([paint(document.querySelector('p'), performance.now())]);
    const lcp = w.result()!;
    expect(lcp.inputAtMs).toEqual(expect.any(Number));
    // Put in after the start, by a change no longer noted: neither a commit nor the HTML.
    expect(lcp.mount).toBeUndefined();
    w.stop();
  });

  it("takes no click on the panel, its Stop, for the page's input", () => {
    document.body.innerHTML = '<div id="host"><button>Stop</button></div><h1>Title</h1>';
    const { w } = watcher({ ownHost: document.getElementById('host') });
    const click = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(click, 'isTrusted', { value: true });
    document.querySelector('button')!.dispatchEvent(click);
    deliver!([paint(document.querySelector('h1'), performance.now(), 9000)]);
    expect(w.result()!.inputAtMs).toBeUndefined();
    w.stop();
  });

  it("leaves out the panel's own paints: its elements, and a paint of no element while it is on the page", () => {
    document.body.innerHTML = '<div id="host"></div><h1>Title</h1>';
    const host = document.getElementById('host')!;
    const { w } = watcher({ ownHost: host });
    deliver!([paint(null, performance.now(), 3444), paint(host, performance.now(), 5000)]);
    expect(w.result()).toBeUndefined();
    deliver!([paint(document.querySelector('h1'), performance.now(), 9000)]);
    expect(w.result()).toMatchObject({ element: { node: 'h1' }, candidates: [] });
    w.stop();
  });

  it('keeps the first candidates and the final one when a page paints many', () => {
    document.body.innerHTML = Array.from({ length: 15 }, (_, i) => `<p id="p${i}">row</p>`).join('');
    const { w } = watcher();
    deliver!(Array.from({ length: 15 }, (_, i) => paint(document.getElementById(`p${i}`), 10 + i, 100 + i)));
    const lcp = w.result()!;
    expect(lcp.element.node).toBe('p#p14');
    expect(lcp.candidates.map((c) => c.element.node)).toEqual(Array.from({ length: 10 }, (_, i) => `p#p${i}`));
    w.stop();
  });

  it('keeps an insertion when a style is written on the inserted node later, and takes new text for the content', async () => {
    document.body.innerHTML = '<div id="slot"></div><h1 id="title"></h1>';
    const { w } = watcher();
    w.commitDone(0);
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = '<img alt="" src="/hero.jpg">';
    document.getElementById('slot')!.appendChild(wrap);
    w.noteRecords(observer.takeRecords(), true);
    w.commitDone(5);
    await nextFrame();
    wrap.style.opacity = '1';
    document.getElementById('title')!.appendChild(document.createTextNode('Kitchen'));
    w.noteRecords(observer.takeRecords(), true);
    w.commitDone(6);
    observer.disconnect();
    await nextFrame();
    deliver!([paint(document.querySelector('img'), performance.now(), 5000, '/hero.jpg')]);
    expect(w.result()!.mount).toMatchObject({ commit: 5, change: 'added', by: { node: 'div#slot > div.wrap' } });
    deliver!([paint(document.getElementById('title'), performance.now(), 9000)]);
    expect(w.result()!.mount).toMatchObject({ commit: 6, change: 'text' });
    w.stop();
  });

  it('notes nothing in a recording that began after React committed, and claims no HTML', async () => {
    document.body.innerHTML = '<div id="slot"></div><h1>Rendered</h1>';
    const { w } = watcher({ fresh: false });
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, childList: true });
    document.getElementById('slot')!.innerHTML = '<p>Late</p>';
    w.noteRecords(observer.takeRecords(), true);
    w.commitDone(0);
    observer.disconnect();
    await nextFrame();
    deliver!([paint(document.querySelector('h1'), performance.now(), 800), paint(document.querySelector('p'), performance.now(), 900)]);
    expect(w.result()!.mount).toBeUndefined();
    expect(w.result()!.candidates[0].element.node).toBe('h1');
    w.stop();
  });

  it('times an image by the requests it saw come, past the page buffer a dev server fills', () => {
    document.body.innerHTML = '<img id="hero" alt="" src="/hero.jpg">';
    const { w } = watcher();
    const url = `${location.origin}/hero.jpg`;
    deliverResources!([
      { name: `${location.origin}/src/main.tsx`, initiatorType: 'script', startTime: 5, requestStart: 5, responseEnd: 9 },
      { name: url, initiatorType: 'img', startTime: 300, requestStart: 310, responseEnd: 700 },
    ]);
    deliver!([paint(document.getElementById('hero'), 720, 5000, url)]);
    const lcp = w.result()!;
    expect(lcp.image).toMatchObject({ initiator: 'img', responseEndMs: 700 });
    expect(lcp.phases.loadDuration).toBe(390);
    w.stop();
  });
});

describe('short urls', () => {
  it('drops the origin of the page and the data of a data: url', () => {
    expect(shortUrl(`${location.origin}/img/a.png?w=2`)).toBe('/img/a.png?w=2');
    expect(shortUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(shortUrl('data:image/png;base64,AAAA')).toBe('data:image/png,…');
  });
});

const lcp = (more: Partial<LcpStats> = {}): LcpStats => ({
  ms: 1310,
  atMs: 1010,
  size: 204800,
  element: { component: 'HeroImage', file: 'src/Hero.tsx:12', node: 'main > img.hero', kind: 'image', url: '/hero.jpg' },
  phases: { ttfb: 20, loadDelay: 960, loadDuration: 300, renderDelay: 30 },
  mount: { commit: 3, atMs: 680, ms: 980, change: 'added' },
  image: { initiator: 'img', requestMs: 982, responseEndMs: 1280 },
  candidates: [{ ms: 350, atMs: 50, size: 900, element: { component: 'Header', node: 'main > p', kind: 'text' } }],
  ...more,
});

const rec = (more: Partial<RecordingV2> = {}) =>
  ({
    commits: { list: [{ i: 3, atMs: 680, renders: 2, causeIds: [0] }], truncated: false },
    causes: [{ i: 0, key: 'core:timer setTimeout @ src/Hero.tsx', plugin: 'core', type: '', events: 1, commits: 1 }],
    frames: { longTasks: { count: 0, maxMs: 0, totalMs: 0 }, loaf: [] },
    lcp: lcp(),
    ...more,
  } as unknown as RecordingV2);

describe('reading the largest paint', () => {
  it('leads with the request that waited for the commit which mounted the image, with that commit’s cause', () => {
    const findings = lcpFindings(rec(), lcp());
    expect(findings[0]).toBe(
      'load delay 960ms: the image was requested only when it was mounted in commit 3 (core:timer setTimeout @ src/Hero.tsx) at 0.98s; a preload or server rendering starts it at the first byte'
    );
    expect(lcpSummaryLine(rec())).toMatch(
      /^LCP 1\.31s: img\.hero in HeroImage \(src\/Hero\.tsx:12\), \/hero\.jpg; load delay 960ms: .*; section lcp$/
    );
  });

  it('names what ran between the image arriving and its paint', () => {
    const held = lcp({
      phases: { ttfb: 20, loadDelay: 10, loadDuration: 100, renderDelay: 400 },
      mount: { before: true },
      image: { initiator: 'img' },
    });
    const r = rec({
      lcp: held,
      commits: { list: [{ i: 5, atMs: 700, renders: 40, ms: 380 }], truncated: false },
      frames: { longTasks: { count: 1, maxMs: 390, totalMs: 390 }, loaf: [{ atMs: 650, duration: 400, blocking: 350, commits: 1, scripts: [] }] },
    } as Partial<RecordingV2>);
    const findings = lcpFindings(r, held);
    expect(findings[0]).toBe(
      '400ms from the image arriving to the paint: 1 long frame (350ms blocking) and 1 commit (380ms rendering) ran in between'
    );
    expect(findings).toContain("the element was in the page's HTML before React's first commit: server-rendered");
  });

  it('for text, counts only what ran after its mount, and names a web font that came before the paint', () => {
    const text = lcp({
      element: { component: 'Title', node: 'h1', kind: 'text' },
      phases: { ttfb: 10, loadDelay: 0, loadDuration: 0, renderDelay: 900 },
      mount: { commit: null, first: true, atMs: 300, ms: 600, change: 'added' },
      image: undefined,
      font: { url: '/fonts/inter.woff2', ms: 880 },
      ms: 910,
      atMs: 610,
    });
    const findings = lcpFindings(
      rec({
        lcp: text,
        frames: { longTasks: { count: 0, maxMs: 0, totalMs: 0 }, loaf: [{ atMs: 100, duration: 150, blocking: 100, commits: 0, scripts: [] }] },
      } as Partial<RecordingV2>),
      text
    );
    expect(findings[0]).toBe("render delay 900ms: the text was mounted in React's first commit at 0.60s");
    // The long frame before the mount is part of the wait for it, not of the paint.
    expect(findings.some((f) => f.includes('long frame'))).toBe(false);
    expect(findings).toContain('the text painted after web font /fonts/inter.woff2 arrived at 0.88s');
  });

  it('counts nothing after the mount when the paint is stamped before it, at the start of a long frame', () => {
    const text = lcp({
      element: { component: 'IssueRow', node: 'td', kind: 'text' },
      phases: { ttfb: 6, loadDelay: 0, loadDuration: 0, renderDelay: 430 },
      mount: { commit: 3, atMs: 560, ms: 560, change: 'added' },
      image: undefined,
      ms: 436,
      atMs: 436,
    });
    const r = rec({
      lcp: text,
      frames: { longTasks: { count: 1, maxMs: 136, totalMs: 136 }, loaf: [{ atMs: 420, duration: 200, blocking: 136, commits: 1, scripts: [] }] },
    } as Partial<RecordingV2>);
    expect(lcpFindings(r, text).some((f) => f.includes('to the paint'))).toBe(false);
  });

  it('says a lazy image holds its request', () => {
    const lazy = lcp({ mount: { before: true }, image: { lazy: true, initiator: 'img', requestMs: 400 } });
    expect(lcpFindings(rec({ lcp: lazy }), lazy)[0]).toMatch(/loading="lazy"/);
  });

  it('words each way an element got on the page', () => {
    expect(mountText({ dom: true, atMs: 0, ms: 10, change: 'attribute', name: 'src' })).toBe(
      'its src set outside a React commit (an effect, a timer or a library)'
    );
    expect(mountText({ commit: 0, first: true, atMs: 0, ms: 10, change: 'added', by: { component: 'Page', node: 'main' } })).toBe(
      "mounted with Page in commit 0, React's first"
    );
  });
});

describe('the largest paint in a recording', () => {
  it('is rebuilt from the last one streamed, and its nodes are mapped with the rest', () => {
    const meta = { conditions: {}, page: { url: '' }, scope: null, source: 'panel', createdAt: '' } as unknown as SessionMeta;
    const first = lcp({ ms: 300 });
    const last = lcp();
    const partial = aggregateEvents(meta, [
      { k: 'lcp', lcp: first },
      { k: 'lcp', lcp: last },
      { k: 'end', atMs: 2000 },
    ]);
    expect(partial.lcp).toEqual(last);
    expect(pageNodes(partial).map((n) => n.node)).toEqual(['main > img.hero', 'main > p']);
  });

  it('is compared by its time, each phase, and whether it is still the same element', () => {
    const before = { ...rec(), shifts: undefined } as RecordingV2;
    const after = { ...rec({ lcp: lcp({ ms: 520, phases: { ttfb: 20, loadDelay: 170, loadDuration: 300, renderDelay: 30 } }) }) } as RecordingV2;
    const base = {
      page: { url: 'http://x/' },
      scope: null,
      durationMs: 1000,
      totals: { renders: 0, commits: 0 },
      roots: [],
      outsideRoots: [],
      actions: [],
      segments: [],
      causes: [],
      conditions: {},
      plugins: {},
      components: [],
    };
    const out = compareRecordings({ ...base, ...before } as RecordingV2, { ...base, ...after } as RecordingV2) as { lcp?: unknown };
    expect(out.lcp).toMatchObject({
      ms: { before: 1310, after: 520, delta: -790 },
      phases: { loadDelay: { delta: -790 } },
      element: 'img.hero in HeroImage (src/Hero.tsx:12)',
    });
  });
});
