import { memo, useMemo, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from '../basics/Case';
import { SortableList, useSortable } from './sortable';

const BROKEN = `
<SortableList items={cards.map((card) => card.id)}>   {/* ← a new array each render: the package's context changes */}
  {cards.map((card) => <Card key={card.id} card={card} />)}
</SortableList>`;

const FIXED = `
const ids = useMemo(() => cards.map((card) => card.id), [cards]);   // ← the same array until the cards change

<SortableList items={ids}>
  {cards.map((card) => <Card key={card.id} card={card} />)}
</SortableList>`;

const CARDS = ['Design review', 'Fix login', 'Release notes', 'Update deps', 'Write tests', 'Plan sprint'].map((title, i) => ({
  id: `card-${i}`,
  title,
}));

/** A memo, and still it renders: useSortable reads the package's context, and memo does not stop a context. */
const Card = memo(({ card }: { card: { id: string; title: string } }) => {
  const at = useSortable(card.id);
  const renders = useRenderCount();
  return (
    <li>
      <span className="grow">
        {at + 1}. {card.title}
      </span>
      <RenderCount renders={renders} />
    </li>
  );
});

/** The board also holds a note being typed: each letter renders the board, and the board passes items down. */
const Board = ({ side, stable }: { side: string; stable: boolean }) => {
  const [note, setNote] = useState('');
  const ids = useMemo(() => CARDS.map((card) => card.id), []);
  return (
    <>
      <label className="field">
        <input data-testid={`note-${side}`} placeholder="a note on the board" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <ul className="rows">
        <SortableList items={stable ? ids : CARDS.map((card) => card.id)}>
          {CARDS.map((card) => (
            <Card key={card.id} card={card} />
          ))}
        </SortableList>
      </ul>
    </>
  );
};

export const LibraryContext = () => (
  <Case
    title="memo does not stop a package's context"
    what={
      <>
        The cards are <code>memo</code> and their props never change, yet on the left every card renders with each letter of the note. They call the
        package's hook, which reads its context, and the board hands the package a new array of ids on every render. A context reaches past memo. Seen
        on a dnd-kit kanban board: memo on the cards changed nothing until the ids handed to <code>SortableContext</code> kept their identity.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="items={cards.map(…)}"
        says="The recorder says: context (unnamed, provided by SortableList) SAME-CONTENT — on every card, for each letter."
        code={BROKEN}
      >
        <Board side="broken" stable={false} />
      </Panel>
      <Panel kind="fixed" title="items={ids} from useMemo" says="The recorder says nothing on the cards while the note is typed." code={FIXED}>
        <Board side="fixed" stable />
      </Panel>
    </div>
  </Case>
);
