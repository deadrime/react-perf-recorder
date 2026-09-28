import { memo, useState } from 'react';
import { Case, Panel } from '../basics/Case';

const BROKEN = `
const Log = ({ lines, showTime }) => (
  <ul className="log">
    {lines.map((line) => (
      <Line key={line.id} line={line} showTime={showTime} />   // ← ten thousand rows, a dozen on the screen
    ))}
  </ul>
);`;

const FIXED = `
const Log = ({ lines, showTime }) => {
  const [top, setTop] = useState(0);
  const first = Math.max(0, Math.floor(top / ROW) - 5);
  const shown = lines.slice(first, first + Math.ceil(HEIGHT / ROW) + 10);   // ← only what fits, and a few more
  return (
    <div style={{ height: HEIGHT, overflow: 'auto' }} onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
      <ul style={{ height: lines.length * ROW, paddingTop: first * ROW }}>
        {shown.map((line) => <Line key={line.id} line={line} showTime={showTime} />)}
      </ul>
    </div>
  );
};

const Line = memo(…);   // ← rows that stay on the screen while it scrolls skip`;

const ROW = 26;
const HEIGHT = 312;
const LEVELS = ['info', 'info', 'info', 'warn', 'debug', 'error'];
const LINES = Array.from({ length: 10_000 }, (_, i) => ({
  id: i,
  at: `12:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
  level: LEVELS[i % LEVELS.length],
  text: `worker ${i % 7} handled job #${i}`,
}));

const Line = memo(({ line, showTime }: { line: (typeof LINES)[number]; showTime: boolean }) => (
  <li style={{ height: ROW, boxSizing: 'border-box', padding: '0 8px', display: 'flex', gap: 8, alignItems: 'center' }} data-line={line.id}>
    {showTime ? <span className="muted">{line.at}</span> : null}
    <span className="muted">{line.level}</span>
    <span className="grow">{line.text}</span>
  </li>
));

const box = { height: HEIGHT, overflow: 'auto', border: '1px solid #2a2a33', borderRadius: 8 } as const;
const list = { listStyle: 'none', margin: 0, padding: 0, boxSizing: 'border-box' } as const;

const WholeLog = ({ showTime }: { showTime: boolean }) => (
  <div style={box} data-testid="log-whole">
    <ul style={list}>
      {LINES.map((line) => (
        <Line key={line.id} line={line} showTime={showTime} />
      ))}
    </ul>
  </div>
);

const WindowedLog = ({ showTime }: { showTime: boolean }) => {
  const [top, setTop] = useState(0);
  const first = Math.max(0, Math.floor(top / ROW) - 5);
  const shown = LINES.slice(first, first + Math.ceil(HEIGHT / ROW) + 10);
  return (
    <div style={box} data-testid="log-window" onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
      <ul style={{ ...list, height: LINES.length * ROW, paddingTop: first * ROW }}>
        {shown.map((line) => (
          <Line key={line.id} line={line} showTime={showTime} />
        ))}
      </ul>
    </div>
  );
};

const Log = ({ side, windowed }: { side: string; windowed: boolean }) => {
  const [showTime, setShowTime] = useState(false);
  return (
    <>
      <p className="bar">
        <label>
          <input type="checkbox" data-testid={`time-${side}`} checked={showTime} onChange={(e) => setShowTime(e.target.checked)} /> show the time
        </label>
      </p>
      {windowed ? <WindowedLog showTime={showTime} /> : <WholeLog showTime={showTime} />}
    </>
  );
};

export const Windowed = () => (
  <Case
    title="a virtualized list of ten thousand rows"
    what={
      <>
        Both logs hold ten thousand lines. On the left every line is in the DOM, so turning on the time renders all of them, and opening the page
        mounts them all. On the right only the lines that fit are rendered, plus a few: the same switch renders about twenty, and scrolling mounts the
        lines that come in while the ones that stay are skipped. This is list virtualization (windowing), what react-window and TanStack Virtual do;
        here it is a dozen lines by hand.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="every line in the DOM"
        says="The recorder says: ten thousand renders for one switch, and the time it took."
        code={BROKEN}
      >
        <Log side="whole" windowed={false} />
      </Panel>
      <Panel
        kind="fixed"
        title="only the lines that fit"
        says="The recorder says: about twenty renders for the switch; a scroll mounts the lines that come in and renders none of the others."
        code={FIXED}
      >
        <Log side="window" windowed />
      </Panel>
    </div>
  </Case>
);
