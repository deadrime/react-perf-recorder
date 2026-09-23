import { useEffect, useState } from 'react';
import { Case, Pair, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Card = () => {
  const now = useSecond();   // ← the clock is the card's own state

  return (
    <>
      <p>{now.toLocaleTimeString()}</p>
      <ul>{ITEMS.map((text) => <Item key={text} text={text} />)}</ul>
    </>
  );
};`;

const FIXED = `
const Clock = () => {
  const now = useSecond();   // ← the clock is the state of the thing that shows it
  return <span>{now.toLocaleTimeString()}</span>;
};

const Card = () => (
  <>
    <p><Clock /></p>
    <ul>{ITEMS.map((text) => <Item key={text} text={text} />)}</ul>
  </>
);`;

const BROKEN_HOOK = `
const useOverdue = (deadline) => {
  const now = useSecond();   // ← a clock in state, to answer a yes-or-no question
  return now >= deadline;
};

const Task = ({ deadline }) => <li>{useOverdue(deadline) ? 'overdue' : 'due soon'}</li>;`;

const FIXED_HOOK = `
const useOverdue = (deadline) => {
  const [over, setOver] = useState(() => Date.now() >= deadline);   // ← the state is the answer itself
  useEffect(() => {
    if (over) return;
    const id = setTimeout(() => setOver(true), deadline - Date.now());   // ← set once, when it flips
    return () => clearTimeout(id);
  }, [deadline, over]);
  return over;
};`;

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

/** The hook keeps the clock in state to answer a yes-or-no question: whoever calls it renders with every tick. */
const useOverdueByClock = (deadline: number) => useSecond().getTime() >= deadline;

/** The hook keeps the answer in state, and a timer that sets it once, at the moment it flips. */
const useOverdue = (deadline: number) => {
  const [over, setOver] = useState(() => Date.now() >= deadline);
  useEffect(() => {
    if (over) return;
    const id = setTimeout(() => setOver(true), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(id);
  }, [deadline, over]);
  return over;
};

const Due = ({ over, renders }: { over: boolean; renders: number }) => (
  <li>
    <span className="grow">Review the picker tree — {over ? <b>overdue</b> : 'due in a few seconds'}</span>
    <RenderCount n={renders} />
  </li>
);

const DueByClock = ({ deadline }: { deadline: number }) => <Due over={useOverdueByClock(deadline)} renders={useRenderCount()} />;
const DueByTimer = ({ deadline }: { deadline: number }) => <Due over={useOverdue(deadline)} renders={useRenderCount()} />;

export const StateDown = () => {
  // The same deadline for both tasks, a couple of seconds after the page opened.
  const [deadline] = useState(() => Date.now() + 2000);
  return (
    <Case
      title="state belongs to the smallest component that shows it"
      what={
        <>
          A clock that ticks every second, and two places it can hide. In the card: every tick renders the card and the
          list below it. In a custom hook: the component calling it renders every second although all it shows is
          whether a deadline has passed — a yes or a no that changes once. State is for what the screen shows.
        </>
      }
    >
      <Pair id="where" title="in the card, or in the clock">
        <Panel
          kind="broken"
          title="useState in the card"
          says="The recorder says: the card is a cascade root every second, and nothing but the clock changed in the DOM."
          code={BROKEN}
        >
          <CardWithClock />
        </Panel>
        <Panel
          kind="fixed"
          title="useState in <Clock />"
          says="The recorder says: Clock renders every second and pulls one render with it — the list is not in the cascade at all."
          code={FIXED}
        >
          <CardWithOwnClock />
        </Panel>
      </Pair>
      <Pair id="hook" title="a clock hidden in a hook">
        <Panel
          kind="broken"
          title="useOverdue keeps the time"
          says="The recorder says: state #0 behind useOverdueByClock › useSecond, every second — long after the answer stopped changing."
          code={BROKEN_HOOK}
        >
          <ul className="rows">
            <DueByClock deadline={deadline} />
          </ul>
        </Panel>
        <Panel
          kind="fixed"
          title="useOverdue keeps the answer"
          says="The recorder says: one render when the deadline passes, and nothing before or after it."
          code={FIXED_HOOK}
        >
          <ul className="rows">
            <DueByTimer deadline={deadline} />
          </ul>
        </Panel>
      </Pair>
    </Case>
  );
};
