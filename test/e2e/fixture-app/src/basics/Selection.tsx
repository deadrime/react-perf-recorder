import { memo, useCallback, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Row = memo(({ item, selectedId, onSelect }) => (
  <li className={item.id === selectedId ? 'on' : ''}>…</li>   // ← every row asks the question itself
));

const List = () => {
  const [selectedId, setSelectedId] = useState(null);
  const onSelect = useCallback((id) => setSelectedId(id), []);
  return ITEMS.map((item) => (
    <Row key={item.id} item={item} selectedId={selectedId} onSelect={onSelect} />
  ));
};`;

const FIXED = `
const Row = memo(({ item, selected, onSelect }) => (
  <li className={selected ? 'on' : ''}>…</li>
));

const List = () => {
  const [selectedId, setSelectedId] = useState(null);
  const onSelect = useCallback((id) => setSelectedId(id), []);
  return ITEMS.map((item) => (
    <Row key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />   // ← the answer
  ));
};`;

interface Item {
  id: string;
  title: string;
}

const ITEMS: Item[] = ['Inbox', 'Drafts', 'Sent', 'Archive', 'Spam', 'Trash'].map((title) => ({ id: title.toLowerCase(), title }));

const Line = ({ item, on, onSelect, side }: { item: Item; on: boolean; onSelect: (id: string) => void; side: string }) => (
  <li className={on ? 'row on' : 'row'}>
    <button type="button" className="grow link" data-testid={`${side}-${item.id}`} onClick={() => onSelect(item.id)}>
      {on ? '● ' : ''}
      {item.title}
    </button>
    <RenderCount renders={useRenderCount()} />
  </li>
);

/** Gets the selected id and works out for itself whether it is the one: a new prop for every row on every pick. */
const AskingRow = memo(({ item, selectedId, onSelect }: { item: Item; selectedId: string | null; onSelect: (id: string) => void }) => (
  <Line item={item} on={item.id === selectedId} onSelect={onSelect} side="asking" />
));

/** Gets the answer: only the row that was picked and the one that stopped being picked see a new prop. */
const ToldRow = memo(({ item, selected, onSelect }: { item: Item; selected: boolean; onSelect: (id: string) => void }) => (
  <Line item={item} on={selected} onSelect={onSelect} side="told" />
));

const AskingList = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  return (
    <ul className="rows" data-testid="list-asking">
      {ITEMS.map((item) => (
        <AskingRow key={item.id} item={item} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
};

const ToldList = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  return (
    <ul className="rows" data-testid="list-told">
      {ITEMS.map((item) => (
        <ToldRow key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
};

export const Selection = () => (
  <Case
    title="pass the answer, not the question"
    what={
      <>
        Both lists keep the selected id and hand it down to rows in <code>memo</code>. On the left each row gets the id and checks it itself, so a new
        selection is a new prop for every row. On the right the list asks the question once and hands each row its answer: a pick changes it for two
        rows. Pick a few in each.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="selectedId={selectedId}"
        says="The recorder says: parent: props selectedId on every row, on every pick."
        code={BROKEN}
      >
        <AskingList />
      </Panel>
      <Panel
        kind="fixed"
        title="selected={item.id === selectedId}"
        says="The recorder says: two rows per pick — the one picked and the one that was."
        code={FIXED}
      >
        <ToldList />
      </Panel>
    </div>
  </Case>
);
