import v8 from 'node:v8';
import vm from 'node:vm';
import { useEffect, useState } from 'react';
import { installListeners } from '../../src/core/env/listeners';
import { installObservers } from '../../src/core/env/observers';
import { installTimers } from '../../src/core/env/timers';
import { growthMetric } from '../../src/core/growth';
import { declsOf, shapeOf } from '../../src/core/styles';
import { growthLines } from '../../src/shared/summary';
import { flush, makeRecorder, mount } from './helpers';

installTimers();
installListeners();
installObservers();

function useLeakyResize() {
  useEffect(() => {
    // No cleanup: every mount leaves one more listener and one more interval behind.
    window.addEventListener('resize', () => {});
    setInterval(() => {}, 60_000);
  }, []);
}

function useTidyScroll() {
  useEffect(() => {
    const onScroll = () => {};
    window.addEventListener('scroll', onScroll);
    const id = setInterval(() => {}, 60_000);
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearInterval(id);
    };
  }, []);
}

const Leaky = () => {
  useLeakyResize();
  return <i />;
};

const Tidy = () => {
  useTidyScroll();
  return <b />;
};

let remount: (n: number) => void = () => {};
function App() {
  const [n, setN] = useState(0);
  remount = setN;
  return (
    <div>
      <Leaky key={`l${n}`} />
      <Tidy key={`t${n}`} />
    </div>
  );
}

describe('growth', () => {
  it('names the listeners and intervals a component leaves behind, and not the ones it cleans up', () => {
    mount(<App />);
    const { recorder } = makeRecorder();
    recorder.start();
    for (let i = 1; i <= 6; i++) flush(() => remount(i));
    const style = document.createElement('style');
    document.head.appendChild(style);
    for (let i = 0; i < 40; i++) style.sheet!.insertRule(`.css-${i} { width: ${i}px }`);
    const { growth } = recorder.stop();

    expect(growth?.metrics.listeners).toMatchObject({ end: (growth?.metrics.listeners?.start ?? 0) + 6, growing: true });
    expect(growth?.metrics.intervals).toMatchObject({ end: (growth?.metrics.intervals?.start ?? 0) + 6, growing: true });
    expect(growth?.metrics.cssRules?.growing).toBe(true);
    expect(growth?.metrics.domNodes?.growing).toBeUndefined();
    // The effect runs anonymous, so its file is what names it; the mounted Tidy's one listener is there, not growing.
    const origin = expect.stringMatching(/^@ .*growth\.test\.tsx$/);
    const generated = expect.objectContaining({ url: expect.stringContaining('growth.test.tsx') });
    expect(growth?.listeners).toEqual([
      { target: 'window', type: 'resize', origin, live: 6, generated },
      { target: 'window', type: 'scroll', origin, live: 1, generated },
    ]);
    // Two calls in one file are told apart by their line.
    expect(growth?.intervals).toEqual([
      { origin, live: 6, generated },
      { origin, live: 1, generated },
    ]);
    expect(growthLines(growth!).join('\n')).toMatch(/window\/document listeners: \d+ → \d+ .*most from window resize @ .*growth\.test\.tsx/);
    style.remove();
  });

  it('can be left out', () => {
    mount(<App />);
    const { recorder } = makeRecorder({ growth: false });
    recorder.start();
    expect(recorder.stop().growth).toBeUndefined();
  });

  it('calls growth that levels off noise, and growth that keeps going a leak', () => {
    const settles = growthMetric('cssRules', [
      [0, 100],
      [1000, 400],
      [2000, 402],
      [3000, 402],
      [4000, 403],
    ]);
    expect(settles).toMatchObject({ start: 100, end: 403, peak: 403 });
    expect(settles?.growing).toBeUndefined();
    const leaks = growthMetric('cssRules', [
      [0, 100],
      [1000, 200],
      [2000, 300],
      [3000, 400],
      [4000, 500],
    ]);
    expect(leaks).toMatchObject({ growing: true, perMin: 6000 });
  });
});

describe('style growth', () => {
  const Bar = ({ cls }: { cls: string }) => <div className={cls} />;

  it('groups the rules added during a recording by their declarations, and names the component that uses them', () => {
    const style = document.createElement('style');
    style.setAttribute('data-styled', 'active');
    document.head.appendChild(style);
    style.sheet!.insertRule('.sc-base { color: red }');
    const { rerender } = mount(<Bar cls="sc-0" />);
    const { recorder } = makeRecorder();
    recorder.start();
    // A CSS-in-JS library putting a value into a class: one rule per value, never removed.
    for (let i = 1; i <= 30; i++) {
      style.sheet!.insertRule(`.sc-${i} { position: absolute; left: ${i}px; color: red }`, style.sheet!.cssRules.length);
      rerender(<Bar cls={`sc-${i}`} />);
    }
    style.sheet!.insertRule('.sc-other:hover { color: blue }', style.sheet!.cssRules.length);
    const { growth } = recorder.stop();
    expect(growth?.styles?.[0]).toMatchObject({
      component: 'Bar',
      source: 'style[data-styled]',
      rules: 30,
      classes: 30,
      varying: [{ prop: 'left', values: ['1px', '2px', '3px', '4px', '5px'] }],
      shape: 'position:absolute;left:#px;color:red',
      examples: ['sc-28', 'sc-29', 'sc-30'],
    });
    // A class no element carries keeps its declarations for a name.
    expect(growth?.styles?.[1]).toMatchObject({ rules: 1, shape: 'color:blue' });
    expect(growth?.styles?.[1].component).toBeUndefined();
    expect(growth?.styles?.some((g) => g.examples.includes('sc-base'))).toBe(false);
    style.remove();
  });

  it('reads declarations as written, a ; inside quotes kept in the value', () => {
    expect(declsOf('height: 6px; background: url("a;b.png") crimson; width: 1%;')).toEqual([
      ['height', '6px'],
      ['background', 'url("a;b.png") crimson'],
      ['width', '1%'],
    ]);
    expect(
      shapeOf([
        ['width', '12.5px'],
        ['color', '#ff0000'],
        ['background', 'url(a.png)'],
      ])
    ).toBe('width:#px;color:#hex;background:url()');
  });
});

describe('retained components', () => {
  // A collection on demand: what a test asks of V8 here, record_page asks of Chrome through CDP.
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc') as () => void;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  const held: Array<() => void> = [];
  const Held = () => {
    const [, set] = useState(0);
    // A store's subscriber list that no unmount empties: it keeps the setter, and the setter keeps the component.
    useEffect(() => void held.push(() => set((n) => n + 1)), []);
    return <i />;
  };
  const Let = () => {
    const [, set] = useState(0);
    useEffect(() => {
      const bump = () => set((n) => n + 1);
      held.push(bump);
      return () => void held.splice(held.indexOf(bump), 1);
    }, []);
    return <b />;
  };
  let flip: (n: number) => void = () => {};
  function Swap() {
    const [n, setN] = useState(0);
    flip = setN;
    return (
      <div>
        <Held key={`h${n}`} />
        <Let key={`l${n}`} />
      </div>
    );
  }

  it('counts the unmounted components something still holds after a collection, and not the ones let go', async () => {
    mount(<Swap />);
    const { recorder } = makeRecorder();
    recorder.start();
    for (let i = 1; i <= 5; i++) flush(() => flip(i));
    await settle();
    gc();
    const retained = recorder.stop(true).growth?.retained;
    expect(retained).toMatchObject({ collected: true, unmounted: 10, retained: 5, detached: { roots: 0, nodes: 0 } });
    expect(retained?.components).toEqual([
      expect.objectContaining({ name: 'Held', unmounted: 5, retained: 5 }),
      expect.objectContaining({ name: 'Let', unmounted: 5, retained: 0 }),
    ]);
    expect(growthLines({ samples: [], metrics: {}, retained })).toEqual([
      expect.stringMatching(/^unmounted and still in memory: Held \(.*growth\.test\.tsx(:\d+)?\) 5 of 5$/),
    ]);
    held.length = 0;
  });

  it('without a collection tells what was unmounted, and nothing of what is in memory', () => {
    mount(<Swap />);
    const { recorder } = makeRecorder();
    recorder.start();
    for (let i = 1; i <= 3; i++) flush(() => flip(i));
    const retained = recorder.stop().growth?.retained;
    expect(retained).toMatchObject({ collected: false, unmounted: 6 });
    expect(retained?.retained).toBeUndefined();
    expect(retained?.components.every((c) => c.retained === undefined)).toBe(true);
    held.length = 0;
  });

  it('counts removed DOM a module still holds', async () => {
    const kept: Element[] = [];
    const Row = () => <li ref={(el) => void (el && kept.push(el))}>row</li>;
    const List = ({ n }: { n: number }) => (
      <ul>
        {Array.from({ length: n }, (_, i) => (
          <Row key={i} />
        ))}
      </ul>
    );
    const { rerender } = mount(<List n={4} />);
    const { recorder } = makeRecorder();
    recorder.start();
    rerender(<List n={1} />);
    await settle();
    gc();
    expect(recorder.stop(true).growth?.retained?.detached).toEqual({ roots: 3, nodes: 3 });
  });
});

describe('observers and connections', () => {
  it('names the observers started and never disconnected, and the channels left open', () => {
    const { recorder } = makeRecorder();
    recorder.start();
    const leaky = new MutationObserver(() => {});
    leaky.observe(document.body, { childList: true });
    const tidy = new MutationObserver(() => {});
    tidy.observe(document.body, { childList: true });
    tidy.disconnect();
    // An observe that throws observes nothing, and is not left counted.
    const failed = new MutationObserver(() => {});
    expect(() => failed.observe(document.body)).toThrow();
    const channel = new BroadcastChannel('sync');
    const closed = new BroadcastChannel('other');
    closed.close();
    const { growth } = recorder.stop();
    expect(growth?.observers).toEqual([
      expect.objectContaining({ kind: 'MutationObserver', live: 1, origin: expect.stringMatching(/growth\.test\.tsx$/) }),
    ]);
    expect(growth?.connections).toEqual([expect.objectContaining({ kind: 'BroadcastChannel', url: 'sync', live: 1 })]);
    expect(growth?.metrics.observers?.end).toBe((growth?.metrics.observers?.start ?? 0) + 1);
    expect(channel).toBeInstanceOf(BroadcastChannel);
    leaky.disconnect();
    channel.close();
  });
});

describe('removed DOM', () => {
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc') as () => void;

  it('counts plain elements a module still holds, with no component unmounted', async () => {
    const kept: Element[] = [];
    const List = ({ n }: { n: number }) => (
      <ul>
        {Array.from({ length: n }, (_, i) => (
          <li key={i} ref={(el) => void (el && kept.push(el))} />
        ))}
      </ul>
    );
    const { rerender } = mount(<List n={3} />);
    const { recorder } = makeRecorder();
    recorder.start();
    rerender(<List n={1} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    expect(recorder.stop(true).growth?.retained).toMatchObject({ unmounted: 0, detached: { roots: 2, nodes: 2 } });
  });
});
