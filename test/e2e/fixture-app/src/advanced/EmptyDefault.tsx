import { memo } from 'react';
import { Case, createDriver, Panel, RenderCount, useRenderCount } from '../basics/Case';

const BROKEN = `
{spans.map((span) => (
  <Row
    key={span.id}
    selected={span.id === selectedId}
    marks={marksById.get(span.id) ?? []}   // ← a new [] for every row without marks, every render
  />
))}`;

const FIXED = `
const NO_MARKS = [];   // ← one empty array, shared

{spans.map((span) => (
  <Row key={span.id} selected={span.id === selectedId} marks={marksById.get(span.id) ?? NO_MARKS} />
))}`;

const IDS = Array.from({ length: 60 }, (_, i) => `span-${i}`);
// Few rows carry marks, as few spans lie on a trace's critical path.
const MARKS = new Map([
  ['span-3', ['critical']],
  ['span-17', ['critical']],
]);
const NO_MARKS: string[] = [];

const selected = createDriver(0);

const Row = memo(({ id, selected, marks }: { id: string; selected: boolean; marks: string[] }) => {
  const renders = useRenderCount();
  return (
    <li className={selected ? 'selected' : undefined}>
      <span className="grow">
        {id} {marks.length ? <small className="muted">{marks.join(' ')}</small> : null}
      </span>
      <RenderCount renders={renders} />
    </li>
  );
});

const FreshDefault = () => {
  const at = selected.use();
  return (
    <ul className="rows scroll">
      {IDS.map((id, i) => (
        <Row key={id} id={id} selected={i === at} marks={MARKS.get(id) ?? []} />
      ))}
    </ul>
  );
};

const SharedDefault = () => {
  const at = selected.use();
  return (
    <ul className="rows scroll">
      {IDS.map((id, i) => (
        <Row key={id} id={id} selected={i === at} marks={MARKS.get(id) ?? NO_MARKS} />
      ))}
    </ul>
  );
};

export const EmptyDefault = () => (
  <Case
    title="an empty default is a new array"
    what={
      <>
        Every row is a <code>memo</code>, and selecting one should render two: the one that stops being selected and the one that starts. On the left
        most rows get <code>?? []</code> for their marks — a new empty array each render — so memo sees a new prop on all sixty. Seen in Jaeger UI: on
        a trace of six thousand spans, a click on one span rendered every row, 12,000 renders instead of 150.
      </>
    }
  >
    <p className="bar">
      <button type="button" data-testid="select-next" onClick={() => selected.set((i) => (i + 1) % IDS.length)}>
        Select the next row
      </button>
    </p>
    <div className="two">
      <Panel
        kind="broken"
        title="marks ?? []"
        says="The recorder says: parent: props new ref, same content: marks — on every row, for a click on one."
        code={BROKEN}
      >
        <FreshDefault />
      </Panel>
      <Panel
        kind="fixed"
        title="marks ?? NO_MARKS"
        says="The recorder says: parent: props selected — on the two rows whose selection changed, and nothing on the rest."
        code={FIXED}
      >
        <SharedDefault />
      </Panel>
    </div>
  </Case>
);
