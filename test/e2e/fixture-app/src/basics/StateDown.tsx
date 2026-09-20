import { useEffect, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const ITEMS = ['Write the release notes', 'Review the picker tree', 'Record the page load', 'Answer the thread'];

/** Not memo: most lists are not, which is exactly why it matters where the ticking state lives. */
const Item = ({ text }: { text: string }) => {
  const renders = useRenderCount();
  return (
    <li>
      <span className="grow">{text}</span>
      <RenderCount n={renders} />
    </li>
  );
};

const useSecond = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
};

/** The clock on its own: the state that ticks lives in the smallest component that shows it. */
const Clock = () => {
  const now = useSecond();
  const renders = useRenderCount();
  return (
    <span className="clock" data-testid="clock-own">
      {now.toLocaleTimeString()} <RenderCount n={renders} />
    </span>
  );
};

/** The clock in the card: every tick renders the heading, the list and everything else that lives here. */
const CardWithClock = () => {
  const now = useSecond();
  const renders = useRenderCount();
  return (
    <>
      <p className="bar">
        <span className="clock" data-testid="clock-parent">
          {now.toLocaleTimeString()}
        </span>
        <RenderCount n={renders} />
      </p>
      <ul className="rows">
        {ITEMS.map((text) => (
          <Item key={text} text={text} />
        ))}
      </ul>
    </>
  );
};

const CardWithOwnClock = () => {
  const renders = useRenderCount();
  return (
    <>
      <p className="bar">
        <Clock />
        <RenderCount n={renders} />
      </p>
      <ul className="rows">
        {ITEMS.map((text) => (
          <Item key={text} text={text} />
        ))}
      </ul>
    </>
  );
};

export const StateDown = () => (
  <Case
    title="state belongs to the smallest component that shows it"
    what={
      <>
        The same card twice, with a clock that ticks every second. On the left the clock is a piece of the card's own
        state, so every tick renders the card and the list below it. On the right the clock is a component of its own,
        and the card next to it never hears about the time.
      </>
    }
  >
    <div className="two">
      <Panel kind="broken" title="useState in the card" says="The recorder says: the card is a cascade root every second, and nothing but the clock changed in the DOM.">
        <CardWithClock />
      </Panel>
      <Panel kind="fixed" title="useState in <Clock />" says="The recorder says: Clock renders every second and pulls one render with it — the list is not in the cascade at all.">
        <CardWithOwnClock />
      </Panel>
    </div>
  </Case>
);
