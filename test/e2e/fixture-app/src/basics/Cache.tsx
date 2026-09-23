import { useEffect } from 'react';
import { memoizeWithArgs } from 'proxy-memoize';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const selectTask = memoizeWithArgs(
  (s, id) => ({ ...s.tasks[id], id }),
  { size: 2 }   // ← two slots for four rows: each row pushes out another one's answer
);

const Task = ({ id }) => <li>{useStore(board, (s) => selectTask(s, id)).title}</li>;`;

const FIXED = `
const selectTask = memoizeWithArgs(
  (s, id) => ({ ...s.tasks[id], id }),
  { size: 50 }   // ← room for every row there can be, not every row there is today
);`;

interface Task {
  title: string;
  done: boolean;
}

interface Board {
  tasks: Record<string, Task>;
  /** Moves on every update and is shown nowhere: the kind of field a store is full of. */
  seen: number;
}

const IDS = ['a', 'b', 'c', 'd'];

const board = createStore<Board>(() => ({
  tasks: {
    a: { title: 'Write the release notes', done: false },
    b: { title: 'Review the picker tree', done: true },
    c: { title: 'Record the page load', done: false },
    d: { title: 'Answer the thread', done: false },
  },
  seen: 0,
}));

const useUpdates = () =>
  useEffect(() => {
    const id = setInterval(() => board.setState((s) => ({ seen: s.seen + 1 })), 500);
    return () => clearInterval(id);
  }, []);

/**
 * The same selector twice, cached by the row's id. proxy-memoize remembers which fields an answer read, so a store
 * update that touched none of them gives the row the answer it had — if that answer is still in the cache.
 */
const selectTight = memoizeWithArgs((s: Board, id: string) => ({ ...s.tasks[id], id }), { size: 2 });
const selectRoomy = memoizeWithArgs((s: Board, id: string) => ({ ...s.tasks[id], id }), { size: 50 });

const Row = ({ task, renders }: { task: Task; renders: number }) => (
  <li>
    <span className="grow">
      {task.done ? '✓ ' : ''}
      {task.title}
    </span>
    <RenderCount n={renders} />
  </li>
);

const TightRow = ({ id }: { id: string }) => <Row task={useStore(board, (s) => selectTight(s, id))} renders={useRenderCount()} />;
const RoomyRow = ({ id }: { id: string }) => <Row task={useStore(board, (s) => selectRoomy(s, id))} renders={useRenderCount()} />;

export const Cache = () => {
  useUpdates();
  return (
    <Case
      title="a cache smaller than the data"
      what={
        <>
          Four rows read their task through one memoized selector, cached by the row's id. The store updates twice a
          second with something no row shows, so every row should keep its answer — and on the right it does. On the
          left the cache has two slots for four ids: each row evicts another row's answer, every call computes a new
          object, and every row renders. It is the bug of a list that outgrew the cache it was written with.
        </>
      }
    >
      <div className="two">
        <Panel
          kind="broken"
          title="{ size: 2 } for four rows"
          says="The recorder says: selectTight — every call recomputes, 4 argument sets > cache size 2 — and the rows render SAME-CONTENT."
          code={BROKEN}
        >
          <ul className="rows">
            {IDS.map((id) => (
              <TightRow key={id} id={id} />
            ))}
          </ul>
        </Panel>
        <Panel kind="fixed" title="{ size: 50 }" says="The recorder says nothing: every row gets back the object it already had." code={FIXED}>
          <ul className="rows">
            {IDS.map((id) => (
              <RoomyRow key={id} id={id} />
            ))}
          </ul>
        </Panel>
      </div>
    </Case>
  );
};
