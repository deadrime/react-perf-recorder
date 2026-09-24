import { useMemo, useCallback, useRef, memo, useContext, useState, createContext, useEffect, type ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { flushSync } from 'react-dom';
import { findRoots, fiberFromNode } from '../../src/core/fiber';
import { PluginHost } from '../../src/core/plugins';
import { scopeFromFiber } from '../../src/core/scope';
import { hookText, reasonText } from '../../src/shared/summary';
import { config, flush, makeRecorder, mount, reasonsOf } from './helpers';

type Setter = (n: number) => void;

describe('Recorder', () => {
  it('finds the component whose state started the cascade and counts what it pulled', () => {
    let bump!: Setter;
    const Leaf = () => <span>leaf</span>;
    const Counter = () => {
      const [n, setN] = useState(0);
      bump = setN;
      return (
        <div>
          {n}
          <Leaf />
          <Leaf />
        </div>
      );
    };
    const App = () => (
      <section>
        <Counter />
      </section>
    );
    mount(<App />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => bump(1));
    flush(() => bump(2));
    const rec = recorder.stop();

    expect(rec.totals.commits).toBe(2);
    expect(rec.roots).toHaveLength(1);
    const root = rec.roots[0];
    expect(root.name).toBe('Counter');
    expect(root.hits).toBe(2);
    expect(root.perHit).toBe(3);
    expect(reasonsOf(rec, root)[0]).toBe('state #0');
    expect(root.path).toBe('App');
  });

  it('marks a store subscription that returns a new array with the same content', () => {
    const store = createStore(() => ({ items: [1, 2], tick: 0 }));
    const List = () => {
      const items = useStore(store, (s) => s.items.map((x) => x));
      return <ul>{items.length}</ul>;
    };
    mount(<List />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => store.setState({ tick: 1 }));
    const rec = recorder.stop();

    expect(rec.roots[0].name).toBe('List');
    expect(reasonsOf(rec, rec.roots[0])[0]).toMatch(/^external store #\d SAME-CONTENT \(s\) => s\.items\.map/);
  });

  it('counts a render that changed nothing in the DOM', () => {
    const store = createStore(() => ({ a: 1, b: 1 }));
    const View = () => {
      useStore(
        store,
        useShallow((s) => ({ a: s.a, b: s.b }))
      );
      return <p>static</p>;
    };
    mount(<View />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => store.setState({ b: 2 }));
    const rec = recorder.stop();

    expect(rec.totals.renders).toBe(1);
    expect(rec.totals.rendersWithoutDom).toBe(1);
    expect(rec.roots[0].noDomChange).toBe(1);
  });

  it('a component that adds or removes rows under an element of its parent changed the DOM', () => {
    const store = createStore(() => ({ rows: ['a'] }));
    // The rows sit straight in the parent's <tbody>: the only DOM of Rows is the rows themselves.
    const Rows = () => (
      <>
        {useStore(store, (s) => s.rows).map((r) => (
          <tr key={r}>
            <td>{r}</td>
          </tr>
        ))}
      </>
    );
    const Table = () => (
      <table>
        <tbody>
          <Rows />
        </tbody>
      </table>
    );
    mount(<Table />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => store.setState({ rows: ['a', 'b'] }));
    flush(() => store.setState({ rows: ['a', 'b', 'c'] }));
    flush(() => store.setState({ rows: ['a', 'c'] }));
    const rec = recorder.stop();

    expect(rec.roots[0].name).toBe('Rows');
    expect(rec.roots[0].hits).toBe(3);
    expect(rec.roots[0].noDomChange).toBe(0);
    expect(rec.totals.rendersWithoutDom).toBe(0);
  });

  it('naming the hooks at stop leaves the refs a component writes in render as they were', () => {
    let close!: () => void;
    let tick!: Setter;
    // The useLatest of ahooks and react-use: the latest handler written into a ref on every render.
    const Menu = () => {
      const [open, setOpen] = useState(true);
      const [, setTick] = useState(0);
      tick = setTick;
      const latest = useRef(() => {});
      latest.current = () => setOpen(false);
      // Handed out by an effect, as a memoized callback reading the ref would be: the inspection runs no effects.
      useEffect(() => {
        close = () => latest.current();
      }, []);
      return <p data-testid="menu">{open ? 'open' : 'closed'}</p>;
    };
    mount(<Menu />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => tick(1));
    const rec = recorder.stop();
    expect(rec.roots[0].name).toBe('Menu');
    // Its hooks were named by running Menu once more; the handler in its ref must still close it.
    flush(() => close());
    expect(document.querySelector('[data-testid="menu"]')!.textContent).toBe('closed');
  });

  it('finds each instance of a memo with a compare function once', async () => {
    const { Engine } = await import('../../src/core/engine');
    const Row = memo(
      ({ n }: { n: number }) => <li>{n}</li>,
      (a, b) => a.n === b.n
    );
    Row.displayName = 'Row';
    (Row as unknown as { type: { displayName?: string } }).type.displayName = 'Row';
    mount(
      <ul>
        <Row n={1} />
        <Row n={2} />
      </ul>
    );
    const engine = new Engine({ ...config, endpoint: null }, new PluginHost([]));
    expect(engine.findComponents('Row')).toHaveLength(2);
  });

  it('keeps commit ids unique past the timeline limit, and points only at the commits it kept', () => {
    let set!: Setter;
    const Counter = () => {
      const [n, setN] = useState(0);
      set = setN;
      return <b>{n}</b>;
    };
    mount(<Counter />);
    const { recorder } = makeRecorder({ timeline: 3, bigCommit: 1 });
    recorder.start();
    for (let i = 1; i <= 6; i++) flush(() => set(i));
    const rec = recorder.stop();
    expect(rec.commits.truncated).toBe(true);
    expect(rec.commits.list.map((c) => c.i)).toEqual([0, 1, 2]);
    expect(rec.bigCommits).toEqual([0, 1, 2]);
    expect(rec.totals.commits).toBe(6);
  });

  it('a recording that stops at the length limit is still handed to whoever waits for it', async () => {
    const { Engine } = await import('../../src/core/engine');
    mount(<p>page</p>);
    const engine = new Engine({ ...config, endpoint: null, maxDurationMs: 30 }, new PluginHost([]));
    const saved: unknown[] = [];
    engine.onChange((state, rec) => state === 'saved' && saved.push(rec));
    // Asked for longer than the limit allows: the limit stops it, and record() answers with that stop.
    const rec = await engine.record(80, { source: 'test' });
    expect(rec.schema).toBe('react-perf-recorder/recording');
    expect(engine.recording).toBe(false);
    expect(saved).toEqual([rec]);
  });

  it('with sampled reasons works out parent reasons for 50 instances a commit, and counts every render', () => {
    let set!: Setter;
    const Item = ({ n }: { n: number }) => <li>{n}</li>;
    const List = () => {
      const [n, setN] = useState(0);
      set = setN;
      return (
        <ul>
          {Array.from({ length: 80 }, (_, i) => (
            <Item key={i} n={n} />
          ))}
        </ul>
      );
    };
    const run = (sampleReasons: boolean) => {
      mount(<List />);
      const { recorder } = makeRecorder({ sampleReasons });
      recorder.start();
      flush(() => set(1));
      flush(() => set(2));
      return recorder.stop();
    };
    const exact = run(false);
    const sampled = run(true);
    const item = (rec: typeof exact) => rec.components.find((c) => c.name === 'Item')!;
    expect(item(exact)).toMatchObject({ renders: 160, byParent: 160 });
    expect(item(exact).sampled).toBeUndefined();
    expect(item(exact).reasons.reduce((n, [, count]) => n + count, 0)).toBe(160);
    // The same renders counted; reasons for 50 of each commit's 80.
    expect(item(sampled)).toMatchObject({ renders: 160, byParent: 160, sampled: true });
    expect(item(sampled).reasons.reduce((n, [, count]) => n + count, 0)).toBe(100);
    expect(sampled.warnings.some((w) => w.includes('are a sample'))).toBe(true);
    expect(exact.warnings.some((w) => w.includes('are a sample'))).toBe(false);
  });

  it('keeps the way each render came down: the root and why, then the prop each parent handed on', () => {
    let set!: Setter;
    const Badge = ({ count }: { count: number }) => <b>{count}</b>;
    const Line = ({ online }: { online: number }) => (
      <p>
        <Badge count={online} />
      </p>
    );
    const Stats = () => {
      const [online, setOnline] = useState(0);
      set = setOnline;
      return <Line online={online} />;
    };
    mount(<Stats />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => set(1));
    flush(() => set(2));
    const rec = recorder.stop();
    const badge = rec.components.find((c) => c.name === 'Badge')!;
    expect(badge.chains).toHaveLength(1);
    const [{ n, links }] = badge.chains!;
    expect(n).toBe(2);
    expect(links.map((l) => l.name)).toEqual(['Stats', 'Line', 'Badge']);
    // The root is the report's root, with its own reason; each link below says what its parent changed.
    expect(rec.roots[links[0].root!].name).toBe('Stats');
    const text = (id?: number) => reasonText(rec.reasons.find((r) => r.i === id)!);
    expect(text(links[0].reason)).toMatch(/^state #0/);
    expect(text(links[1].reason)).toBe('parent: props online');
    expect(text(links[2].reason)).toBe('parent: props count');
    // The root itself has no chain: nothing above it.
    expect(rec.components.find((c) => c.name === 'Stats')!.chains).toBeUndefined();
  });

  it('keeps a way of twenty links whole, folds a longer one, and keeps none when recording fast', () => {
    let set!: Setter;
    const Leaf = ({ v }: { v: number }) => <i>{v}</i>;
    const levels = (depth: number) => {
      let Inner: (p: { v: number }) => JSX.Element = Leaf;
      for (let i = depth; i > 0; i--) {
        const Next = Inner;
        const Level = ({ v }: { v: number }) => <div>{<Next v={v} />}</div>;
        Object.defineProperty(Level, 'name', { value: `Level${i}` });
        Inner = Level;
      }
      return Inner;
    };
    const run = (depth: number, sampleReasons = false) => {
      const Top = levels(depth);
      const Root = () => {
        const [v, setV] = useState(0);
        set = setV;
        return <Top v={v} />;
      };
      mount(<Root />);
      const { recorder } = makeRecorder({ sampleReasons });
      recorder.start();
      flush(() => set(1));
      return recorder.stop().components.find((c) => c.name === 'Leaf')!;
    };
    // Root, 18 levels and the leaf: twenty links, all of them.
    expect(run(18).chains![0].links).toHaveLength(20);
    const long = run(28).chains![0].links;
    expect(long).toHaveLength(20);
    expect(long[3]).toEqual({ name: '…', skipped: 11 });
    expect(long.at(-1)!.name).toBe('Leaf');
    expect(run(5, true).chains).toBeUndefined();
  });

  it('lists the useMemo that recomputes on every render, and says which dependency moved', () => {
    let set!: Setter;
    const OPEN = { status: 'open' };
    const Report = () => {
      const [n, setN] = useState(0);
      set = setN;
      const filter = { status: 'open' };
      const inline = useMemo(() => [filter.status], [filter]);
      // No dependency array: allowed by React, not by its types.
      const always = (useMemo as unknown as (create: () => number) => number)(() => n * 2);
      const kept = useMemo(() => [OPEN.status], [OPEN]);
      const onPick = useCallback(() => setN(0), []);
      return (
        <p onClick={onPick}>
          {n} {inline.length} {always} {kept.length}
        </p>
      );
    };
    mount(<Report />);
    const { recorder } = makeRecorder();
    recorder.start();
    for (let i = 1; i <= 3; i++) flush(() => set(i));
    const rec = recorder.stop();
    const memos = rec.memos ?? [];
    // Two of the four remember nothing; the constant one and the callback keep their values.
    expect(memos.map((m) => [m.component, m.kind, m.renders, m.recomputed])).toEqual([
      ['Report', 'useMemo', 3, 3],
      ['Report', 'useMemo', 3, 3],
    ]);
    const [inline, always] = memos[0].noDeps ? [memos[1], memos[0]] : [memos[0], memos[1]];
    expect(inline.deps).toEqual([{ index: 0, changed: 3, sameContent: 3 }]);
    expect(always.noDeps).toBe(true);
    expect(inline.info?.type ?? inline.info?.path?.at(-1)).toMatch(/Memo/);
  });

  it('counts the first update after mount', () => {
    let show!: Setter;
    let bumpChild!: Setter;
    const Child = () => {
      const [n, setN] = useState(0);
      bumpChild = setN;
      return <i>{n}</i>;
    };
    const App = () => {
      const [visible, setVisible] = useState(0);
      show = setVisible;
      return <div>{visible ? <Child /> : null}</div>;
    };
    mount(<App />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => show(1));
    flush(() => bumpChild(1));
    const rec = recorder.stop();

    expect(rec.roots.map((r) => r.name)).toContain('Child');
  });

  it('records two synchronous commits in a row', () => {
    let bump!: Setter;
    const C = () => {
      const [n, setN] = useState(0);
      bump = setN;
      return <b>{n}</b>;
    };
    mount(<C />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => {
      flushSync(() => bump(1));
      flushSync(() => bump(2));
    });
    expect(recorder.stop().totals.commits).toBe(2);
  });

  it('refuses to start while another recorder holds the commit hook', () => {
    mount(<div />);
    const [root] = findRoots();
    const setter = Object.assign(() => {}, { owner: 'cascade-roots' });
    const value = root.current;
    Object.defineProperty(root, 'current', { configurable: true, get: () => value, set: setter });
    const { recorder } = makeRecorder();
    expect(() => recorder.start()).toThrow(/cascade-roots/);
    Object.defineProperty(root, 'current', { configurable: true, writable: true, value });
  });

  it('gives the same result with and without subtree pruning', () => {
    const setters: Setter[] = [];
    const Cell = ({ i }: { i: number }) => {
      const [n, setN] = useState(0);
      setters[i] = setN;
      return (
        <td>
          {i}:{n}
        </td>
      );
    };
    const Row = memo(({ from }: { from: number }) => (
      <tr>
        {[0, 1, 2].map((k) => (
          <Cell key={k} i={from + k} />
        ))}
      </tr>
    ));
    const Table = () => {
      const [rows, setRows] = useState(2);
      setters[100] = setRows;
      return (
        <table>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <Row key={r} from={r * 3} />
            ))}
          </tbody>
        </table>
      );
    };
    const run = (prune: boolean) => {
      mount(<Table />);
      const { recorder } = makeRecorder({ prune });
      recorder.start();
      let seed = 7;
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let step = 0; step < 40; step++) {
        const pick = Math.floor(random() * 7);
        flush(() => (pick === 6 ? setters[100](2 + Math.floor(random() * 2)) : setters[pick]?.(step)));
      }
      const rec = recorder.stop();
      return { renders: rec.totals.renders, roots: rec.roots.map((r) => [r.key, r.hits, r.cascade, reasonsOf(rec, r)]) };
    };
    expect(run(true)).toEqual(run(false));
  });

  describe('scope', () => {
    const setup = () => {
      const setters: Record<string, Setter> = {};
      const Theme = createContext(0);
      const Inner = () => {
        const [n, setN] = useState(0);
        setters.inner = setN;
        return <em>{n}</em>;
      };
      const Panel = () => {
        const theme = useContext(Theme);
        return (
          <div className="panel">
            {theme}
            <Inner />
          </div>
        );
      };
      const Sibling = () => {
        const [n, setN] = useState(0);
        setters.sibling = setN;
        return <aside>{n}</aside>;
      };
      const Page = () => {
        const [n, setN] = useState(0);
        setters.page = setN;
        return (
          <Theme.Provider value={0}>
            <main>
              {n}
              <Panel />
              <Sibling />
            </main>
          </Theme.Provider>
        );
      };
      const { container } = mount(<Page />);
      const panelFiber = fiberFromNode(container.querySelector('.panel'))!.return!;
      return { setters, scope: scopeFromFiber(panelFiber) };
    };

    it('ignores commits that do not touch the scope', () => {
      const { setters, scope } = setup();
      const { recorder } = makeRecorder({ scope });
      recorder.start();
      flush(() => setters.sibling(1));
      const rec = recorder.stop();
      expect(rec.totals.commits).toBe(1);
      expect(rec.totals.commitsInScope).toBe(0);
      expect(rec.totals.renders).toBe(0);
    });

    it('reports a root inside the scope', () => {
      const { setters, scope } = setup();
      const { recorder } = makeRecorder({ scope });
      recorder.start();
      flush(() => setters.inner(1));
      const rec = recorder.stop();
      expect(rec.scope?.name).toBe('Panel');
      expect(rec.roots.map((r) => r.name)).toEqual(['Inner']);
      expect(rec.outsideRoots).toHaveLength(0);
    });

    it('names the outside root when a parent re-renders the scope', () => {
      const { setters, scope } = setup();
      const { recorder } = makeRecorder({ scope });
      recorder.start();
      flush(() => setters.page(1));
      const rec = recorder.stop();
      expect(rec.roots).toHaveLength(0);
      expect(rec.outsideRoots[0].name).toBe('Page');
      expect(reasonsOf(rec, rec.outsideRoots[0])[0]).toBe('state #0');
      expect(rec.outsideRoots[0].scopeRenders).toBe(2);
      expect(rec.totals.rendersFromOutside).toBe(2);
    });
  });

  it('makes a child its own root when the rendering parent handed it the same props', () => {
    const store = createStore(() => ({ block: 0 }));
    const Status = () => <i>{useStore(store, (s) => s.block)}</i>;
    const Plain = () => <u>plain</u>;
    const Frame = ({ children }: { children: ReactNode }) => {
      useStore(store, (s) => s.block);
      return <div>{children}</div>;
    };
    mount(
      <Frame>
        <Status />
        <Plain />
      </Frame>
    );
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => store.setState({ block: 1 }));
    const rec = recorder.stop();
    expect(rec.roots.map((r) => [r.name, r.cascade])).toEqual([
      ['Frame', 1],
      ['Status', 1],
    ]);
  });

  it('names the custom hooks behind a hook reason', () => {
    const store = createStore(() => ({ price: 1 }));
    const usePrice = () => useStore(store, (s) => s.price);
    const useRow = () => {
      const [open] = useState(false);
      return { open, price: usePrice() };
    };
    const Row = () => {
      const { price } = useRow();
      return <td>{price}</td>;
    };
    mount(<Row />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => store.setState({ price: 2 }));
    const rec = recorder.stop();
    const root = rec.roots[0];
    const reason = rec.reasons[root.reasons[0][0]];
    const hook = root.hooks?.[reason.hook!];
    expect(hook?.path).toEqual(['useRow', 'usePrice', 'useStore', 'useSyncExternalStoreWithSelector', 'SyncExternalStore']);
    expect(hook?.type).toBe('useSyncExternalStore');
    expect(hook).toMatchObject({ library: 'zustand', libraryAt: 2 });
    expect(hookText(hook)).toMatch(/^useRow › usePrice › \[zustand\] useStore › useSyncExternalStoreWithSelector › SyncExternalStore/);
    expect(hookText(hook, 'short')).toMatch(/^useRow › usePrice › zustand\.useStore( @|$)/);
  });

  it('attaches plugin causes emitted before a commit', () => {
    const store = createStore(() => ({ v: 0 }));
    const V = () => <p>{useStore(store, (s) => s.v)}</p>;
    mount(<V />);
    const { recorder, host } = makeRecorder({}, [[{ name: 'store' }, undefined]]);
    recorder.start();
    flush(() => {
      host.emit('store', { type: 'v/set', changes: [{ key: 'v', prev: 0, next: 1 }] });
      store.setState({ v: 1 });
    });
    host.emit('store', { type: 'dropped' });
    const rec = recorder.stop();
    expect(rec.causes.find((c) => c.key === 'store:v/set')).toMatchObject({
      events: 1,
      commits: 1,
      keys: { v: { changed: 1, sameContent: 0, unknown: 0 } },
    });
    expect(rec.roots[0].causes[0][0]).toBe('store:v/set');
  });

  it('leaves effects-only components out of the render count after mount', () => {
    const Effectful = () => {
      useEffect(() => {}, []);
      return null;
    };
    mount(<Effectful />);
    const { recorder } = makeRecorder();
    recorder.start();
    expect(recorder.stop().totals.renders).toBe(0);
  });
});
