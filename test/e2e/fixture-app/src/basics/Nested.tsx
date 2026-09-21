import { useState } from 'react';
import { Case, MountCount, Panel, RenderCount, useRenderCount } from './Case';

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
      <RenderCount n={useRenderCount()} />
      <MountCount n={mounted} />
    </li>
  );
};

const Inside = ({ ticks }: { ticks: number }) => {
  // Declared in the body of a component: a new function on every render, so React throws the old row away.
  const Row = ({ label }: { label: string }) => {
    const [note, setNote] = useState('');
    const [mounted] = useState(() => ++mountsInside);
    return (
      <li>
        <span className="grow">{label}</span>
        <input data-testid={`note-in-${label}`} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} placeholder="note" />
        <RenderCount n={useRenderCount()} />
        <MountCount n={mounted} />
      </li>
    );
  };
  return (
    <ul className="rows" data-ticks={ticks}>
      <Row label="one" />
      <Row label="two" />
    </ul>
  );
};

const Stable = ({ ticks }: { ticks: number }) => (
  <ul className="rows" data-ticks={ticks}>
    <Outside label="one" />
    <Outside label="two" />
  </ul>
);

export const Nested = () => {
  const [ticks, setTicks] = useState(0);
  return (
    <Case
      title="a component declared inside a render"
      what={
        <>
          A component written in the body of another one is a new type on every render. React cannot match it to what
          it had, so it unmounts the old subtree and mounts a new one: state is lost, the DOM is rebuilt, and effects
          run again. Type something into the notes, then press the button.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="render" onClick={() => setTicks((t) => t + 1)}>
          Render both panels
        </button>
        <span className="muted">clicked {ticks}×</span>
      </p>
      <div className="two">
        <Panel
          kind="broken"
          title="const Row = () => … inside"
          says="The recorder says: mounts, and DOM nodes added and removed on a page where nothing was added."
          code={BROKEN}
        >
          <Inside ticks={ticks} />
        </Panel>
        <Panel
          kind="fixed"
          title="the same component outside"
          says="The recorder says: two renders and no mounts — the rows are the rows they were."
          code={FIXED}
        >
          <Stable ticks={ticks} />
        </Panel>
      </div>
    </Case>
  );
};
