import fs from 'node:fs';
import { create, useStore } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { useShallow } from 'zustand/react/shallow';
import { PluginHost } from '../../src/core/plugins';
import { registerStores } from '../../src/plugins/zustand';
import plugin, { nameStore, packageOfStack, wrapCreate, wrapUseShallow } from '../../src/plugins/zustand/runtime';
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
    expect(host.stop({ scope: null, findFibers: () => [] }).zustand).toMatchObject({ active: true });
    // A store that nothing changed: the plugin is still on, and says so.
    host.start({ scope: null, findFibers: () => [] }, performance.now());
    expect(host.stop({ scope: null, findFibers: () => [] }).zustand).toMatchObject({
      active: true,
      highlights: ['no store updates during the recording'],
    });
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

  it('names the package a store came from by the stack that made it', () => {
    const stack = (...urls: string[]) => ['Error', ...urls.map((u) => `    at f (${u}:10:5)`)].join('\n');
    const vanilla = 'http://localhost:5173/node_modules/.vite/deps/zustand_vanilla.js?v=1a2b';
    expect(packageOfStack(stack(vanilla, 'http://localhost:5173/node_modules/.vite/deps/@xyflow_react.js?v=1a2b'))).toBe('@xyflow/react');
    expect(packageOfStack(stack(vanilla, 'http://localhost:5173/node_modules/@scope/lib/dist/index.mjs'))).toBe('@scope/lib');
    expect(packageOfStack(`Error\ncreateStoreImpl@${vanilla}:3:1\nmake@http://localhost:5173/node_modules/.vite/deps/some-lib.js:9:9`)).toBe(
      'some-lib'
    );
    // The app's own stores keep the name their declaration gives them, whatever the cacheDir.
    expect(packageOfStack(stack(vanilla, 'http://localhost:5173/src/store/chat.ts'))).toBeNull();
    const moved = 'http://localhost:5391/node_modules/.vite-fixture-18/deps/zustand_vanilla.js?v=9';
    expect(packageOfStack(stack(moved, 'http://localhost:5391/src/store/chat.ts'))).toBeNull();
    // Shared chunks of the optimizer are passed over; a linked package served by its path counts as the app's.
    const react = 'http://localhost:5173/node_modules/.vite/deps/react-dom-DVjBvCsW.js';
    expect(packageOfStack(stack(vanilla, 'http://localhost:5173/node_modules/.vite/deps/chunk-ABC.js', react))).toBeNull();
    expect(
      packageOfStack(
        stack('http://localhost:5173/node_modules/.vite/deps/vanilla-Ab12Cd34.js', 'http://localhost:5173/node_modules/.vite/deps/@xyflow_react.js')
      )
    ).toBe('@xyflow/react');
    expect(
      packageOfStack(stack(vanilla, 'http://localhost:5173/@fs/home/me/react-perf-recorder-demo/packages/react/dist/esm/index.js', react))
    ).toBeNull();
  });

  it("follows a store made by a library's own zustand, which the app's imports never reach", async () => {
    // zustand/vanilla as the dev server hands it to a library: rewritten to report each store it makes.
    const file = require.resolve('zustand/vanilla').replace(/vanilla\.js$/, 'esm/vanilla.mjs');
    const code = registerStores(fs.readFileSync(file, 'utf8'));
    expect(code).toBeTruthy();
    expect(registerStores(code!)).toBeNull();
    const url = `data:text/javascript;base64,${Buffer.from(code!.replace(/import\.meta\.env/g, 'undefined')).toString('base64')}`;
    const vanilla = (await import(/* @vite-ignore */ url)) as typeof import('zustand/vanilla');

    const host = new PluginHost([[plugin, null]]);
    host.setupAll();
    const store = vanilla.createStore<{ n: number }>()(() => ({ n: 0 }));
    host.start({ scope: null, findFibers: () => [] }, performance.now());
    store.setState({ n: 1 });
    expect(host.drain()[0]).toMatchObject({ type: expect.stringMatching(/^store\d+\.setState$/), changes: [{ key: 'n' }] });
    expect(host.store(store.getState)).toMatch(/^store\d+$/);
    host.stop({ scope: null, findFibers: () => [] });

    // `create` hands the app a hook wrapping that api: the name its declaration gives the hook is the store's.
    const api = vanilla.createStore<{ n: number }>()(() => ({ n: 0 }));
    const useCounter = Object.assign(() => api.getState(), api);
    nameStore(useCounter, 'useCounter');
    host.start({ scope: null, findFibers: () => [] }, performance.now());
    useCounter.setState({ n: 1 });
    expect(host.drain()[0].type).toBe('useCounter.setState');
    expect(host.store(api.getState)).toBe('useCounter');
    host.stop({ scope: null, findFibers: () => [] });
  });
});
