import { act, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { hookCommits } from '../../src/core/commit-hook';
import { findRoots, nameOf, type Fiber, type FiberRoot } from '../../src/core/fiber';
import { flush, makeRecorder, mount } from './helpers';

/** Something React can call that is not a set of updaters: what a page whose hook came after react-dom leaves. */
const inert = () => ({ add() {}, clear() {}, delete() {}, forEach() {}, has: () => false, size: 0 } as unknown as Set<Fiber>);

/** Hides React's updater sets from the recorder, as on a page whose DevTools hook came after react-dom. */
function withoutUpdaterSets(run: () => void) {
  const roots = findRoots();
  const saved = roots.map((root) => root.pendingUpdatersLaneMap);
  roots.forEach((root) => (root.pendingUpdatersLaneMap = Array.from({ length: 31 }, inert)));
  try {
    run();
  } finally {
    roots.forEach((root, i) => (root.pendingUpdatersLaneMap = saved[i]));
  }
}

describe('updaters', () => {
  it("hands over each update's fiber and lane from React's own sets, and puts the sets back", () => {
    let bump!: () => void;
    const Counter = () => {
      const [n, setN] = useState(0);
      bump = () => setN((v) => v + 1);
      return <p>{n}</p>;
    };
    mount(<Counter />);
    const roots = findRoots();
    const seen: Array<[string, number]> = [];
    const hook = hookCommits(
      roots,
      'test',
      () => {},
      (fiber?: Fiber, lane?: number) => seen.push([(fiber && nameOf(fiber)) || '?', lane ?? 0]),
      true
    );
    expect(hook.updaters).toBe(true);
    flush(() => {
      bump();
      bump();
    });
    hook.stop();
    // Every update, not only the first of its lane.
    expect(seen.map(([name]) => name)).toEqual(['Counter', 'Counter']);
    expect(seen.every(([, lane]) => lane > 0)).toBe(true);
    const sets = (roots[0] as FiberRoot).pendingUpdatersLaneMap!;
    expect(sets.some((s) => Object.prototype.hasOwnProperty.call(s, 'add'))).toBe(false);
  });

  it('falls back to a bare signal when React keeps no updater sets', () => {
    let bump!: () => void;
    const Counter = () => {
      const [n, setN] = useState(0);
      bump = () => setN((v) => v + 1);
      return <p>{n}</p>;
    };
    mount(<Counter />);
    withoutUpdaterSets(() => {
      const signals: unknown[] = [];
      const hook = hookCommits(
        findRoots(),
        'test',
        () => {},
        (fiber?: Fiber) => signals.push(fiber),
        true
      );
      expect(hook.updaters).toBe(false);
      flush(() => bump());
      hook.stop();
      expect(signals).toEqual([undefined]);
    });
  });

  for (const mode of ['React updater sets', 'a walk of the tree'] as const) {
    it(`aims a store's cause at its own subscriber only, with ${mode}`, () => {
      const a = createStore(() => ({ v: 0 }));
      const b = createStore(() => ({ v: 0 }));
      const ViewA = () => <p>{useStore(a, (s) => s.v)}</p>;
      const ViewB = () => <p>{useStore(b, (s) => s.v)}</p>;
      mount(
        <>
          <ViewA />
          <ViewB />
        </>
      );
      const record = () => {
        const { recorder, host } = makeRecorder({}, [[{ name: 'store' }, undefined]]);
        recorder.start();
        flush(() => {
          a.setState({ v: 1 });
          host.emit('store', { type: 'a/set', aim: true });
          b.setState({ v: 1 });
          host.emit('store', { type: 'b/set', aim: true });
        });
        return recorder.stop();
      };
      let rec!: ReturnType<typeof record>;
      if (mode === 'a walk of the tree') withoutUpdaterSets(() => (rec = record()));
      else rec = record();
      const causesOf = (name: string) => rec.roots.find((r) => r.name === name)!.causes.map(([key]) => key);
      expect(causesOf('ViewA')).toEqual(['store:a/set']);
      expect(causesOf('ViewB')).toEqual(['store:b/set']);
    });
  }

  it('aims a store event at the updates made with it, not at one still waiting from an earlier task', async () => {
    const clock = createStore(() => ({ shown: 0, ticks: 0 }));
    let scroll!: () => void;
    const Clock = () => <p>{useStore(clock, (s) => s.shown)}</p>;
    const Article = () => {
      const [top, setTop] = useState(0);
      scroll = () => setTop((v) => v + 1);
      return <p>{top}</p>;
    };
    mount(
      <>
        <Clock />
        <Article />
      </>
    );
    const { recorder, host } = makeRecorder({}, [[{ name: 'store' }, undefined]]);
    recorder.start();
    await act(async () => {
      // React 19 renders a scroll's update in a task of its own; a store's tick can land in between.
      scroll();
      await Promise.resolve();
      clock.setState({ ticks: 1 });
      host.emit('store', { type: 'tick', aim: true });
    });
    const rec = recorder.stop();
    const causes = rec.roots.find((r) => r.name === 'Article')!.causes.map(([key]) => key);
    expect(causes).toEqual([expect.stringMatching(/^core:update scroll @ /)]);
  });
});

