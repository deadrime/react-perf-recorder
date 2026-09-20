import { memo, useMemo, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

interface CardProps {
  name: string;
  style: { paddingLeft: number };
  tags: string[];
}

const Card = memo(({ name, style, tags }: CardProps) => {
  const renders = useRenderCount();
  return (
    <li style={style} data-testid={`card-${name}`}>
      <span className="grow">
        {name} <small className="muted">{tags.join(' · ')}</small>
      </span>
      <RenderCount n={renders} />
    </li>
  );
});

// Outside the component: written once, the same object forever.
const STYLE = { paddingLeft: 10 };
const NAMES = ['Anna', 'Boris', 'Chen'];

const Inline = ({ filter }: { filter: string }) => (
  <ul className="rows">
    {NAMES.map((name) => (
      // A fresh object and a fresh array on every render: memo compares them and finds them different every time.
      <Card key={name} name={name} style={{ paddingLeft: 10 }} tags={['design', filter]} />
    ))}
  </ul>
);

const Stable = ({ filter }: { filter: string }) => {
  // The array depends on something, so it is remembered until that something changes; the style depends on nothing.
  const tags = useMemo(() => ['design', filter], [filter]);
  return (
    <ul className="rows">
      {NAMES.map((name) => (
        <Card key={name} name={name} style={STYLE} tags={tags} />
      ))}
    </ul>
  );
};

export const Props = () => {
  const [ticks, setTicks] = useState(0);
  const [run, setRun] = useState(0);
  const [filter, setFilter] = useState('open');
  return (
    <Case
      title="a new object is a new prop"
      what={
        <>
          Both lists pass a <code>style</code> and a list of tags to the same <code>memo</code> card. Nothing about them
          changes when the panel renders — but on the left they are written inside the render, so every render builds a
          new object and a new array, and <code>memo</code> has nothing to hold on to.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="render" onClick={() => setTicks((t) => t + 1)}>
          Render both panels
        </button>
        <button type="button" data-testid="filter" onClick={() => setFilter((f) => (f === 'open' ? 'done' : 'open'))}>
          Change the tag ({filter})
        </button>
        <button
          type="button"
          data-testid="reset"
          onClick={() => {
            setTicks(0);
            setRun((r) => r + 1);
          }}
        >
          Start over
        </button>
        <span className="muted">rendered {ticks}×</span>
      </p>
      <div className="two">
        <Panel kind="broken" title="style={{…}} tags={[…]}" says="The recorder says: parent: props same: style, tags — same content, new references.">
          <Inline key={run} filter={filter} />
        </Panel>
        <Panel kind="fixed" title="a constant and a useMemo" says="The recorder says nothing until the tag really changes, and then it names it: parent: props tags.">
          <Stable key={run} filter={filter} />
        </Panel>
      </div>
    </Case>
  );
};
