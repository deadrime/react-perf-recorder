import { useState } from 'react';
import { Case, createDriver, MountCount, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const List = ({ ticks }) => {
  const Row = ({ label }) => {          // ← declared in the body: a new type on every render
    const [note, setNote] = useState('');
    return <li>{label} <input value={note} onInput={…} /></li>;
  };

  return <ul><Row label="one" /><Row label="two" /></ul>;
};`;

const FIXED = `
const Row = ({ label }) => {            // ← declared once, outside
  const [note, setNote] = useState('');
  return <li>{label} <input value={note} onInput={…} /></li>;
};

const List = ({ ticks }) => <ul><Row label="one" /><Row label="two" /></ul>;`;

let mountsInside = 0;
let mountsOutside = 0;

/** Written once, so React sees the same type on every render and keeps the row it already has. */
const Outside = ({ label }: { label: string }) => {
  const [note, setNote] = useState('');
  const [mounted] = useState(() => ++mountsOutside);
  return (
    <li>
      <span className="grow">{label}</span>
      <input data-testid={`note-${label}`} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} placeholder="note" />
      <RenderCount renders={useRenderCount()} />
      <MountCount mounts={mounted} />
    </li>
  );
};

const ticks = createDriver(0);

/** The list renders with the button; each version declares its rows the way the code beside it says. */
const Inside = () => {
  const clicked = ticks.use();
  // Declared in the body of a component: a new function on every render, so React throws the old row away.
  const Row = ({ label }: { label: string }) => {
    const [note, setNote] = useState('');
    const [mounted] = useState(() => ++mountsInside);
    return (
      <li>
        <span className="grow">{label}</span>
        <input data-testid={`note-in-${label}`} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} placeholder="note" />
        <RenderCount renders={useRenderCount()} />
        <MountCount mounts={mounted} />
      </li>
    );
  };
  return (
    <ul className="rows" data-ticks={clicked}>
      <Row label="one" />
      <Row label="two" />
    </ul>
  );
};

const Stable = () => (
  <ul className="rows" data-ticks={ticks.use()}>
    <Outside label="one" />
    <Outside label="two" />
  </ul>
);

const Clicked = () => <span className="muted">clicked {ticks.use()}×</span>;

export const Nested = () => {
  return (
    <Case
      title="a component declared inside a render"
      what={
        <>
          A component written in the body of another one is a new type on every render. React cannot match it to what it had, so it unmounts the old
          subtree and mounts a new one: state is lost, the DOM is rebuilt, and effects run again. Type something into the notes, then press the
          button.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="render" onClick={() => ticks.set((t) => t + 1)}>
          Render both panels
        </button>
        <Clicked />
      </p>
      <div className="two">
        <Panel
          kind="broken"
          title="const Row = () => … inside"
          says="The recorder says: mounts, and DOM nodes added and removed on a page where nothing was added."
          code={BROKEN}
        >
          <Inside />
        </Panel>
        <Panel
          kind="fixed"
          title="the same component outside"
          says="The recorder says: two renders and no mounts — the rows are the rows they were."
          code={FIXED}
        >
          <Stable />
        </Panel>
      </div>
    </Case>
  );
};
