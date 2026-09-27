/** @jsxImportSource @emotion/react */
import { useEffect, useState } from 'react';
import { Case, createDriver, Pair, Panel } from '../basics/Case';

const BROKEN_STYLE = `
const Progress = ({ value }) => (
  <div css={{ width: \`\${value}%\` }} />   // ← a new class for every value, and emotion never removes one
);`;

const FIXED_STYLE = `
const bar = css({ height: 6, background: 'teal' });

const Progress = ({ value }) => (
  <div css={bar} style={{ width: \`\${value}%\` }} />   // ← one class; the value goes into style
);`;

const BROKEN_LISTENER = `
useEffect(() => {
  window.addEventListener('resize', place);   // ← no cleanup: every open leaves one behind
}, []);`;

const FIXED_LISTENER = `
useEffect(() => {
  window.addEventListener('resize', place);
  return () => window.removeEventListener('resize', place);   // ← gone with the popover
}, []);`;

const progress = createDriver(0);
const open = createDriver(false);

const LeakyProgress = () => {
  const value = progress.use();
  return <div data-testid="bar-broken" css={{ height: 6, background: 'crimson', width: `${value}%` }} />;
};

const bar = { height: 6, background: 'teal' };
const TidyProgress = () => {
  const value = progress.use();
  return <div data-testid="bar-fixed" css={bar} style={{ width: `${value}%` }} />;
};

const LeakyPopover = () => {
  const [, setWidth] = useState(0);
  useEffect(() => {
    window.addEventListener('resize', () => setWidth(innerWidth));
  }, []);
  return <p className="muted">open</p>;
};

const TidyPopover = () => {
  const [, setWidth] = useState(0);
  useEffect(() => {
    const place = () => setWidth(innerWidth);
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);
  return <p className="muted">open</p>;
};

const Popover = ({ leaky }: { leaky: boolean }) => (open.use() ? leaky ? <LeakyPopover /> : <TidyPopover /> : <p className="muted">closed</p>);

/** Steps the bar from 0 to 100 over three seconds and opens and closes the popovers ten times, as a person would over an hour. */
function run() {
  let i = 0;
  const step = () => {
    i++;
    progress.set(i);
    if (i % 10 === 0) open.set((v) => !v);
    if (i < 100) setTimeout(step, 30);
  };
  step();
}

export const Leak = () => (
  <Case
    title="what stays behind"
    what={
      <>
        Nothing here renders too often. It is what stays behind: CSS-in-JS turns every value into a class of its own and never removes one, and a
        listener added without a cleanup stays on the window after its component is gone. Each is small; a page open for a day holds thousands.
      </>
    }
  >
    <p className="bar">
      <button type="button" data-testid="run" onClick={run}>
        Move the bars and open the popovers
      </button>
    </p>
    <Pair id="style" title="a value in css">
      <Panel
        kind="broken"
        title="css={{ width }}"
        says="The recorder says: CSS rules keep growing, 100 new classes of LeakyProgress, varying width."
        code={BROKEN_STYLE}
      >
        <LeakyProgress />
      </Panel>
      <Panel kind="fixed" title="style={{ width }}" says="The recorder says: no new classes." code={FIXED_STYLE}>
        <TidyProgress />
      </Panel>
    </Pair>
    <Pair id="listener" title="a listener without a cleanup">
      <Panel
        kind="broken"
        title="no cleanup"
        says="The recorder says: window resize listeners keep growing, and where they were added."
        code={BROKEN_LISTENER}
      >
        <Popover leaky />
      </Panel>
      <Panel kind="fixed" title="removed on unmount" says="The recorder says: nothing left behind." code={FIXED_LISTENER}>
        <Popover leaky={false} />
      </Panel>
    </Pair>
  </Case>
);
