import { useEffect, useState } from 'react';
import { installListeners } from '../../src/core/env/listeners';
import { installTimers } from '../../src/core/env/timers';
import { growthMetric } from '../../src/core/growth';
import { growthLines } from '../../src/shared/summary';
import { flush, makeRecorder, mount } from './helpers';

installTimers();
installListeners();

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
