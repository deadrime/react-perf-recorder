import { useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Team = () => {
  const [people, setPeople] = useState([]);
  const load = async () => {
    for (const id of IDS) {
      const person = await fetchPerson(id);
      setPeople((people) => [...people, person]);   // ← a commit, and the whole list again, per response
    }
  };
  return <List people={people} onLoad={load} />;
};`;

const FIXED = `
const Team = () => {
  const [people, setPeople] = useState([]);
  const load = async () => {
    const all = await Promise.all(IDS.map(fetchPerson));   // ← asked at once
    setPeople(all);                                        // ← one commit
  };
  return <List people={people} onLoad={load} />;
};`;

interface Person {
  id: number;
  name: string;
}

const NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Frances'];
const IDS = NAMES.map((_, i) => i + 1);

/** A request that comes back in its own task, as a real one does; a data: URL needs no server. */
async function fetchPerson(id: number): Promise<Person> {
  const res = await fetch(`data:application/json,${encodeURIComponent(JSON.stringify({ id, name: NAMES[id - 1] }))}`);
  return res.json();
}

/** Not memoized, as most rows are: every render of the list renders each of them. */
const PersonRow = ({ side, person }: { side: string; person: Person }) => (
  <li>
    <span className="grow">{person.name}</span>
    <RenderCount renders={useRenderCount()} />
    <span hidden data-testid={`row-${side}-${person.id}`} />
  </li>
);

const List = ({ side, people, onLoad }: { side: string; people: Person[]; onLoad: () => void }) => {
  const renders = useRenderCount();
  return (
    <div className="stack">
      <button data-testid={`load-${side}`} onClick={onLoad}>
        Load the team
      </button>
      <ul className="rows">
        <li>
          <span className="grow muted" data-testid={`people-${side}`}>
            {people.length} of {IDS.length} loaded
          </span>
          <RenderCount renders={renders} />
        </li>
        {people.map((person) => (
          <PersonRow key={person.id} side={side} person={person} />
        ))}
      </ul>
    </div>
  );
};

/** Each response goes into state as it lands: eight commits for one click, and the list renders every row so far. */
const TeamOneByOne = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const load = async () => {
    setPeople([]);
    for (const id of IDS) {
      const person = await fetchPerson(id);
      setPeople((current) => [...current, person]);
    }
  };
  return <List side="each" people={people} onLoad={load} />;
};

/** The requests go out together and their answers go into state once. */
const TeamAtOnce = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const load = async () => {
    setPeople([]);
    setPeople(await Promise.all(IDS.map(fetchPerson)));
  };
  return <List side="all" people={people} onLoad={load} />;
};

export const Responses = () => (
  <Case
    title="a setState for every response"
    what={
      <>
        Both buttons load the same eight people. On the left each answer goes into state as it comes back, so one click is a commit per person, and
        the list renders every row it has each time. On the right the requests go out at once and their answers go into state together: one commit
        after the click. Showing items as they arrive is sometimes the point; then memoize the rows, so each answer renders only its own.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="setPeople after every await"
        says="The recorder says: nine commits for one click, the click's and one per response, caused by core:update load, with TeamOneByOne as the root."
        code={BROKEN}
      >
        <TeamOneByOne />
      </Panel>
      <Panel kind="fixed" title="Promise.all, then one setPeople" says="The recorder says: two commits, the click's and the answers'." code={FIXED}>
        <TeamAtOnce />
      </Panel>
    </div>
  </Case>
);
