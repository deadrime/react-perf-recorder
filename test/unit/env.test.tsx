import { useEffect, useState } from 'react';
import { act } from 'react';
import { installTimers, scheduledByRecorder } from '../../src/core/env/timers';
import { Engine } from '../../src/core/engine';
import { fiberFromNode, isLibraryFiber } from '../../src/core/fiber';
import { LiveHighlight } from '../../src/core/live-highlight';
import type { HighlightSink } from '../../src/core/recorder';
import { scopeFromFiber } from '../../src/core/scope';
import { libraryOf } from '../../src/core/stack';
import { PluginHost } from '../../src/core/plugins';
import { Recorder } from '../../src/core/recorder';
import { config, flush, makeRecorder, mount } from './helpers';

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

describe('libraryOf', () => {
  it.each([
    ['http://localhost:5173/node_modules/.vite/deps/@tanstack_react-query.js?v=1a2b', '@tanstack/react-query'],
    ['http://localhost:5173/node_modules/.vite/deps/zustand_react_shallow.js?v=1a2b', 'zustand'],
    ['http://localhost:5173/.vite-eval/new/deps/react-hook-form.js?v=9', 'react-hook-form'],
    ['http://localhost:5173/node_modules/.vite/deps/chunk-LIAXWF56.js?v=1a2b', ''],
    ['http://localhost:5173/node_modules/.pnpm/zustand@4.5.7/node_modules/zustand/esm/index.mjs', 'zustand'],
    ['http://localhost:5173/src/components/Row.tsx?t=123', null],
  ])('%s → %s', (url, library) => {
    expect(libraryOf(url)).toBe(library);
  });
});

describe('app code and packages', () => {
  const fiber = (source: string | null, child?: object) =>
    ({ type: () => null, ...(source ? { _debugSource: { fileName: source, lineNumber: 1 } } : {}), child } as never);

  it('tells a component of the app from one of a package', () => {
    expect(isLibraryFiber(fiber('/proj/src/components/Row.tsx'))).toBe(false);
    expect(isLibraryFiber(fiber('/proj/node_modules/@chakra-ui/react/dist/index.js'))).toBe(true);
    // No source of its own (a route element, a lazy one): the JSX it rendered answers instead.
    const rendered = { _debugSource: { fileName: '/proj/src/pages/Dashboard.tsx', lineNumber: 4 } } as { _debugOwner?: unknown };
    const owner = fiber(null, rendered);
    rendered._debugOwner = owner;
    expect(isLibraryFiber(owner)).toBe(false);
    expect(isLibraryFiber(fiber(null))).toBe(true);
    // Written in app JSX but defined in a package: what it returned has no dev information at all.
    expect(isLibraryFiber(fiber('/proj/src/components/Row.tsx', {}))).toBe(true);
  });
});

describe('timer causes', () => {
  beforeAll(() => installTimers());

  it('names the interval that set state, and leaves timers that touch nothing', async () => {
    let quiet = 0;
    const Countdown = () => {
      const [n, setN] = useState(0);
      useEffect(() => {
        const tick = window.setInterval(() => setN((x) => x + 1), 5);
        const idle = window.setInterval(() => quiet++, 5);
        return () => {
          window.clearInterval(tick);
          window.clearInterval(idle);
        };
      }, []);
      return <b>{n}</b>;
    };
    const { unmount } = mount(<Countdown />);
    const { recorder } = makeRecorder();
    recorder.start();
    await act(() => sleep(40));
    const rec = recorder.stop();
    unmount();
    const keys = rec.causes.map((c) => c.key);
    expect(quiet).toBeGreaterThan(0);
    expect(keys.filter((k) => k.startsWith('core:timer'))).toEqual([
      expect.stringMatching(/^core:timer setInterval( \S+)? @ .*test\/unit\/env\.test\.tsx$/),
    ]);
    expect(rec.roots[0].causes[0][0]).toMatch(/^core:timer setInterval/);
  });
});

describe('timers of the recorder itself', () => {
  it('knows a timer the recorder scheduled from one the app did, by the code that called it', () => {
    // A stack as the wrapper sees it: its own frame first, then whoever called setTimeout.
    const here = new Error().stack!.split('\n');
    const wrapper = here[1];
    const app = here[1];
    const panel = here[1].replace(/test\/unit\/env\.test\.tsx/, 'src/ui/panel.ts');
    expect(panel).not.toBe(app);
    expect(scheduledByRecorder(['Error', wrapper, panel, app].join('\n'))).toBe(true);
    // The panel called by the app's code is still the panel's timer; the app's own timer is the app's.
    expect(scheduledByRecorder(['Error', wrapper, app, panel].join('\n'))).toBe(false);
  });
});

describe('highlight', () => {
  // Setters leave through an effect: hook naming re-runs render with a stand-in dispatcher and its no-op setters.
  const Ticker = ({ onSet }: { onSet: (set: (n: number) => void) => void }) => {
    const [n, setN] = useState(0);
    useEffect(() => onSet(setN), []);
    return <i data-testid="ticker">{n}</i>;
  };
  const Other = ({ onSet }: { onSet: (set: (n: number) => void) => void }) => {
    const [n, setN] = useState(0);
    useEffect(() => onSet(setN), []);
    return <u>{n}</u>;
  };

  it('marks a recording that drew outlines', () => {
    let set!: (n: number) => void;
    mount(<Ticker onSet={(s) => (set = s)} />);
    const sink: HighlightSink = { enabled: true, flash: vi.fn() };
    const recorder = new Recorder({ config, plugins: new PluginHost([]), ownHost: null, highlight: sink, onEvent: () => {} }, { source: 'test' });
    recorder.start();
    flush(() => set(1));
    const rec = recorder.stop();
    expect(sink.flash).toHaveBeenCalled();
    expect(rec.overhead.highlight).toBe(true);
    expect(rec.warnings.some((w) => w.startsWith('highlight was on'))).toBe(true);

    sink.enabled = false;
    const { recorder: clean } = makeRecorder();
    const off = new Recorder({ config, plugins: new PluginHost([]), ownHost: null, highlight: sink, onEvent: () => {} }, { source: 'test' });
    clean.start();
    clean.stop();
    off.start();
    flush(() => set(2));
    expect(off.stop().overhead.highlight).toBe(false);
  });

  it('outlines renders inside the area without a recording', () => {
    let tick!: (n: number) => void;
    let other!: (n: number) => void;
    const { container } = mount(
      <div>
        <Ticker onSet={(s) => (tick = s)} />
        <Other onSet={(s) => (other = s)} />
      </div>
    );
    const ticker = fiberFromNode(container.querySelector('[data-testid="ticker"]'))!.return!;
    const flashed: string[] = [];
    const live = new LiveHighlight({ flash: (pairs) => flashed.push(...pairs.map(([, name]) => name)) }, scopeFromFiber(ticker));
    expect(live.start()).toBe(true);
    flush(() => tick(1));
    flush(() => other(1));
    live.stop();
    flush(() => tick(2));
    expect(flashed).toEqual(['Ticker']);
  });

  it('hands the commit hook to a recording and takes it back after', async () => {
    let tick!: (n: number) => void;
    mount(<Ticker onSet={(s) => (tick = s)} />);
    const flashed: string[] = [];
    const engine = new Engine({ ...config, endpoint: null }, new PluginHost([]), { flash: (pairs) => flashed.push(...pairs.map(([, n]) => n)) });
    engine.highlightWhenIdle(true);
    expect(engine.idleHighlighting).toBe(true);
    engine.start({ source: 'test', highlight: false });
    expect(engine.idleHighlighting).toBe(false);
    flush(() => tick(1));
    await engine.stop();
    expect(flashed).toEqual([]);
    expect(engine.idleHighlighting).toBe(true);
    flush(() => tick(2));
    expect(flashed).toEqual(['Ticker']);
    engine.highlightWhenIdle(false);
    expect(engine.idleHighlighting).toBe(false);
  });
});
