import { create, useStore } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { useShallow } from 'zustand/react/shallow';
import { PluginHost } from '../../src/core/plugins';
import plugin, { nameStore, wrapCreate, wrapUseShallow } from '../../src/plugins/zustand/runtime';
import { flush, makeRecorder, mount, reasonsOf } from './helpers';

describe('zustand plugin runtime', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__;
  });

  it('names the action of a devtools store and keeps forwarding to a real extension', () => {
    const sent: unknown[] = [];
    (window as unknown as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ = Object.assign(() => (next: unknown) => next, {
      connect: () => ({ init() {}, subscribe: () => () => {}, send: (action: unknown) => sent.push(action) }),
    });
    const host = new PluginHost([[plugin, null]]);
    host.setupAll();
    const useStore = wrapCreate(create)<{ n: number; inc(): void }>()(
      devtools((set) => ({ n: 0, inc: () => set((s) => ({ n: s.n + 1 }), false, 'counter/inc') }), { enabled: true })
    );
    nameStore(useStore, 'useStore');
    host.start({ scope: null, findFibers: () => [] }, performance.now());
    useStore.getState().inc();
    const events = host.drain();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ plugin: 'zustand', type: 'counter/inc', data: { store: 'useStore' } });
    expect(events[0].changes?.map((c) => c.key)).toEqual(['n']);
    expect(sent).toEqual([{ type: 'counter/inc' }]);
    useStore.setState({ n: 5 });
    expect(host.drain()[0]).toMatchObject({ type: 'useStore.setState', changes: [{ key: 'n' }] });
    host.stop({ scope: null, findFibers: () => [] });
  });

  it('labels stores without devtools and useShallow selectors', () => {
    const host = new PluginHost([[plugin, null]]);
    host.setupAll();
    const prices = wrapCreate(createStore)<{ p: number }>()(() => ({ p: 1 }));
    nameStore(prices, 'ammPriceStore');
    host.start({ scope: null, findFibers: () => [] }, performance.now());
    prices.setState({ p: 2 });
    expect(host.drain()[0].type).toBe('ammPriceStore.setState');
    expect(host.store(prices.getState)).toBe('ammPriceStore');
    host.stop({ scope: null, findFibers: () => [] });

    const selectPrice = (s: { p: number }) => ({ p: s.p });
    const shallow = wrapUseShallow(useShallow);
    const Price = () => <b>{useStore(prices, shallow(selectPrice)).p}</b>;
    mount(<Price />);
    const { recorder } = makeRecorder({}, [[plugin, null]]);
    recorder.start();
    flush(() => prices.setState({ p: 3 }));
    const rec = recorder.stop();
    expect(reasonsOf(rec, rec.roots[0])[0]).toMatch(/^external store #\d \[ammPriceStore\] useShallow\(selectPrice\)$/);
    expect(rec.causes.map((c) => c.key)).toContain('zustand:ammPriceStore.setState');
  });

  it('follows several stores, and one made while the recording runs', () => {
    const host = new PluginHost([[plugin, null]]);
    host.setupAll();
    const a = wrapCreate(createStore)<{ n: number }>()(() => ({ n: 0 }));
    const b = wrapCreate(createStore)<{ n: number }>()(() => ({ n: 0 }));
    nameStore(a, 'aStore');
    nameStore(b, 'bStore');
    host.start({ scope: null, findFibers: () => [] }, performance.now());
    // Made after the start, the way a store per component or a lazily loaded module is.
    const late = wrapCreate(createStore)<{ n: number }>()(() => ({ n: 0 }));
    nameStore(late, 'lateStore');
    a.setState({ n: 1 });
    b.setState({ n: 1 });
    late.setState({ n: 1 });
    expect(host.drain().map((e) => e.type)).toEqual(['aStore.setState', 'bStore.setState', 'lateStore.setState']);
    host.stop({ scope: null, findFibers: () => [] });
    // Nothing is followed once the recording is over.
    late.setState({ n: 2 });
    expect(host.drain()).toEqual([]);
  });
});
