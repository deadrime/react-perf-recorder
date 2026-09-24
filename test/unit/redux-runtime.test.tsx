import fs from 'node:fs';
import path from 'node:path';
import { Provider, useSelector } from 'react-redux';
import { PluginHost } from '../../src/core/plugins';
import { followSelectors, registerStores } from '../../src/plugins/redux';
import plugin, { nameStore, packageOfStack } from '../../src/plugins/redux/runtime';
import { flush, makeRecorder, mount, nodeModules, reasonsOf } from './helpers';

type Redux = typeof import('redux');

/** redux as the dev server hands it to the page: its createStore rewritten to report each store it makes. */
async function patchedRedux(): Promise<Redux> {
  const file = require.resolve('redux').replace(/cjs[\\/]redux\.cjs$/, 'redux.mjs');
  const code = registerStores(fs.readFileSync(file, 'utf8'));
  expect(code).toBeTruthy();
  expect(registerStores(code!)).toBeNull();
  const source = `const process = { env: { NODE_ENV: 'development' } };\n${code}`;
  return import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const todos = (state = { todos: [] as string[], filter: 'all' }, action: { type: string; text?: string }) => {
  if (action.type === 'todos/add') return { ...state, todos: [...state.todos, action.text!] };
  if (action.type === 'todos/same') return state;
  return state;
};

const session = { scope: null, findFibers: () => [] };

describe('redux plugin runtime', () => {
  it('names the action and the slices it changed, once behind middleware, and not an action that changed nothing', async () => {
    const redux = await patchedRedux();
    // A thunk-like middleware: a function dispatched runs, and dispatches the action itself.
    const thunk = (api: { dispatch: Function }) => (next: Function) => (action: unknown) =>
      typeof action === 'function' ? action(api.dispatch) : next(action);
    const store = redux.legacy_createStore(todos, redux.applyMiddleware(thunk as never));
    nameStore(store, 'appStore');
    const host = new PluginHost([[plugin, null]]);
    host.setupAll();
    host.start(session, performance.now());
    store.dispatch({ type: 'todos/add', text: 'milk' });
    store.dispatch(((dispatch: Function) => dispatch({ type: 'todos/add', text: 'bread' })) as never);
    store.dispatch({ type: 'todos/same' });
    const events = host.drain();
    expect(events.map((e) => e.type)).toEqual(['todos/add', 'todos/add']);
    expect(events[0]).toMatchObject({ plugin: 'redux', data: { store: 'appStore' }, changes: [{ key: 'todos' }] });
    expect(host.store(store.getState)).toBe('appStore');
    expect(host.stop(session).redux).toMatchObject({ active: true, highlights: ['appStore: 2 changes, most by todos/add ×2'] });
    // Nothing is followed once the recording is over.
    store.dispatch({ type: 'todos/add', text: 'tea' });
    expect(host.drain()).toEqual([]);
  });

  it('names the store in the reasons of a component that reads it with useSelector', async () => {
    const redux = await patchedRedux();
    const store = redux.legacy_createStore(todos);
    nameStore(store, 'appStore');
    const Count = () => <b>{useSelector((s: ReturnType<typeof todos>) => s.todos.length)}</b>;
    mount(
      <Provider store={store}>
        <Count />
      </Provider>
    );
    const { recorder } = makeRecorder({}, [[plugin, null]]);
    recorder.start();
    flush(() => void store.dispatch({ type: 'todos/add', text: 'milk' }));
    const rec = recorder.stop();
    const count = rec.roots.find((r) => r.name === 'Count')!;
    expect(reasonsOf(rec, count)[0]).toMatch(/^external store #\d+ \[appStore\]/);
    expect(rec.causes.map((c) => c.key)).toContain('redux:todos/add');
  });

  it('names the store, the app selector and what a connect reads, through react-redux as the dev server hands it over', async () => {
    const redux = await patchedRedux();
    const source = path.join(nodeModules(), 'react-redux', 'dist', 'react-redux.mjs');
    const code = followSelectors(fs.readFileSync(source, 'utf8'));
    expect(code).toBeTruthy();
    expect(followSelectors(code!)).toBeNull();
    // Beside the original, so its own imports resolve as they do in the app.
    const file = source.replace(/react-redux\.mjs$/, 'rpr-test.mjs');
    fs.writeFileSync(file, code!);
    try {
      const rr = (await import(/* @vite-ignore */ file)) as typeof import('react-redux');
      const store = redux.legacy_createStore(todos);
      nameStore(store, 'appStore');
      const Count = () => <b>{rr.useSelector((s: ReturnType<typeof todos>) => s.todos.length)}</b>;
      const mapStateToProps = (s: ReturnType<typeof todos>) => ({ n: s.todos.length });
      const Connected = rr.connect(mapStateToProps)(({ n }: { n: number }) => <i>{n}</i>);
      mount(
        <rr.Provider store={store}>
          <Count />
          <Connected />
        </rr.Provider>
      );
      const { recorder } = makeRecorder({}, [[plugin, null]]);
      recorder.start();
      flush(() => void store.dispatch({ type: 'todos/add', text: 'milk' }));
      const rec = recorder.stop();
      const reason = (name: RegExp) => reasonsOf(rec, rec.roots.find((r) => name.test(r.name))!)[0];
      expect(reason(/^Count$/)).toMatch(/^external store #\d+ \[appStore\] \(s\) => s\.todos\.length/);
      expect(reason(/^Connect/)).toMatch(/^external store #\d+ \[appStore\] connect\(mapStateToProps\)/);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("names a library's store after its package, passing redux and RTK over", () => {
    const stack = (...urls: string[]) => ['Error', ...urls.map((u) => `    at f (${u}:10:5)`)].join('\n');
    const redux = 'http://localhost:5173/node_modules/.vite/deps/redux.js?v=1';
    const rtk = 'http://localhost:5173/node_modules/.vite/deps/@reduxjs_toolkit.js?v=1';
    expect(packageOfStack(stack(redux, rtk, 'http://localhost:5173/node_modules/.vite/deps/some-editor.js?v=1'))).toBe('some-editor');
    expect(packageOfStack(stack(redux, rtk, 'http://localhost:5173/src/store.ts'))).toBeNull();
  });
});
