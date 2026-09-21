import { memo, useCallback, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

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

/** The same list twice: the only difference is where the handler comes from. */
const List = ({ stable, ticks }: { stable: boolean; ticks: number }) => {
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
        picked: <b>{picked ?? '—'}</b> · panel rendered {ticks + 1}×
      </p>
    </>
  );
};

export const MemoCallback = () => {
  const [ticks, setTicks] = useState(0);
  // A new key mounts the lists again, which is how the counters are put back to one.
  const [run, setRun] = useState(0);
  return (
    <Case
      title="memo and useCallback"
      what={
        <>
          Both lists are the same three rows in <code>memo</code>. The left one is handed a handler written in the
          parent's render, so every render of the parent gives <code>memo</code> a prop it has never seen. The right one
          is handed the same function every time.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="render" onClick={() => setTicks((t) => t + 1)}>
          Render both panels
        </button>
        <button
          type="button"
          data-testid="reset"
          title="Mounts both lists again, so the counters start over"
          onClick={() => {
            setTicks(0);
            setRun((r) => r + 1);
          }}
        >
          Start over
        </button>
        <span className="muted">clicked {ticks}×</span>
      </p>
      <div className="two">
        <Panel
          kind="broken"
          title="onPick written in render"
          says="The recorder says: parent: props same: onPick — the prop changed identity, not content."
          code={BROKEN}
        >
          <List key={run} stable={false} ticks={ticks} />
        </Panel>
        <Panel
          kind="fixed"
          title="onPick from useCallback"
          says="The recorder says nothing about these rows: they never render again."
          code={FIXED}
        >
          <List key={run} stable ticks={ticks} />
        </Panel>
      </div>
    </Case>
  );
};
