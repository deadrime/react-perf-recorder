import { create, useStore } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { useShallow } from 'zustand/react/shallow';
import { PluginHost } from '../../src/core/plugins';
import plugin, { nameStore, wrapCreate, wrapUseShallow } from '../../src/plugins/zustand/runtime';
import { flush, makeRecorder, mount } from './helpers';

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
    expect(rec.roots[0].reasons[0][0]).toMatch(/^external store #\d \[ammPriceStore\] useShallow\(selectPrice\)$/);
    expect(rec.causes.map((c) => c.key)).toContain('zustand:ammPriceStore.setState');
  });
});
