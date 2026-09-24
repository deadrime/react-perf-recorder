import { useEffect, useState, type ReactNode } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Frame = () => {
  const now = useSecond();

  return (
    <>
      <p>{now.toLocaleTimeString()}</p>
      <Report />   // ← a new element on every tick, so the report renders with the clock
    </>
  );
};

<Frame />`;

const FIXED = `
const Frame = ({ children }) => {
  const now = useSecond();

  return (
    <>
      <p>{now.toLocaleTimeString()}</p>
      {children}   // ← the element the parent made, reused as it is
    </>
  );
};

<Frame><Report /></Frame>`;

/** Expensive only in the story; here it just counts how often it was asked to render. */
const Report = () => (
  <li>
    <span className="grow">The monthly report</span>
    <RenderCount renders={useRenderCount()} />
  </li>
);

const useSecond = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
};

/** The clock renders the report itself, so a new element is built every second and the report renders with it. */
const FrameThatRenders = () => {
  const now = useSecond();
  return (
    <ul className="rows">
      <li className="clock-row">
        <span className="grow">{now.toLocaleTimeString()}</span>
        <RenderCount renders={useRenderCount()} />
      </li>
      <Report />
    </ul>
  );
};

/** The same clock, but the report arrives as children: the element is the one the parent made, so React skips it. */
const FrameWithChildren = ({ children }: { children: ReactNode }) => {
  const now = useSecond();
  return (
    <ul className="rows">
      <li className="clock-row">
        <span className="grow">{now.toLocaleTimeString()}</span>
        <RenderCount renders={useRenderCount()} />
      </li>
      {children}
    </ul>
  );
};

export const Children = () => (
  <Case
    title="children come in as a prop, and skip"
    what={
      <>
        Both frames hold a clock that ticks every second. The left one renders the report itself, so it builds a new
        element for it on every tick. The right one is handed the report as <code>children</code> — the element was
        made by a component that did not render, so React reuses it and the report never hears about the clock. No{' '}
        <code>memo</code> anywhere.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="<Frame /> renders <Report />"
        says="The recorder says: the report renders once a second, with parent: same props, memo would skip it."
        code={BROKEN}
      >
        <FrameThatRenders />
      </Panel>
      <Panel
        kind="fixed"
        title="<Frame>{<Report />}</Frame>"
        says="The recorder says nothing about the report: it is not in the cascade."
        code={FIXED}
      >
        <FrameWithChildren>
          <Report />
        </FrameWithChildren>
      </Panel>
    </div>
  </Case>
);
