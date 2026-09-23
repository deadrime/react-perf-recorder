import { memo, useCallback, useState } from 'react';
import { Case, createDriver, Panel, RenderCount, useRenderCount } from './Case';

interface Person {
  id: string;
  name: string;
}

const BROKEN = `
const Row = memo(({ person, onPick }) => …);

const List = () => {
  const [picked, setPicked] = useState(null);
  const onPick = (id) => setPicked(id);   // ← a new function on every render of List

  return PEOPLE.map((person) => <Row key={person.id} person={person} onPick={onPick} />);
};`;

const FIXED = `
const Row = memo(({ person, onPick }) => …);

const List = () => {
  const [picked, setPicked] = useState(null);
  const onPick = useCallback((id) => setPicked(id), []);   // ← the same function every time

  return PEOPLE.map((person) => <Row key={person.id} person={person} onPick={onPick} />);
};`;

const PEOPLE: Person[] = [
  { id: 'a', name: 'Anna' },
  { id: 'b', name: 'Boris' },
  { id: 'c', name: 'Chen' },
];

const Row = memo(({ person, onPick }: { person: Person; onPick: (id: string) => void }) => {
  const renders = useRenderCount();
  return (
    <li data-testid={`row-${person.id}`}>
      <span className="avatar">{person.name[0]}</span>
      <span className="grow">{person.name}</span>
      <button type="button" onClick={() => onPick(person.id)}>
        pick
      </button>
      <RenderCount n={renders} />
    </li>
  );
});

const ticks = createDriver(0);
// A new key mounts the lists again, which is how the counters are put back to one.
const run = createDriver(0);

/** The same list twice: the only difference is where the handler comes from. It renders with the button. */
const List = ({ stable }: { stable: boolean }) => {
  const clicked = ticks.use();
  const [picked, setPicked] = useState<string | null>(null);
  const stableOnPick = useCallback((id: string) => setPicked(id), []);
  // A new function on every render of the list: memo below compares it and finds it different every time.
  const freshOnPick = (id: string) => setPicked(id);
  return (
    <>
      <ul className="rows">
        {PEOPLE.map((person) => (
          <Row key={person.id} person={person} onPick={stable ? stableOnPick : freshOnPick} />
        ))}
      </ul>
      <p className="muted">
        picked: <b>{picked ?? '—'}</b> · list rendered {clicked + 1}×
      </p>
    </>
  );
};

const Clicked = () => <span className="muted">clicked {ticks.use()}×</span>;
const Lists = ({ stable }: { stable: boolean }) => <List key={run.use()} stable={stable} />;

export const MemoCallback = () => {
  return (
    <Case
      title="memo and useCallback"
      what={
        <>
          Both lists are the same three rows in <code>memo</code>. The left one is handed a handler written in the parent's render, so every render of
          the parent gives <code>memo</code> a prop it has never seen. The right one is handed the same function every time.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="render" onClick={() => ticks.set((t) => t + 1)}>
          Render both panels
        </button>
        <button
          type="button"
          data-testid="reset"
          title="Mounts both lists again, so the counters start over"
          onClick={() => {
            ticks.set(0);
            run.set((r) => r + 1);
          }}
        >
          Start over
        </button>
        <Clicked />
      </p>
      <div className="two">
        <Panel
          kind="broken"
          title="onPick written in render"
          says="The recorder says: parent: props same: onPick — the prop changed identity, not content."
          code={BROKEN}
        >
          <Lists stable={false} />
        </Panel>
        <Panel kind="fixed" title="onPick from useCallback" says="The recorder says nothing about these rows: they never render again." code={FIXED}>
          <Lists stable />
        </Panel>
      </div>
    </Case>
  );
};
