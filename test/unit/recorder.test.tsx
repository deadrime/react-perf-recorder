import { useRef, memo, useContext, useState, createContext, useEffect, type ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { flushSync } from 'react-dom';
import { findRoots, fiberFromNode } from '../../src/core/fiber';
import { scopeFromFiber } from '../../src/core/scope';
import { hookText } from '../../src/shared/summary';
import { flush, makeRecorder, mount, reasonsOf } from './helpers';

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
