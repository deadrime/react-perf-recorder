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
    // Rolldown (Vite 8) names a shared chunk after a module in it, with a hash; a package's name is lower case.
    ['http://localhost:5173/node_modules/.vite/deps/react-dom-DVjBvCsW.js?v=1a2b', ''],
    ['http://localhost:5173/node_modules/.vite/deps/react-dom-Dv-j_c9w.js?v=1a2b', ''],
    ['http://localhost:5173/node_modules/.vite/deps/vanilla-A1B2C3D4.js', ''],
    ['http://localhost:5173/node_modules/.vite/deps/react-markdown.js?v=1a2b', 'react-markdown'],
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

  it('leaves a timer the update that was waiting for its render before it ran', async () => {
    let bump!: () => void;
    const Panel = () => {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return <b>{n}</b>;
    };
    const { unmount } = mount(<Panel />);
    const { recorder } = makeRecorder();
    recorder.start();
    // An effect's setState still waiting, then a frame callback that only scrolls: the update is not the frame's.
    await act(async () => {
      bump();
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    const rec = recorder.stop();
    unmount();
    expect(rec.roots[0].hits).toBe(1);
    expect(rec.causes.map((c) => c.key).filter((k) => k.startsWith('core:timer'))).toEqual([]);
  });
});

describe('update origins', () => {
  it('names each update of one lane by its own code, not by the first', () => {
    let setPush!: (n: number) => void;
    let setMedia!: (n: number) => void;
    const Push = () => {
      const [n, set] = useState(0);
      setPush = set;
      return <b>{n}</b>;
    };
    const Media = () => {
      const [n, set] = useState(0);
      setMedia = set;
      return <i>{n}</i>;
    };
    // Two effects of one flush: web push asks first, the media query after it, in the same lane.
    function subscribePush() {
      setPush(1);
    }
    function matchMedia() {
      setMedia(1);
    }
    const { unmount } = mount(
      <>
        <Push />
        <Media />
      </>
    );
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => {
      subscribePush();
      matchMedia();
    });
    const rec = recorder.stop();
    unmount();
    const causesOf = (name: string) => rec.roots.find((r) => r.name === name)!.causes.map(([key]) => key);
    expect(causesOf('Push')).toEqual([expect.stringMatching(/^core:update subscribePush @/)]);
    expect(causesOf('Media')).toEqual([expect.stringMatching(/^core:update matchMedia @/)]);
  });

  it("leaves an update no origin was taken for without the others' causes", () => {
    // More updates in one flush than the recorder notes origins for: the last ones are told by nothing.
    const setters: Array<(n: number) => void> = [];
    const Cell = ({ i }: { i: number }) => {
      const [n, set] = useState(0);
      setters[i] = set;
      return <b>{n}</b>;
    };
    const Last = () => {
      const [n, set] = useState(0);
      setters[20] = set;
      return <i>{n}</i>;
    };
    const { unmount } = mount(
      <>
        {Array.from({ length: 20 }, (_, i) => (
          <Cell key={i} i={i} />
        ))}
        <Last />
      </>
    );
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => setters.forEach((set) => set(1)));
    const rec = recorder.stop();
    unmount();
    expect(rec.roots.find((r) => r.name === 'Last')!.causes.map(([key]) => key)).toEqual(['core:none']);
  });

  it('does not hand a root the origin of a fiber that rendered under it', () => {
    const setters: Array<(n: number) => void> = [];
    let setPwa!: (n: number) => void;
    let setMedia!: (n: number) => void;
    const Filler = ({ i }: { i: number }) => {
      const [n, set] = useState(0);
      setters[i] = set;
      return <b>{n}</b>;
    };
    const Pwa = () => {
      const [n, set] = useState(0);
      setPwa = set;
      return <u>{n}</u>;
    };
    // The page updates itself too, after the recorder stopped noting origins; its child's origin is not its own.
    const Page = () => {
      const [n, set] = useState(0);
      setMedia = set;
      return (
        <section>
          {n}
          <Pwa />
        </section>
      );
    };
    const { unmount } = mount(
      <>
        {Array.from({ length: 12 }, (_, i) => (
          <Filler key={i} i={i} />
        ))}
        <Page />
      </>
    );
    const { recorder } = makeRecorder();
    recorder.start();
    function installPrompt() {
      setPwa(1);
    }
    flush(() => {
      installPrompt();
      setters.forEach((set) => set(1));
      setMedia(1);
    });
    const rec = recorder.stop();
    unmount();
    expect(rec.roots.find((r) => r.name === 'Page')!.causes.map(([key]) => key)).toEqual(['core:none']);
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
