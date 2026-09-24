import { memo, useState } from 'react';
import { Case, createDriver, MountCount, Panel, RenderCount, useRenderCount } from './Case';

interface Task {
  id: string;
  title: string;
}

const START: Task[] = [
  { id: 't1', title: 'Write the release notes' },
  { id: 't2', title: 'Review the picker tree' },
  { id: 't3', title: 'Record the page load' },
];

let added = 0;

/**
 * How many times each task has been mounted in each list. Counted while the row renders for the first time, not in
 * an effect: an effect would only tell the page about a mount after the screen had already been painted.
 */
const mounts = new Map<string, number>();

function useMountNumber(mode: Mode, id: string) {
  const [n] = useState(() => {
    const next = (mounts.get(`${mode}:${id}`) ?? 0) + 1;
    mounts.set(`${mode}:${id}`, next);
    return next;
  });
  return n;
}

type Mode = 'index' | 'id' | 'random';

const CODE: Record<Mode, string> = {
  index: `
{tasks.map((task, index) => (
  <Row key={index} task={task} />   // ← the key is the place in the list, not the task
))}`,
  id: `
{tasks.map((task) => (
  <Row key={task.id} task={task} />   // ← the key is the task itself
))}`,
  random: `
{tasks.map((task) => (
  <Row key={Math.random()} task={task} />   // ← a key that never matches anything again
))}`,
};

const MODES: Array<{ mode: Mode; kind: 'broken' | 'fixed'; title: string; says: string }> = [
  {
    mode: 'index',
    kind: 'broken',
    title: 'key={index}',
    says: 'The recorder says: parent: props task on every row — React matched them by position, so each row got someone else’s data, and the task pushed off the end was mounted a second time.',
  },
  {
    mode: 'id',
    kind: 'fixed',
    title: 'key={task.id}',
    says: 'The recorder says: one mount and nothing else — the rows that did not change were skipped.',
  },
  {
    mode: 'random',
    kind: 'broken',
    title: 'key={Math.random()}',
    says: 'The recorder says: mounts, and DOM nodes added and removed. Watch the mounted counter: the rows are not being skipped, they are new every time.',
  },
];

/** Each row keeps a little state of its own, so it is visible where React thinks the row went. */
const Row = memo(({ task, mode }: { task: Task; mode: Mode }) => {
  const renders = useRenderCount();
  const mounted = useMountNumber(mode, task.id);
  const [done, setDone] = useState(false);
  return (
    <li data-testid={`task-${task.id}`}>
      <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
      <span className="grow">{task.title}</span>
      <RenderCount renders={renders} />
      <MountCount mounts={mounted} />
    </li>
  );
});

const keyOf = (mode: Mode, task: Task, index: number) => (mode === 'index' ? index : mode === 'id' ? task.id : Math.random());

const tasks = createDriver(START);
// Starting over means forgetting everything the rows remember, and a key change is exactly how that is asked for —
// the one honest use of a key that is not an id.
const run = createDriver(0);

/** The list reads the tasks itself, as a list under a store would: only it renders when they change. */
const List = ({ mode }: { mode: Mode }) => (
  <ul className="rows" data-testid={`list-${mode}`}>
    {tasks.use().map((task, index) => (
      <Row key={keyOf(mode, task, index)} task={task} mode={mode} />
    ))}
  </ul>
);

const Lists = ({ mode }: { mode: Mode }) => <List key={run.use()} mode={mode} />;

export const Keys = () => {
  return (
    <Case
      title="key: the position or the thing"
      what={
        <>
          Three copies of one list of tasks, each row in <code>memo</code> with a checkbox of its own. The only difference is what goes into{' '}
          <code>key</code>. Tick a few boxes, then add a task at the top and watch where the ticks end up.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="prepend" onClick={() => tasks.set((t) => [{ id: `n${++added}`, title: `New task ${added}` }, ...t])}>
          Add at the top
        </button>
        <button type="button" data-testid="remove" onClick={() => tasks.set((t) => t.filter((_, i) => i !== Math.floor(t.length / 2)))}>
          Remove the middle one
        </button>
        <button
          type="button"
          data-testid="reset"
          title="Puts the tasks back and mounts the lists again, so the counters and the ticks start over"
          onClick={() => {
            mounts.clear();
            tasks.set(START);
            run.set((r) => r + 1);
          }}
        >
          Start over
        </button>
      </p>
      <div className="three">
        {MODES.map(({ mode, kind, title, says }) => (
          <Panel key={mode} kind={kind} title={title} says={says} code={CODE[mode]}>
            <Lists mode={mode} />
          </Panel>
        ))}
      </div>
    </Case>
  );
};
