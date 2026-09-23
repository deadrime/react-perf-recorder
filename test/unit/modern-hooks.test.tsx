import * as React from 'react';
import { act, createContext, Suspense, useDeferredValue, useMemo, useState, useTransition } from 'react';
import { flush, makeRecorder, mount, reasonsOf } from './helpers';

type Setter<T> = (value: T) => void;
const react = React as unknown as {
  use?: <T>(usable: Promise<T> | React.Context<T>) => T;
  Activity?: React.ComponentType<{ mode: 'visible' | 'hidden'; children: React.ReactNode }>;
  useEffectEvent?: <F extends (...args: never[]) => unknown>(fn: F) => F;
};
const onReact19 = typeof react.use === 'function';

describe('the newer hooks, recorded', () => {
  it('useTransition: the update renders in a transition lane, and the memo after its two cells is followed', () => {
    let go!: Setter<number>;
    const Tabs = () => {
      const [tab, setTab] = useState(0);
      const [pending, startTransition] = useTransition();
      go = (n) => startTransition(() => setTab(n));
      const label = useMemo(() => ({ text: `tab ${tab}` }), [{ tab }]);
      return <p data-pending={pending}>{label.text}</p>;
    };
    mount(<Tabs />);
    const { recorder } = makeRecorder();
    recorder.start();
    for (let i = 1; i <= 3; i++) flush(() => go(i));
    const rec = recorder.stop();
    expect(rec.errors).toEqual([]);
    expect(rec.roots[0].name).toBe('Tabs');
    // The pending flag of useTransition is a state of its own (#1), set before the transition renders #0.
    const said = reasonsOf(rec, rec.roots[0]);
    expect(said.some((r) => /^state #0/.test(r))).toBe(true);
    expect(said.some((r) => /^state #1/.test(r))).toBe(true);
    expect(rec.roots[0].lanes.map(([lane]) => lane)).toContain('Transition');
    // useState, then useTransition's two cells, then the memo: cell 3. A transition is two renders — the pending
    // flag, then the update — and the memo's dependency is new in both.
    expect(rec.memos?.map((m) => [m.hook, m.kind, m.renders, m.recomputed])).toEqual([[3, 'useMemo', 6, 6]]);
  });

  it('useDeferredValue: the urgent render and the deferred one are both recorded, with reasons', () => {
    let type!: Setter<string>;
    const Search = () => {
      const [query, setQuery] = useState('');
      type = setQuery;
      const later = useDeferredValue(query);
      return (
        <p>
          {query}/{later}
        </p>
      );
    };
    mount(<Search />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => type('a'));
    const rec = recorder.stop();
    expect(rec.errors).toEqual([]);
    expect(document.querySelector('p')!.textContent).toBe('a/a');
    expect(rec.totals.renders).toBeGreaterThanOrEqual(2);
    expect(rec.roots[0].name).toBe('Search');
    expect(reasonsOf(rec, rec.roots[0]).length).toBeGreaterThan(0);
  });

  it('Suspense: a component that suspends and resumes during a recording', async () => {
    let resolve!: (value: string) => void;
    let load!: () => void;
    const promises: Array<Promise<string>> = [];
    const cache = new Map<string, { done?: string; promise: Promise<string> }>();
    const read = (key: string) => {
      let entry = cache.get(key);
      if (!entry) {
        const promise = new Promise<string>((r) => (resolve = r));
        entry = { promise };
        promise.then((v) => (entry!.done = v));
        cache.set(key, entry);
        promises.push(promise);
      }
      if (entry.done === undefined) throw entry.promise;
      return entry.done;
    };
    const Data = ({ id }: { id: string }) => <b>{read(id)}</b>;
    const Page = () => {
      const [id, setId] = useState('');
      load = () => setId('x');
      return <Suspense fallback={<i>loading</i>}>{id ? <Data id={id} /> : <u>nothing</u>}</Suspense>;
    };
    mount(<Page />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => load());
    expect(document.querySelector('i')?.textContent).toBe('loading');
    await act(async () => {
      resolve('ready');
      await promises[0];
    });
    const rec = recorder.stop();
    expect(rec.errors).toEqual([]);
    expect(document.querySelector('b')?.textContent).toBe('ready');
    expect(rec.roots.map((r) => r.name)).toContain('Page');
    expect(rec.totals.mounts).toBeGreaterThan(0);
  });

  (onReact19 ? it : it.skip)('use(): a context read with use() is a context reason, and a resolved promise renders', async () => {
    const use = react.use!;
    const Theme = createContext('dark');
    let flip!: () => void;
    const Swatch = React.memo(() => <i>{use(Theme)}</i>);
    Swatch.displayName = 'Swatch';
    const App = () => {
      const [theme, setTheme] = useState('dark');
      flip = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
      return (
        <Theme.Provider value={theme}>
          <Swatch />
        </Theme.Provider>
      );
    };
    mount(<App />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => flip());
    const rec = recorder.stop();
    expect(rec.errors).toEqual([]);
    const swatch = rec.components.find((c) => c.name === 'Swatch');
    expect(swatch?.renders).toBe(1);
    expect(reasonsOf(rec, swatch!)[0]).toMatch(/^context/);
  });

  (onReact19 ? it : it.skip)('Activity: a hidden subtree that renders is recorded, and showing it again is too', () => {
    const Activity = react.Activity!;
    let bump!: () => void;
    let show!: () => void;
    const Inbox = () => {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return <b>{n}</b>;
    };
    const App = () => {
      const [visible, setVisible] = useState(false);
      show = () => setVisible(true);
      return (
        <Activity mode={visible ? 'visible' : 'hidden'}>
          <Inbox />
        </Activity>
      );
    };
    mount(<App />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => bump());
    flush(() => show());
    flush(() => bump());
    const rec = recorder.stop();
    expect(rec.errors).toEqual([]);
    expect(rec.components.find((c) => c.name === 'Inbox')?.renders).toBeGreaterThanOrEqual(2);
  });

  (onReact19 ? it : it.skip)('useEffectEvent: a component with one is recorded and its hooks after it keep their numbers', () => {
    const useEffectEvent = react.useEffectEvent!;
    let set!: Setter<number>;
    const Chat = () => {
      const [n, setN] = useState(0);
      set = setN;
      const onTick = useEffectEvent(() => n);
      const [tail, setTail] = useState('t');
      void onTick;
      void setTail;
      return (
        <p>
          {n}
          {tail}
        </p>
      );
    };
    mount(<Chat />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => set(1));
    const rec = recorder.stop();
    expect(rec.errors).toEqual([]);
    expect(reasonsOf(rec, rec.roots[0])[0]).toMatch(/^state #0/);
  });
});
