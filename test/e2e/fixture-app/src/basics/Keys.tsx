import { memo, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

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

type Mode = 'index' | 'id' | 'random';

const MODES: Array<{ mode: Mode; kind: 'broken' | 'fixed'; title: string; says: string }> = [
  {
    mode: 'index',
    kind: 'broken',
    title: 'key={index}',
    says: 'The recorder says: parent: props task on every row — React matched them by position, so each row got someone else’s data.',
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
    says: 'The recorder says: mounts, and DOM nodes added and removed — every row is thrown away and built again.',
  },
];

/** Each row keeps a little state of its own, so it is visible where React thinks the row went. */
const Row = memo(({ task }: { task: Task }) => {
  const renders = useRenderCount();
  const [done, setDone] = useState(false);
  return (
    <li data-testid={`task-${task.id}`}>
      <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
      <span className="grow">{task.title}</span>
      <RenderCount n={renders} />
    </li>
  );
});

const keyOf = (mode: Mode, task: Task, index: number) => (mode === 'index' ? index : mode === 'id' ? task.id : Math.random());

const List = ({ mode, tasks }: { mode: Mode; tasks: Task[] }) => (
  <ul className="rows" data-testid={`list-${mode}`}>
    {tasks.map((task, index) => (
      <Row key={keyOf(mode, task, index)} task={task} />
    ))}
  </ul>
);

export const Keys = () => {
  const [tasks, setTasks] = useState(START);
  // Starting over means forgetting everything the rows remember, and a key change is exactly how that is asked for —
  // the one honest use of a key that is not an id.
  const [run, setRun] = useState(0);
  return (
    <Case
      title="key: the position or the thing"
      what={
        <>
          Three copies of one list of tasks, each row in <code>memo</code> with a checkbox of its own. The only
          difference is what goes into <code>key</code>. Tick a few boxes, then add a task at the top and watch where
          the ticks end up.
        </>
      }
    >
      <p className="bar">
        <button type="button" data-testid="prepend" onClick={() => setTasks((t) => [{ id: `n${++added}`, title: `New task ${added}` }, ...t])}>
          Add at the top
        </button>
        <button type="button" data-testid="remove" onClick={() => setTasks((t) => t.filter((_, i) => i !== Math.floor(t.length / 2)))}>
          Remove the middle one
        </button>
        <button
          type="button"
          data-testid="reset"
          title="Puts the tasks back and mounts the lists again, so the counters and the ticks start over"
          onClick={() => {
            setTasks(START);
            setRun((r) => r + 1);
          }}
        >
          Start over
        </button>
      </p>
      <div className="three">
        {MODES.map(({ mode, kind, title, says }) => (
          <Panel key={mode} kind={kind} title={title} says={says}>
            <List key={run} mode={mode} tasks={tasks} />
          </Panel>
        ))}
      </div>
    </Case>
  );
};
