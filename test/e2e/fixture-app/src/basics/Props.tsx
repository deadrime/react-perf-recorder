import { memo, useMemo, type ReactNode } from 'react';
import { Case, createDriver, Pair, Panel, RenderCount, useRenderCount } from './Case';

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

const BROKEN = `
{NAMES.map((name) => (
  <Card
    key={name}
    name={name}
    style={{ paddingLeft: 10 }}   // ← a new object on every render
    tags={['design', filter]}     // ← and a new array
  />
))}`;

const FIXED = `
const STYLE = { paddingLeft: 10 };   // ← written once, outside the component

const Stable = ({ filter }) => {
  const tags = useMemo(() => ['design', filter], [filter]);   // ← remembered until the filter changes

  return NAMES.map((name) => <Card key={name} name={name} style={STYLE} tags={tags} />);
};`;

const BROKEN_ELEMENT = `
{NAMES.map((name) => (
  <Badge key={name} name={name} icon={<Star />} />   // ← <Star /> is an object, and a new one every render
))}`;

const FIXED_ELEMENT = `
const STAR = <Star />;   // ← one element, made once

{NAMES.map((name) => <Badge key={name} name={name} icon={STAR} />)}`;

// Outside the component: written once, the same object forever.
const STYLE = { paddingLeft: 10 };
const NAMES = ['Anna', 'Boris', 'Chen'];

const ticks = createDriver(0);
const run = createDriver(0);
const filters = createDriver('open');

/** The lists render with the button: they are the panel whose render the cards are handed props from. */
const useFilter = () => {
  ticks.use();
  return filters.use();
};

const Inline = () => {
  const filter = useFilter();
  return (
    <ul className="rows">
      {NAMES.map((name) => (
        // A fresh object and a fresh array on every render: memo compares them and finds them different every time.
        <Card key={name} name={name} style={{ paddingLeft: 10 }} tags={['design', filter]} />
      ))}
    </ul>
  );
};

const Stable = () => {
  const filter = useFilter();
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

const Star = () => <span aria-hidden="true">★</span>;

/** Takes an icon as an element: a slot, the way a button, a menu item or a card header does. */
const Badge = memo(({ name, icon }: { name: string; icon: ReactNode }) => {
  const renders = useRenderCount();
  return (
    <li>
      <span className="grow">
        {icon} {name}
      </span>
      <RenderCount n={renders} />
    </li>
  );
});

// The element itself, made once: JSX is a call that returns an object, and this is the object.
const STAR = <Star />;

const InlineIcon = () => {
  useFilter();
  return (
    <ul className="rows">
      {NAMES.map((name) => (
        <Badge key={name} name={name} icon={<Star />} />
      ))}
    </ul>
  );
};

const HoistedIcon = () => {
  useFilter();
  return (
    <ul className="rows">
      {NAMES.map((name) => (
        <Badge key={name} name={name} icon={STAR} />
      ))}
    </ul>
  );
};

const Rendered = () => <span className="muted">rendered {ticks.use()}×</span>;
const FilterButton = () => {
  const filter = filters.use();
  return (
    <button type="button" data-testid="filter" onClick={() => filters.set((f) => (f === 'open' ? 'done' : 'open'))}>
      Change the tag ({filter})
    </button>
  );
};
/** A new key mounts the list again, which is how the counters are put back to one. */
const Fresh = ({ children }: { children: (run: number) => ReactNode }) => <>{children(run.use())}</>;

export const Props = () => {
  return (
    <Case
      title="a new object is a new prop"
      what={
        <>
          Every list passes its <code>memo</code> rows something that does not change when the panel renders — but on the left it is written inside
          the render, so every render builds a new one, and <code>memo</code> has nothing to hold on to. An object, an array, and — the one nobody
          sees — a JSX element: <code>{'<Star />'}</code> is an object too.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="render" onClick={() => ticks.set((t) => t + 1)}>
          Render the panels
        </button>
        <FilterButton />
        <button
          type="button"
          data-testid="reset"
          onClick={() => {
            ticks.set(0);
            run.set((r) => r + 1);
          }}
        >
          Start over
        </button>
        <Rendered />
      </p>
      <Pair id="objects" title="an object or an array">
        <Panel
          kind="broken"
          title="style={{…}} tags={[…]}"
          says="The recorder says: parent: props same: style, tags — same content, new references."
          code={BROKEN}
        >
          <Fresh>{(key) => <Inline key={key} />}</Fresh>
        </Panel>
        <Panel
          kind="fixed"
          title="a constant and a useMemo"
          says="The recorder says nothing until the tag really changes, and then it names it: parent: props tags."
          code={FIXED}
        >
          <Fresh>{(key) => <Stable key={key} />}</Fresh>
        </Panel>
      </Pair>
      <Pair id="element" title="an element is an object too">
        <Panel
          kind="broken"
          title="icon={<Star />}"
          says="The recorder says: parent: props same: icon — the badge got a new element that draws the same star."
          code={BROKEN_ELEMENT}
        >
          <Fresh>{(key) => <InlineIcon key={key} />}</Fresh>
        </Panel>
        <Panel
          kind="fixed"
          title="icon={STAR}"
          says="The recorder says nothing: the same element every time, so memo skips the badge."
          code={FIXED_ELEMENT}
        >
          <Fresh>{(key) => <HoistedIcon key={key} />}</Fresh>
        </Panel>
      </Pair>
    </Case>
  );
};
