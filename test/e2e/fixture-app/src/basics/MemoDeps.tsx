import { memo, useMemo } from 'react';
import { Case, createDriver, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Report = () => {
  const open = useOpenRows({ status: 'open' });   // ← a new object on every render…
  return <Table rows={open} />;
};

const useOpenRows = (filter) =>
  useMemo(() => ROWS.filter((r) => r.status === filter.status), [filter]);   // ← …so this never hits`;

const FIXED = `
const OPEN = { status: 'open' };   // ← made once

const Report = () => {
  const open = useOpenRows(OPEN);
  return <Table rows={open} />;
};`;

interface Row {
  id: number;
  title: string;
  status: 'open' | 'done';
}

const ROWS: Row[] = [
  { id: 1, title: 'Fix the picker scroll', status: 'open' },
  { id: 2, title: 'Ship the timeline', status: 'done' },
  { id: 3, title: 'Record the page load', status: 'open' },
  { id: 4, title: 'Name the default export', status: 'open' },
];

const OPEN = { status: 'open' as const };

const renders = createDriver(0);
const computed = { broken: 0, fixed: 0 };

/** Filters the rows, remembered by the filter object: it holds only as long as the object is the same one. */
function useOpenRows(filter: { status: Row['status'] }, side: keyof typeof computed) {
  return useMemo(() => {
    computed[side] += 1;
    return ROWS.filter((r) => r.status === filter.status);
  }, [filter, side]);
}

const Table = memo(({ rows }: { rows: Row[] }) => (
  <ul className="rows">
    {rows.map((row) => (
      <TableRow key={row.id} row={row} />
    ))}
  </ul>
));

const TableRow = ({ row }: { row: Row }) => (
  <li>
    <span className="grow">{row.title}</span>
    <RenderCount n={useRenderCount()} />
  </li>
);

const Computed = ({ side }: { side: keyof typeof computed }) => (
  <p className="muted" data-computed={computed[side]}>
    filtered {computed[side]}×
  </p>
);

/** Renders with the button, as a dashboard does with whatever above it changed. */
const InlineReport = () => {
  renders.use();
  const open = useOpenRows({ status: 'open' }, 'broken');
  return (
    <>
      <Computed side="broken" />
      <Table rows={open} />
    </>
  );
};

const ConstantReport = () => {
  renders.use();
  const open = useOpenRows(OPEN, 'fixed');
  return (
    <>
      <Computed side="fixed" />
      <Table rows={open} />
    </>
  );
};

const Clicked = () => <span className="muted">rendered {renders.use()}×</span>;

export const MemoDeps = () => (
  <Case
    title="a useMemo that never remembers"
    what={
      <>
        Both reports keep the open rows in a <code>useMemo</code> and hand them to a table in <code>memo</code>. On the left the filter it depends on
        is an object written in the render: a new one every time, so the memo computes again, returns a new array, and the table renders with it. The
        memo is there and does nothing.
      </>
    }
  >
    <p className="bar">
      <button type="button" data-testid="render" onClick={() => renders.set((n) => n + 1)}>
        Render both reports
      </button>
      <Clicked />
    </p>
    <div className="two">
      <Panel
        kind="broken"
        title="useMemo(…, [{ status }])"
        says="The recorder says: parent: props same: rows — a new array with the same rows in it."
        code={BROKEN}
      >
        <InlineReport />
      </Panel>
      <Panel kind="fixed" title="a filter made once" says="The recorder says: the report renders, and the table does not." code={FIXED}>
        <ConstantReport />
      </Panel>
    </div>
  </Case>
);
